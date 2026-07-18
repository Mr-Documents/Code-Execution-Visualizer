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
        executionManager.startVisualization();
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
class ExecutionManager {
    extensionUri;
    panel;
    constructor(extensionUri) {
        this.extensionUri = extensionUri;
    }
    startVisualization() {
        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.Two);
            return;
        }
        this.panel = vscode.window.createWebviewPanel('codeExecutionVisualizer', 'Execution Dashboard', vscode.ViewColumn.Two, {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'webview-ui', 'dist')],
            retainContextWhenHidden: true
        });
        this.panel.webview.html = this.getHtmlForWebview();
        this.panel.onDidDispose(() => {
            this.panel = undefined;
        }, null);
        // TODO: Initialize adapters and start sending data
        this.sendMockData();
    }
    sendMockData() {
        // A comprehensive mock event sequence for MVP visual testing showing heap graph and scope
        const mockEvents = [
            {
                type: 'STEP',
                line: 1,
                scope: { 'x': { type: 'number', value: 10 } },
                heap: {}
            },
            {
                type: 'STEP',
                line: 2,
                scope: {
                    'x': { type: 'number', value: 10 },
                    'user': { type: 'object', value: 'Object', ref: 'obj-1' }
                },
                heap: {
                    'obj-1': { type: 'Object', value: { name: 'Alice' }, refs: [] }
                }
            },
            {
                type: 'STEP',
                line: 3,
                scope: {
                    'x': { type: 'number', value: 15 }, // changed
                    'user': { type: 'object', value: 'Object', ref: 'obj-1' },
                    'friends': { type: 'array', value: 'Array(1)', ref: 'arr-1' }
                },
                heap: {
                    'obj-1': { type: 'Object', value: { name: 'Alice' }, refs: ['obj-2'] },
                    'arr-1': { type: 'Array', value: ['[Ref: obj-2]'], refs: ['obj-2'] },
                    'obj-2': { type: 'Object', value: { name: 'Bob' }, refs: [] }
                }
            }
        ];
        if (this.panel) {
            this.panel.webview.postMessage({ command: 'EXECUTION_EVENTS', payload: mockEvents });
        }
    }
    getHtmlForWebview() {
        // In production, this reads from webview-ui/dist/index.html and replaces paths
        // For development (Vite dev server), we point to localhost.
        // Simplistic HTML to load the built assets
        const webviewUri = this.panel?.webview;
        if (!webviewUri)
            return '';
        const scriptUri = webviewUri.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'webview-ui', 'dist', 'assets', 'index.js'));
        const styleUri = webviewUri.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'webview-ui', 'dist', 'assets', 'index.css'));
        return `<!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Code Execution Visualizer</title>
        <link rel="stylesheet" href="${styleUri}">
      </head>
      <body>
        <div id="root"></div>
        <script type="module" src="${scriptUri}"></script>
      </body>
      </html>`;
    }
    dispose() {
        this.panel?.dispose();
    }
}
exports.ExecutionManager = ExecutionManager;


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