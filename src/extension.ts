import * as vscode from 'vscode';
import { ExecutionManager } from './core/ExecutionManager';

export function activate(context: vscode.ExtensionContext) {
  const executionManager = new ExecutionManager(context.extensionUri);

  const startCommand = vscode.commands.registerCommand('code-execution-visualizer.start', () => {
    executionManager.startVisualization();
  });

  context.subscriptions.push(startCommand, executionManager);
}

export function deactivate() {}
