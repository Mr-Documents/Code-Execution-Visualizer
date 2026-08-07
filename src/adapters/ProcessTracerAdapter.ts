import { EventEmitter } from 'events';
import { spawn, type ChildProcess } from 'child_process';
// Type-only: keeps this module free of runtime imports so it can be loaded
// directly (e.g. by the test runner) without a build step.
import type { ITracerAdapter, ExecutionEvent } from './Adapter';

/** How many trailing stderr lines to retain for diagnosing a failed run. */
const STDERR_TAIL_LINES = 20;

/**
 * Shared plumbing for tracers that run as a child process and stream
 * newline-delimited JSON events on stdout.
 *
 * Subclasses only need to say what to spawn; process lifecycle, line
 * reassembly, and failure reporting are handled here.
 *
 * Events:
 * - `event`   — one parsed {@link ExecutionEvent}
 * - `close`   — the tracer exited
 * - `failure` — the run could not start or died unexpectedly (carries a
 *               user-facing message). Deliberately not named `error`, since
 *               EventEmitter throws when an `error` event has no listener.
 */
export abstract class ProcessTracerAdapter extends EventEmitter implements ITracerAdapter {
    private process: ChildProcess | undefined;
    private stdoutBuffer = '';
    private stderrTail: string[] = [];
    private eventCount = 0;
    private stopped = false;

    /** The command and arguments used to trace `filePath`. */
    protected abstract buildCommand(filePath: string): { command: string; args: string[] };

    /** Human-readable runtime name, used in error messages (e.g. "Node.js"). */
    protected abstract get runtimeName(): string;

    public start(filePath: string): void {
        const { command, args } = this.buildCommand(filePath);

        try {
            this.process = spawn(command, args);
        } catch (err) {
            this.fail(this.describeSpawnFailure(err, command));
            return;
        }

        // Without this listener Node re-throws the 'error' event, which would
        // take down the extension host when the runtime isn't installed.
        this.process.on('error', (err) => {
            this.fail(this.describeSpawnFailure(err, command));
        });

        this.process.stdout?.on('data', (data) => this.consumeStdout(data.toString()));

        this.process.stderr?.on('data', (data) => {
            for (const line of data.toString().split('\n')) {
                if (!line.trim()) continue;
                this.stderrTail.push(line);
                if (this.stderrTail.length > STDERR_TAIL_LINES) this.stderrTail.shift();
            }
        });

        this.process.on('close', (code) => {
            // A tracer that exits non-zero without producing a single event
            // failed to start — surface why instead of leaving an empty panel.
            if (!this.stopped && code !== 0 && this.eventCount === 0) {
                const detail = this.stderrTail.join('\n').trim();
                this.fail(
                    `${this.runtimeName} tracer exited with code ${code}.` +
                    (detail ? `\n${detail}` : '')
                );
            }
            this.emit('close', code);
        });
    }

    public stop(): void {
        this.stopped = true;
        if (this.process) {
            this.process.kill();
            this.process = undefined;
        }
    }

    /** Splits the stdout stream on newlines, holding any partial trailing line. */
    private consumeStdout(chunk: string): void {
        this.stdoutBuffer += chunk;

        let newlineIndex: number;
        while ((newlineIndex = this.stdoutBuffer.indexOf('\n')) !== -1) {
            const line = this.stdoutBuffer.slice(0, newlineIndex).trim();
            this.stdoutBuffer = this.stdoutBuffer.slice(newlineIndex + 1);
            if (!line) continue;

            try {
                this.eventCount++;
                this.emit('event', JSON.parse(line) as ExecutionEvent);
            } catch {
                // A malformed line means a tracer bug or interleaved output;
                // drop it rather than tearing down an otherwise valid run.
                this.stderrTail.push(`Unparseable tracer output: ${line.slice(0, 200)}`);
            }
        }
    }

    private describeSpawnFailure(err: unknown, command: string): string {
        const code = (err as NodeJS.ErrnoException)?.code;
        if (code === 'ENOENT') {
            return `Could not find '${command}' on your PATH. ` +
                `${this.runtimeName} is required to visualize this file.`;
        }
        return `Failed to start the ${this.runtimeName} tracer: ${(err as Error)?.message ?? String(err)}`;
    }

    private fail(message: string): void {
        this.emit('failure', message);
    }
}
