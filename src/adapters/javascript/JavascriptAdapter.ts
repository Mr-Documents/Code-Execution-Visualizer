import { EventEmitter } from 'events';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import { ITracerAdapter, ExecutionEvent } from '../Adapter';
import * as vscode from 'vscode';
import * as fs from 'fs';

export class JavascriptAdapter extends EventEmitter implements ITracerAdapter {
    private process: ChildProcess | undefined;

    constructor(private readonly extensionUri: vscode.Uri) {
        super();
    }

    public start(filePath: string): void {
        const tracerPath = vscode.Uri.joinPath(this.extensionUri, 'src', 'adapters', 'javascript', 'tracer.js').fsPath;
        
        // Spawn node with the tracer script
        this.process = spawn('node', [tracerPath, filePath]);

        let buffer = '';

        this.process.stdout?.on('data', (data) => {
            buffer += data.toString();
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

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
            console.error(`JS tracer stderr: ${data}`);
        });

        this.process.on('close', (code) => {
            console.log(`JS tracer exited with code ${code}`);
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
