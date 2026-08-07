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
const fs = __importStar(__webpack_require__(4));
const PythonAdapter_1 = __webpack_require__(5);
const JavascriptAdapter_1 = __webpack_require__(8);
class ExecutionManager {
    extensionUri;
    panel;
    currentAdapter;
    executionEvents = [];
    constructor(extensionUri) {
        this.extensionUri = extensionUri;
    }
    async startVisualization(filePath) {
        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.Two);
        }
        else {
            this.panel = vscode.window.createWebviewPanel('codeExecutionVisualizer', 'Execution Dashboard', vscode.ViewColumn.Two, {
                enableScripts: true,
                localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'webview-ui', 'dist')],
                retainContextWhenHidden: true
            });
            this.panel.webview.html = await this.getHtmlForWebview();
            this.panel.onDidDispose(() => {
                this.panel = undefined;
                this.stopCurrentAdapter();
            }, null);
        }
        this.stopCurrentAdapter();
        this.executionEvents = [];
        const ext = path.extname(filePath).toLowerCase();
        if (ext !== '.py' && ext !== '.js') {
            this.panel?.webview.postMessage({ command: 'UNSUPPORTED_FILE', payload: { ext } });
            vscode.window.showErrorMessage(`Unsupported file type: ${ext}`);
            return;
        }
        const codeContent = fs.readFileSync(filePath, 'utf8');
        const language = ext === '.py' ? 'python' : 'javascript';
        // Let the webview show a loading state while the tracer spins up
        this.panel?.webview.postMessage({
            command: 'EXECUTION_START',
            payload: { code: codeContent, fileName: path.basename(filePath), language }
        });
        this.currentAdapter = ext === '.py'
            ? new PythonAdapter_1.PythonAdapter(this.extensionUri)
            : new JavascriptAdapter_1.JavascriptAdapter(this.extensionUri);
        this.currentAdapter.on('event', (event) => {
            this.executionEvents.push(event);
            if (this.panel) {
                this.panel.webview.postMessage({ command: 'EXECUTION_EVENT', payload: { event } });
            }
        });
        this.currentAdapter.on('close', () => {
            // Finished
        });
        try {
            this.currentAdapter.start(filePath);
        }
        catch (e) {
            vscode.window.showErrorMessage(`Failed to start tracer: ${e}`);
        }
    }
    stopCurrentAdapter() {
        if (this.currentAdapter) {
            this.currentAdapter.stop();
            this.currentAdapter = undefined;
        }
    }
    async getHtmlForWebview() {
        const webviewUri = this.panel?.webview;
        if (!webviewUri)
            return '';
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
    dispose() {
        this.stopCurrentAdapter();
        this.panel?.dispose();
    }
}
exports.ExecutionManager = ExecutionManager;


/***/ }),
/* 3 */
/***/ ((module) => {

module.exports = require("path");

/***/ }),
/* 4 */
/***/ ((module) => {

module.exports = require("fs");

/***/ }),
/* 5 */
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
const events_1 = __webpack_require__(6);
const child_process_1 = __webpack_require__(7);
const vscode = __importStar(__webpack_require__(1));
class PythonAdapter extends events_1.EventEmitter {
    extensionUri;
    process;
    constructor(extensionUri) {
        super();
        this.extensionUri = extensionUri;
    }
    start(filePath) {
        const tracerPath = vscode.Uri.joinPath(this.extensionUri, 'dist', 'adapters', 'python', 'tracer.py').fsPath;
        // We use 'python' assuming it's in the PATH, or we could use the active Python extension's interpreter
        this.process = (0, child_process_1.spawn)('python', [tracerPath, filePath]);
        let buffer = '';
        this.process.stdout?.on('data', (data) => {
            buffer += data.toString();
            const lines = buffer.split('\n');
            buffer = lines.pop() || ''; // Keep incomplete line
            for (const line of lines) {
                if (line.trim()) {
                    try {
                        const event = JSON.parse(line);
                        this.emit('event', event);
                    }
                    catch (e) {
                        console.error('Failed to parse tracer output:', line);
                    }
                }
            }
        });
        this.process.stderr?.on('data', (data) => {
            console.error(`Python tracer stderr: ${data}`);
        });
        this.process.on('close', (code) => {
            console.log(`Python tracer exited with code ${code}`);
            this.emit('close', code);
        });
    }
    stop() {
        if (this.process) {
            this.process.kill();
            this.process = undefined;
        }
    }
}
exports.PythonAdapter = PythonAdapter;


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
const events_1 = __webpack_require__(6);
const child_process_1 = __webpack_require__(7);
const vscode = __importStar(__webpack_require__(1));
class JavascriptAdapter extends events_1.EventEmitter {
    extensionUri;
    process;
    constructor(extensionUri) {
        super();
        this.extensionUri = extensionUri;
    }
    start(filePath) {
        const tracerPath = vscode.Uri.joinPath(this.extensionUri, 'dist', 'adapters', 'javascript', 'tracer.js').fsPath;
        // Spawn node with the tracer script
        this.process = (0, child_process_1.spawn)('node', [tracerPath, filePath]);
        let buffer = '';
        this.process.stdout?.on('data', (data) => {
            buffer += data.toString();
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            for (const line of lines) {
                if (line.trim()) {
                    try {
                        const event = JSON.parse(line);
                        this.emit('event', event);
                    }
                    catch (e) {
                        console.error('Failed to parse tracer output:', line);
                    }
                }
            }
        });
        this.process.stderr?.on('data', (data) => {
            console.error(`JS tracer stderr: ${data}`);
        });
        this.process.on('close', (code) => {
            console.log(`JS tracer exited with code ${code}`);
            this.emit('close', code);
        });
    }
    stop() {
        if (this.process) {
            this.process.kill();
            this.process = undefined;
        }
    }
}
exports.JavascriptAdapter = JavascriptAdapter;


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