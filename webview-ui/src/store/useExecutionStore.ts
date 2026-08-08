import { create } from 'zustand';

export interface VariableValue {
  type: string;
  value: unknown;
  /** Id of the referenced object in the heap, for non-primitive values. */
  ref?: string;
}

export interface HeapObject {
  type: string;
  value: unknown;
  refs?: string[];
  /** Set when the tracer's traversal caps stopped this object being expanded. */
  truncated?: boolean;
}

export interface ExecutionEvent {
  /**
   * STEP  — one executed line
   * ERROR — uncaught exception; terminal
   * LIMIT — step cap hit (probable infinite loop); terminal
   * END   — finished normally; terminal
   */
  type: 'STEP' | 'ERROR' | 'END' | 'LIMIT';
  line: number;
  scope: Record<string, VariableValue>;
  callStack?: string[];
  heap?: Record<string, HeapObject>;
  /** Console output since the previous event, not the running total. */
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

export type ExecutionPhase = 'idle' | 'loading' | 'ready' | 'unsupported' | 'failed';

/** True if an event carries any inspectable program state. */
function hasState(event: ExecutionEvent | undefined): boolean {
  if (!event) return false;
  return Object.keys(event.scope ?? {}).length > 0 || Object.keys(event.heap ?? {}).length > 0;
}

/**
 * Picks the event the memory panels should render.
 *
 * END always — and a size-capped LIMIT by design — carries no scope or heap:
 * the program has exited, so there is nothing live left to read. Rendering that
 * directly blanked the graph, variable inspector and all, exactly when the run
 * finished and the user wanted to study the result. Falling back to the last
 * event that had state keeps the final picture on screen.
 *
 * The fallback is deliberately limited to those terminal events. A regular STEP
 * with an empty scope is legitimately empty (nothing declared yet), and showing
 * an earlier step's variables there would be a lie.
 */
export function selectStateEvent(
  events: ExecutionEvent[],
  currentStep: number
): ExecutionEvent | undefined {
  const current = events[currentStep];
  if (!current) return undefined;
  if (hasState(current)) return current;
  if (current.type !== 'END' && current.type !== 'LIMIT') return current;

  for (let i = currentStep - 1; i >= 0; i--) {
    if (hasState(events[i])) return events[i];
  }
  return current;
}

interface ExecutionState {
  events: ExecutionEvent[];
  currentStep: number;
  isPlaying: boolean;
  playbackSpeed: number;
  code: string;
  fileName: string;
  language: string;
  phase: ExecutionPhase;
  unsupportedExt?: string;
  failureMessage?: string;

  // Actions
  startExecution: (data: { code: string; fileName: string; language: string }) => void;
  appendEvents: (events: ExecutionEvent[]) => void;
  markUnsupported: (ext: string) => void;
  markFailed: (message: string) => void;
  nextStep: () => void;
  prevStep: () => void;
  jumpToStep: (step: number) => void;
  togglePlayback: () => void;
  setPlaybackSpeed: (speed: number) => void;
}

const initialState = {
  events: [] as ExecutionEvent[],
  currentStep: 0,
  isPlaying: false,
  playbackSpeed: 800, // Medium
  code: '',
  fileName: '',
  language: '',
  phase: 'idle' as ExecutionPhase,
  unsupportedExt: undefined,
  failureMessage: undefined
};

export const useExecutionStore = create<ExecutionState>((set, get) => ({
  ...initialState,

  startExecution: (data) => set({
    ...initialState,
    code: data.code,
    fileName: data.fileName,
    language: data.language,
    phase: 'loading'
  }),

  /**
   * Appends a batch of events in a single update. Events arrive batched from
   * the extension so a long trace costs a handful of renders rather than one
   * per executed line.
   */
  appendEvents: (incoming) => {
    if (incoming.length === 0) return;
    set((state) => ({
      events: state.events.concat(incoming),
      phase: state.phase === 'loading' || state.phase === 'idle' ? 'ready' : state.phase
    }));
  },

  markUnsupported: (ext) => set({
    ...initialState,
    phase: 'unsupported',
    unsupportedExt: ext
  }),

  markFailed: (message) => set((state) => ({
    ...state,
    phase: 'failed',
    isPlaying: false,
    failureMessage: message
  })),

  nextStep: () => {
    const { currentStep, events } = get();
    if (currentStep < events.length - 1) {
      set({ currentStep: currentStep + 1 });
    } else {
      set({ isPlaying: false });
    }
  },

  prevStep: () => {
    const { currentStep } = get();
    if (currentStep > 0) set({ currentStep: currentStep - 1 });
  },

  jumpToStep: (step) => {
    const { events } = get();
    if (step >= 0 && step < events.length) set({ currentStep: step });
  },

  togglePlayback: () => set((state) => ({ isPlaying: !state.isPlaying })),

  setPlaybackSpeed: (playbackSpeed) => set({ playbackSpeed })
}));
