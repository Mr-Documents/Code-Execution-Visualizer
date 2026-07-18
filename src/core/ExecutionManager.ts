import * as vscode from 'vscode';
import { join } from 'path';

export class ExecutionManager {
  private panel: vscode.WebviewPanel | undefined;

  constructor(private readonly extensionUri: vscode.Uri) {}

  public startVisualization() {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Two);
      return;
    }

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

    this.panel.webview.html = this.getHtmlForWebview();

    this.panel.onDidDispose(() => {
      this.panel = undefined;
    }, null);

    // TODO: Initialize adapters and start sending data
    this.sendMockData();
  }

  private sendMockData() {
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

  private getHtmlForWebview(): string {
    // In production, this reads from webview-ui/dist/index.html and replaces paths
    // For development (Vite dev server), we point to localhost.
    
    // Simplistic HTML to load the built assets
    const webviewUri = this.panel?.webview;
    if (!webviewUri) return '';

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

  public dispose() {
    this.panel?.dispose();
  }
}
