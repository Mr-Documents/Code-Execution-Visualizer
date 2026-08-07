import * as vscode from 'vscode';
import { ProcessTracerAdapter } from '../ProcessTracerAdapter';

/** Traces Python via `sys.settrace`. Experimental — see README. */
export class PythonAdapter extends ProcessTracerAdapter {
    constructor(private readonly extensionUri: vscode.Uri) {
        super();
    }

    protected get runtimeName(): string {
        return 'Python';
    }

    protected buildCommand(filePath: string): { command: string; args: string[] } {
        const tracerPath = vscode.Uri.joinPath(
            this.extensionUri, 'dist', 'adapters', 'python', 'tracer.py'
        ).fsPath;
        // Assumes `python` is on PATH; a missing interpreter surfaces as a
        // spawn ENOENT, which the base class turns into a readable message.
        return { command: 'python', args: [tracerPath, filePath] };
    }
}
