import { EventEmitter } from 'events';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import { ITracerAdapter, ExecutionEvent } from '../Adapter';
import * as vscode from 'vscode';

export class PythonAdapter extends EventEmitter implements ITracerAdapter {
    private process: ChildProcess | undefined;

    constructor(private readonly extensionUri: vscode.Uri) {
        super();
    }

    public start(filePath: string): void {
        const tracerPath = vscode.Uri.joinPath(this.extensionUri, 'dist', 'adapters', 'python', 'tracer.py').fsPath;

        // We use 'python' assuming it's in the PATH, or we could use the active Python extension's interpreter
        this.process = spawn('python', [tracerPath, filePath]);

        let buffer = '';

        this.process.stdout?.on('data', (data) => {
            buffer += data.toString();
            const lines = buffer.split('\n');
            buffer = lines.pop() || ''; // Keep incomplete line

            for (const line of lines) {
                if (line.trim()) {
                    try {
                        const event = JSON.parse(line) as ExecutionEvent;
                        this.emit('event', event);
                    } catch (e) {
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

    public stop(): void {
        if (this.process) {
            this.process.kill();
            this.process = undefined;
        }
    }
}
