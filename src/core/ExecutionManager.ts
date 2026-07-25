import * as vscode from 'vscode';
import * as path from 'path';
import { ITracerAdapter } from '../adapters/Adapter';
import { PythonAdapter } from '../adapters/python/PythonAdapter';
import { JavascriptAdapter } from '../adapters/javascript/JavascriptAdapter';

export class ExecutionManager {
  private panel: vscode.WebviewPanel | undefined;
  private currentAdapter: ITracerAdapter | undefined;
  private executionEvents: any[] = [];

  constructor(private readonly extensionUri: vscode.Uri) {}

  public async startVisualization(filePath: string) {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Two);
    } else {
      this.panel = vscode.window.createWebviewPanel(
        'codeExecutionVisualizer',
        'Execution Dashboard',
        vscode.ViewColumn.Two,
        {
          enableScripts: true,
          localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'webview-ui', 'dist')],
          retainContextWhenHidden: true
        }
      );

      this.panel.webview.html = await this.getHtmlForWebview();

      this.panel.onDidDispose(() => {
        this.panel = undefined;
        this.stopCurrentAdapter();
      }, null);
    }

    this.stopCurrentAdapter();
    this.executionEvents = [];
    
    // Send an initial empty state or loading state if we want

    const ext = path.extname(filePath).toLowerCase();
    
    if (ext === '.py') {
      this.currentAdapter = new PythonAdapter(this.extensionUri);
    } else if (ext === '.js') {
      this.currentAdapter = new JavascriptAdapter(this.extensionUri);
    } else {
      vscode.window.showErrorMessage(`Unsupported file type: ${ext}`);
      return;
    }

    this.currentAdapter.on('event', (event) => {
      this.executionEvents.push(event);
      // We can stream events as they come, or send them all at once.
      // The UI expects a list of events to step through.
      // For now, let's stream the accumulated list so the UI can update its timeline.
      if (this.panel) {
        this.panel.webview.postMessage({ command: 'EXECUTION_EVENTS', payload: this.executionEvents });
      }
    });

    this.currentAdapter.on('close', () => {
      // Finished
    });

    try {
      this.currentAdapter.start(filePath);
    } catch (e) {
      vscode.window.showErrorMessage(`Failed to start tracer: ${e}`);
    }
  }

  private stopCurrentAdapter() {
    if (this.currentAdapter) {
      this.currentAdapter.stop();
      this.currentAdapter = undefined;
    }
  }

  private async getHtmlForWebview(): Promise<string> {
    const webviewUri = this.panel?.webview;
    if (!webviewUri) return '';

    // Read the actual built index.html
    const indexPath = vscode.Uri.joinPath(this.extensionUri, 'webview-ui', 'dist', 'index.html');
    const htmlContent = await vscode.workspace.fs.readFile(indexPath);
    let html = Buffer.from(htmlContent).toString('utf-8');

    // Replace asset paths with webview URIs
    const distUri = vscode.Uri.joinPath(this.extensionUri, 'webview-ui', 'dist');
    const webviewDistUri = webviewUri.asWebviewUri(distUri);

    // Replace relative paths with webview URIs
    html = html.replace(/href="\/assets\//g, `href="${webviewDistUri}/assets/`);
    html = html.replace(/src="\/assets\//g, `src="${webviewDistUri}/assets/`);

    return html;
  }

  public dispose() {
    this.stopCurrentAdapter();
    this.panel?.dispose();
  }
}
