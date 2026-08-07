import * as vscode from 'vscode';
import * as path from 'path';
import { ITracerAdapter, ExecutionEvent } from '../adapters/Adapter';
import { PythonAdapter } from '../adapters/python/PythonAdapter';
import { JavascriptAdapter } from '../adapters/javascript/JavascriptAdapter';
import { buildWebviewHtml } from './webviewHtml';

/** Extensions we can trace, mapped to the language id sent to the UI. */
const SUPPORTED_LANGUAGES: Record<string, string> = {
    '.js': 'javascript',
    '.py': 'python'
};

/**
 * How long to accumulate tracer events before shipping them to the webview.
 * Posting each event individually caused one React render per executed line —
 * thousands of renders during a single trace.
 */
const EVENT_FLUSH_MS = 60;

export class ExecutionManager {
    private panel: vscode.WebviewPanel | undefined;
    private currentAdapter: ITracerAdapter | undefined;

    /** The webview only starts listening once its script has run; anything sent
     *  before that is dropped by VS Code, so outbound messages are queued. */
    private webviewReady = false;
    private outbox: unknown[] = [];

    private pendingEvents: ExecutionEvent[] = [];
    private flushTimer: NodeJS.Timeout | undefined;
    private panelDisposables: vscode.Disposable[] = [];

    constructor(private readonly extensionUri: vscode.Uri) {}

    public async startVisualization(filePath: string): Promise<void> {
        await this.ensurePanel();

        this.stopCurrentAdapter();

        const ext = path.extname(filePath).toLowerCase();
        const language = SUPPORTED_LANGUAGES[ext];
        if (!language) {
            this.post({ command: 'UNSUPPORTED_FILE', payload: { ext } });
            vscode.window.showErrorMessage(
                `Cannot visualize '${ext || 'this file'}'. Open a JavaScript (.js) or Python (.py) file.`
            );
            return;
        }

        let code: string;
        try {
            const bytes = await vscode.workspace.fs.readFile(vscode.Uri.file(filePath));
            code = Buffer.from(bytes).toString('utf8');
        } catch (err) {
            vscode.window.showErrorMessage(`Could not read ${path.basename(filePath)}: ${err}`);
            return;
        }

        this.post({
            command: 'EXECUTION_START',
            payload: { code, fileName: path.basename(filePath), language }
        });

        const adapter = language === 'python'
            ? new PythonAdapter(this.extensionUri)
            : new JavascriptAdapter(this.extensionUri);
        this.currentAdapter = adapter;

        adapter.on('event', (event: ExecutionEvent) => this.queueEvent(event));

        adapter.on('failure', (message: string) => {
            this.flushEvents();
            this.post({ command: 'EXECUTION_FAILED', payload: { message } });
            vscode.window.showErrorMessage(message);
        });

        adapter.on('close', () => this.flushEvents());

        try {
            adapter.start(filePath);
        } catch (err) {
            const message = `Failed to start the tracer: ${err}`;
            this.post({ command: 'EXECUTION_FAILED', payload: { message } });
            vscode.window.showErrorMessage(message);
        }
    }

    // --- webview plumbing -------------------------------------------------

    private async ensurePanel(): Promise<void> {
        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.Two, true);
            return;
        }

        const distUri = vscode.Uri.joinPath(this.extensionUri, 'webview-ui', 'dist');
        this.panel = vscode.window.createWebviewPanel(
            'codeExecutionVisualizer',
            'Execution Dashboard',
            { viewColumn: vscode.ViewColumn.Two, preserveFocus: true },
            {
                enableScripts: true,
                localResourceRoots: [distUri],
                retainContextWhenHidden: true
            }
        );

        this.webviewReady = false;
        this.outbox = [];

        this.panelDisposables.push(
            this.panel.webview.onDidReceiveMessage((message) => {
                if (message?.command === 'WEBVIEW_READY') this.drainOutbox();
            })
        );

        this.panelDisposables.push(
            this.panel.onDidDispose(() => {
                this.panel = undefined;
                this.webviewReady = false;
                this.outbox = [];
                this.stopCurrentAdapter();
                this.clearFlushTimer();
                this.disposePanelListeners();
            })
        );

        this.panel.webview.html = await this.renderHtml(this.panel.webview, distUri);
    }

    private async renderHtml(webview: vscode.Webview, distUri: vscode.Uri): Promise<string> {
        const indexUri = vscode.Uri.joinPath(distUri, 'index.html');
        const raw = Buffer.from(await vscode.workspace.fs.readFile(indexUri)).toString('utf8');
        return buildWebviewHtml(raw, webview.asWebviewUri(distUri).toString(), webview.cspSource);
    }

    /** Sends a message, holding it back until the webview reports it is listening. */
    private post(message: unknown): void {
        if (!this.panel) return;
        if (!this.webviewReady) {
            this.outbox.push(message);
            return;
        }
        void this.panel.webview.postMessage(message);
    }

    private drainOutbox(): void {
        this.webviewReady = true;
        const queued = this.outbox;
        this.outbox = [];
        for (const message of queued) {
            void this.panel?.webview.postMessage(message);
        }
    }

    // --- event batching ---------------------------------------------------

    private queueEvent(event: ExecutionEvent): void {
        this.pendingEvents.push(event);

        // Terminal events end the run, so don't make the UI wait on a timer.
        if (event.type === 'END' || event.type === 'ERROR' || event.type === 'LIMIT') {
            this.flushEvents();
            return;
        }

        if (!this.flushTimer) {
            this.flushTimer = setTimeout(() => this.flushEvents(), EVENT_FLUSH_MS);
        }
    }

    private flushEvents(): void {
        this.clearFlushTimer();
        if (this.pendingEvents.length === 0) return;

        const events = this.pendingEvents;
        this.pendingEvents = [];
        this.post({ command: 'EXECUTION_EVENTS', payload: { events } });
    }

    private clearFlushTimer(): void {
        if (this.flushTimer) {
            clearTimeout(this.flushTimer);
            this.flushTimer = undefined;
        }
    }

    // --- lifecycle --------------------------------------------------------

    private stopCurrentAdapter(): void {
        if (this.currentAdapter) {
            this.currentAdapter.removeAllListeners();
            this.currentAdapter.stop();
            this.currentAdapter = undefined;
        }
        this.clearFlushTimer();
        this.pendingEvents = [];
    }

    private disposePanelListeners(): void {
        for (const disposable of this.panelDisposables) disposable.dispose();
        this.panelDisposables = [];
    }

    public dispose(): void {
        this.stopCurrentAdapter();
        this.disposePanelListeners();
        this.panel?.dispose();
        this.panel = undefined;
    }
}
