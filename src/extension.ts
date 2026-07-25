import * as vscode from 'vscode';
import { ExecutionManager } from './core/ExecutionManager';

export function activate(context: vscode.ExtensionContext) {
  const executionManager = new ExecutionManager(context.extensionUri);

  const startCommand = vscode.commands.registerCommand('code-execution-visualizer.start', () => {
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      executionManager.startVisualization(editor.document.uri.fsPath);
    } else {
      vscode.window.showErrorMessage('Please open a Python or JavaScript file to visualize.');
    }
  });

  context.subscriptions.push(startCommand, executionManager);
}

export function deactivate() {}
