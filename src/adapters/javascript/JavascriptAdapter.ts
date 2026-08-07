import * as vscode from 'vscode';
import { ProcessTracerAdapter } from '../ProcessTracerAdapter';

/** Traces JavaScript by driving the target under the V8 Inspector protocol. */
export class JavascriptAdapter extends ProcessTracerAdapter {
    constructor(private readonly extensionUri: vscode.Uri) {
        super();
    }

    protected get runtimeName(): string {
        return 'Node.js';
    }

    protected buildCommand(filePath: string): { command: string; args: string[] } {
        const tracerPath = vscode.Uri.joinPath(
            this.extensionUri, 'dist', 'adapters', 'javascript', 'tracer.js'
        ).fsPath;
        return { command: 'node', args: [tracerPath, filePath] };
    }
}
