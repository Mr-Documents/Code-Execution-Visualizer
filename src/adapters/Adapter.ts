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
}

export interface Heap {
    [ref: string]: HeapObject;
}

export interface ExecutionEvent {
    type: 'STEP' | 'ERROR' | 'END';
    line: number;
    scope: Scope;
    heap: Heap;
    error?: string;
}
