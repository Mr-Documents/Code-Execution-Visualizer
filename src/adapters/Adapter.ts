import { EventEmitter } from 'events';

export interface ITracerAdapter extends EventEmitter {
    /**
     * Start tracing the execution of a file.
     * @param filePath The absolute path to the file to trace.
     */
    start(filePath: string): void;

    /**
     * Stop the tracer.
     */
    stop(): void;
}

// Common event structures matching the UI expectation
export interface ScopeVariable {
    type: string;
    value: string;
    ref?: string;
}

export interface Scope {
    [name: string]: ScopeVariable;
}

export interface HeapObject {
    type: string;
    value: any;
    refs: string[];
    /** Set when traversal caps stopped this object from being fully expanded. */
    truncated?: boolean;
}

export interface Heap {
    [ref: string]: HeapObject;
}

export interface ExecutionEvent {
    /**
     * STEP  — one executed line
     * ERROR — uncaught exception; terminal
     * LIMIT — step cap hit (probable infinite loop); terminal
     * END   — program finished normally; terminal
     */
    type: 'STEP' | 'ERROR' | 'END' | 'LIMIT';
    line: number;
    scope: Scope;
    heap: Heap;
    callStack?: string[];
    /**
     * Console output produced since the *previous* event, not the running total.
     * Consumers concatenate deltas to rebuild output at a given step; sending
     * the cumulative buffer each time made total payload quadratic in steps.
     */
    stdoutDelta?: string;
    error?: string;
    /** On a LIMIT event, which safeguard stopped the run. */
    limitReason?: 'steps' | 'size';
    /** On a step-capped LIMIT event, the cap that was reached. */
    stepLimit?: number;
    /** On a size-capped LIMIT event, the bytes emitted and the cap. */
    traceBytes?: number;
    traceByteLimit?: number;
}
