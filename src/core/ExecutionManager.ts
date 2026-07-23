import * as vscode from 'vscode';

export class ExecutionManager {
  private panel: vscode.WebviewPanel | undefined;

  constructor(private readonly extensionUri: vscode.Uri) {}

  public async startVisualization() {
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

    this.panel.webview.html = await this.getHtmlForWebview();

    this.panel.onDidDispose(() => {
      this.panel = undefined;
    }, null);

    // TODO: Initialize adapters and start sending data
    setTimeout(() => {
      this.sendMockData();
    }, 1000);
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
    this.panel?.dispose();
  }
}
