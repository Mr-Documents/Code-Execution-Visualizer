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
}

export type ExecutionPhase = 'idle' | 'loading' | 'ready' | 'unsupported' | 'failed';

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
