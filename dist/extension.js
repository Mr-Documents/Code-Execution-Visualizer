/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ([
/* 0 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(__webpack_require__(1));
const ExecutionManager_1 = __webpack_require__(2);
function activate(context) {
    const executionManager = new ExecutionManager_1.ExecutionManager(context.extensionUri);
    const startCommand = vscode.commands.registerCommand('code-execution-visualizer.start', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            executionManager.startVisualization(editor.document.uri.fsPath);
        }
        else {
            vscode.window.showErrorMessage('Please open a Python or JavaScript file to visualize.');
        }
    });
    context.subscriptions.push(startCommand, executionManager);
}
function deactivate() { }


/***/ }),
/* 1 */
/***/ ((module) => {

module.exports = require("vscode");

/***/ }),
/* 2 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ExecutionManager = void 0;
const vscode = __importStar(__webpack_require__(1));
const path = __importStar(__webpack_require__(3));
const PythonAdapter_1 = __webpack_require__(4);
const JavascriptAdapter_1 = __webpack_require__(8);
const webviewHtml_1 = __webpack_require__(9);
/** Extensions we can trace, mapped to the language id sent to the UI. */
const SUPPORTED_LANGUAGES = {
    '.js': 'javascript',
    '.py': 'python'
};
/**
 * How long to accumulate tracer events before shipping them to the webview.
 * Posting each event individually caused one React render per executed line —
 * thousands of renders during a single trace.
 */
const EVENT_FLUSH_MS = 60;
class ExecutionManager {
    extensionUri;
    panel;
    currentAdapter;
    /** The webview only starts listening once its script has run; anything sent
     *  before that is dropped by VS Code, so outbound messages are queued. */
    webviewReady = false;
    outbox = [];
    pendingEvents = [];
    flushTimer;
    panelDisposables = [];
    constructor(extensionUri) {
        this.extensionUri = extensionUri;
    }
    async startVisualization(filePath) {
        await this.ensurePanel();
        this.stopCurrentAdapter();
        const ext = path.extname(filePath).toLowerCase();
        const language = SUPPORTED_LANGUAGES[ext];
        if (!language) {
            this.post({ command: 'UNSUPPORTED_FILE', payload: { ext } });
            vscode.window.showErrorMessage(`Cannot visualize '${ext || 'this file'}'. Open a JavaScript (.js) or Python (.py) file.`);
            return;
        }
        let code;
        try {
            const bytes = await vscode.workspace.fs.readFile(vscode.Uri.file(filePath));
            code = Buffer.from(bytes).toString('utf8');
        }
        catch (err) {
            vscode.window.showErrorMessage(`Could not read ${path.basename(filePath)}: ${err}`);
            return;
        }
        this.post({
            command: 'EXECUTION_START',
            payload: { code, fileName: path.basename(filePath), language }
        });
        const adapter = language === 'python'
            ? new PythonAdapter_1.PythonAdapter(this.extensionUri)
            : new JavascriptAdapter_1.JavascriptAdapter(this.extensionUri);
        this.currentAdapter = adapter;
        adapter.on('event', (event) => this.queueEvent(event));
        adapter.on('failure', (message) => {
            this.flushEvents();
            this.post({ command: 'EXECUTION_FAILED', payload: { message } });
            vscode.window.showErrorMessage(message);
        });
        adapter.on('close', () => this.flushEvents());
        try {
            adapter.start(filePath);
        }
        catch (err) {
            const message = `Failed to start the tracer: ${err}`;
            this.post({ command: 'EXECUTION_FAILED', payload: { message } });
            vscode.window.showErrorMessage(message);
        }
    }
    // --- webview plumbing -------------------------------------------------
    async ensurePanel() {
        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.Two, true);
            return;
        }
        const distUri = vscode.Uri.joinPath(this.extensionUri, 'webview-ui', 'dist');
        this.panel = vscode.window.createWebviewPanel('codeExecutionVisualizer', 'Execution Dashboard', { viewColumn: vscode.ViewColumn.Two, preserveFocus: true }, {
            enableScripts: true,
            localResourceRoots: [distUri],
            retainContextWhenHidden: true
        });
        this.webviewReady = false;
        this.outbox = [];
        this.panelDisposables.push(this.panel.webview.onDidReceiveMessage((message) => {
            if (message?.command === 'WEBVIEW_READY')
                this.drainOutbox();
        }));
        this.panelDisposables.push(this.panel.onDidDispose(() => {
            this.panel = undefined;
            this.webviewReady = false;
            this.outbox = [];
            this.stopCurrentAdapter();
            this.clearFlushTimer();
            this.disposePanelListeners();
        }));
        this.panel.webview.html = await this.renderHtml(this.panel.webview, distUri);
    }
    async renderHtml(webview, distUri) {
        const indexUri = vscode.Uri.joinPath(distUri, 'index.html');
        const raw = Buffer.from(await vscode.workspace.fs.readFile(indexUri)).toString('utf8');
        return (0, webviewHtml_1.buildWebviewHtml)(raw, webview.asWebviewUri(distUri).toString(), webview.cspSource);
    }
    /** Sends a message, holding it back until the webview reports it is listening. */
    post(message) {
        if (!this.panel)
            return;
        if (!this.webviewReady) {
            this.outbox.push(message);
            return;
        }
        void this.panel.webview.postMessage(message);
    }
    drainOutbox() {
        this.webviewReady = true;
        const queued = this.outbox;
        this.outbox = [];
        for (const message of queued) {
            void this.panel?.webview.postMessage(message);
        }
    }
    // --- event batching ---------------------------------------------------
    queueEvent(event) {
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
    flushEvents() {
        this.clearFlushTimer();
        if (this.pendingEvents.length === 0)
            return;
        const events = this.pendingEvents;
        this.pendingEvents = [];
        this.post({ command: 'EXECUTION_EVENTS', payload: { events } });
    }
    clearFlushTimer() {
        if (this.flushTimer) {
            clearTimeout(this.flushTimer);
            this.flushTimer = undefined;
        }
    }
    // --- lifecycle --------------------------------------------------------
    stopCurrentAdapter() {
        if (this.currentAdapter) {
            this.currentAdapter.removeAllListeners();
            this.currentAdapter.stop();
            this.currentAdapter = undefined;
        }
        this.clearFlushTimer();
        this.pendingEvents = [];
    }
    disposePanelListeners() {
        for (const disposable of this.panelDisposables)
            disposable.dispose();
        this.panelDisposables = [];
    }
    dispose() {
        this.stopCurrentAdapter();
        this.disposePanelListeners();
        this.panel?.dispose();
        this.panel = undefined;
    }
}
exports.ExecutionManager = ExecutionManager;


/***/ }),
/* 3 */
/***/ ((module) => {

module.exports = require("path");

/***/ }),
/* 4 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.PythonAdapter = void 0;
const vscode = __importStar(__webpack_require__(1));
const ProcessTracerAdapter_1 = __webpack_require__(5);
/** Traces Python via `sys.settrace`. Experimental — see README. */
class PythonAdapter extends ProcessTracerAdapter_1.ProcessTracerAdapter {
    extensionUri;
    constructor(extensionUri) {
        super();
        this.extensionUri = extensionUri;
    }
    get runtimeName() {
        return 'Python';
    }
    buildCommand(filePath) {
        const tracerPath = vscode.Uri.joinPath(this.extensionUri, 'dist', 'adapters', 'python', 'tracer.py').fsPath;
        // Assumes `python` is on PATH; a missing interpreter surfaces as a
        // spawn ENOENT, which the base class turns into a readable message.
        return { command: 'python', args: [tracerPath, filePath] };
    }
}
exports.PythonAdapter = PythonAdapter;


/***/ }),
/* 5 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ProcessTracerAdapter = void 0;
const events_1 = __webpack_require__(6);
const child_process_1 = __webpack_require__(7);
/** How many trailing stderr lines to retain for diagnosing a failed run. */
const STDERR_TAIL_LINES = 20;
/**
 * Shared plumbing for tracers that run as a child process and stream
 * newline-delimited JSON events on stdout.
 *
 * Subclasses only need to say what to spawn; process lifecycle, line
 * reassembly, and failure reporting are handled here.
 *
 * Events:
 * - `event`   — one parsed {@link ExecutionEvent}
 * - `close`   — the tracer exited
 * - `failure` — the run could not start or died unexpectedly (carries a
 *               user-facing message). Deliberately not named `error`, since
 *               EventEmitter throws when an `error` event has no listener.
 */
class ProcessTracerAdapter extends events_1.EventEmitter {
    process;
    stdoutBuffer = '';
    stderrTail = [];
    eventCount = 0;
    stopped = false;
    start(filePath) {
        const { command, args } = this.buildCommand(filePath);
        try {
            this.process = (0, child_process_1.spawn)(command, args);
        }
        catch (err) {
            this.fail(this.describeSpawnFailure(err, command));
            return;
        }
        // Without this listener Node re-throws the 'error' event, which would
        // take down the extension host when the runtime isn't installed.
        this.process.on('error', (err) => {
            this.fail(this.describeSpawnFailure(err, command));
        });
        this.process.stdout?.on('data', (data) => this.consumeStdout(data.toString()));
        this.process.stderr?.on('data', (data) => {
            for (const line of data.toString().split('\n')) {
                if (!line.trim())
                    continue;
                this.stderrTail.push(line);
                if (this.stderrTail.length > STDERR_TAIL_LINES)
                    this.stderrTail.shift();
            }
        });
        this.process.on('close', (code) => {
            // A tracer that exits non-zero without producing a single event
            // failed to start — surface why instead of leaving an empty panel.
            if (!this.stopped && code !== 0 && this.eventCount === 0) {
                const detail = this.stderrTail.join('\n').trim();
                this.fail(`${this.runtimeName} tracer exited with code ${code}.` +
                    (detail ? `\n${detail}` : ''));
            }
            this.emit('close', code);
        });
    }
    stop() {
        this.stopped = true;
        if (this.process) {
            this.process.kill();
            this.process = undefined;
        }
    }
    /** Splits the stdout stream on newlines, holding any partial trailing line. */
    consumeStdout(chunk) {
        this.stdoutBuffer += chunk;
        let newlineIndex;
        while ((newlineIndex = this.stdoutBuffer.indexOf('\n')) !== -1) {
            const line = this.stdoutBuffer.slice(0, newlineIndex).trim();
            this.stdoutBuffer = this.stdoutBuffer.slice(newlineIndex + 1);
            if (!line)
                continue;
            try {
                this.eventCount++;
                this.emit('event', JSON.parse(line));
            }
            catch {
                // A malformed line means a tracer bug or interleaved output;
                // drop it rather than tearing down an otherwise valid run.
                this.stderrTail.push(`Unparseable tracer output: ${line.slice(0, 200)}`);
            }
        }
    }
    describeSpawnFailure(err, command) {
        const code = err?.code;
        if (code === 'ENOENT') {
            return `Could not find '${command}' on your PATH. ` +
                `${this.runtimeName} is required to visualize this file.`;
        }
        return `Failed to start the ${this.runtimeName} tracer: ${err?.message ?? String(err)}`;
    }
    fail(message) {
        this.emit('failure', message);
    }
}
exports.ProcessTracerAdapter = ProcessTracerAdapter;


/***/ }),
/* 6 */
/***/ ((module) => {

module.exports = require("events");

/***/ }),
/* 7 */
/***/ ((module) => {

module.exports = require("child_process");

/***/ }),
/* 8 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.JavascriptAdapter = void 0;
const vscode = __importStar(__webpack_require__(1));
const ProcessTracerAdapter_1 = __webpack_require__(5);
/** Traces JavaScript by driving the target under the V8 Inspector protocol. */
class JavascriptAdapter extends ProcessTracerAdapter_1.ProcessTracerAdapter {
    extensionUri;
    constructor(extensionUri) {
        super();
        this.extensionUri = extensionUri;
    }
    get runtimeName() {
        return 'Node.js';
    }
    buildCommand(filePath) {
        const tracerPath = vscode.Uri.joinPath(this.extensionUri, 'dist', 'adapters', 'javascript', 'tracer.js').fsPath;
        return { command: 'node', args: [tracerPath, filePath] };
    }
}
exports.JavascriptAdapter = JavascriptAdapter;


/***/ }),
/* 9 */
/***/ ((__unused_webpack_module, exports) => {


/**
 * Prepares the built Vite `index.html` for use inside a VS Code webview.
 *
 * Kept free of the `vscode` module so it can be unit tested directly.
 */
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.buildWebviewHtml = buildWebviewHtml;
/**
 * Rewrites the page's root-relative asset URLs to webview URIs and applies a
 * restrictive Content Security Policy.
 *
 * @param rawHtml      Contents of the built index.html.
 * @param assetBaseUri Webview URI of the directory the assets live in, no trailing slash.
 * @param cspSource    The webview's `cspSource`, the only origin allowed to serve code.
 */
function buildWebviewHtml(rawHtml, assetBaseUri, cspSource) {
    let html = rawHtml;
    // Vite emits absolute paths (`/assets/...`, `/favicon.svg`) that resolve to
    // nothing under the webview's origin. Rewrite every root-relative href/src.
    // The `(?!\/)` guard keeps protocol-relative URLs (`//host/x`) intact.
    html = html.replace(/\b(href|src)="\/(?!\/)([^"]*)"/g, (_match, attr, rest) => `${attr}="${assetBaseUri}/${rest}"`);
    // These resources are same-origin for the webview; requesting them in CORS
    // mode buys nothing and can fail depending on how VS Code serves them.
    html = html.replace(/\s+crossorigin(?:="[^"]*")?/g, '');
    const csp = [
        "default-src 'none'",
        `img-src ${cspSource} data:`,
        // React and the graph library attach styles inline at runtime.
        `style-src ${cspSource} 'unsafe-inline'`,
        `script-src ${cspSource}`,
        `font-src ${cspSource}`
    ].join('; ');
    const meta = `<meta http-equiv="Content-Security-Policy" content="${csp}">`;
    if (/<head[^>]*>/i.test(html)) {
        return html.replace(/<head([^>]*)>/i, (_m, attrs) => `<head${attrs}>\n    ${meta}`);
    }
    return `${meta}\n${html}`;
}


/***/ })
/******/ 	]);
/************************************************************************/
/******/ 	// The module cache
/******/ 	const __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		const cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		const module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		__webpack_modules__[moduleId].call(module.exports, module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	
/******/ 	// startup
/******/ 	// Load entry module and return exports
/******/ 	// This entry module is referenced by other modules so it can't be inlined
/******/ 	let __webpack_exports__ = __webpack_require__(0);
/******/ 	const __webpack_export_target__ = exports;
/******/ 	for(var __webpack_i__ in __webpack_exports__) __webpack_export_target__[__webpack_i__] = __webpack_exports__[__webpack_i__];
/******/ 	if(__webpack_exports__.__esModule) Object.defineProperty(__webpack_export_target__, "__esModule", { value: true });
/******/ 	
/******/ })()
;