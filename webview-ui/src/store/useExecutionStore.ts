import { create } from 'zustand';

// Types for the MVP execution events
export interface ExecutionEvent {
  type: 'STEP' | 'EXCEPTION' | 'CALL' | 'RETURN' | 'ERROR' | 'END' | 'LIMIT';
  line: number;
  scope: Record<string, VariableValue>;
  callStack?: string[];
  heap?: Record<string, any>;
  stdout?: string;
  error?: string;
}

export interface VariableValue {
  type: string;
  value: any;
  ref?: string; // ID of object in heap
}

export type ExecutionPhase = 'idle' | 'loading' | 'ready' | 'unsupported';

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

  // Actions
  startExecution: (data: { code: string; fileName: string; language: string }) => void;
  appendEvent: (event: ExecutionEvent) => void;
  markUnsupported: (ext: string) => void;
  nextStep: () => void;
  prevStep: () => void;
  jumpToStep: (step: number) => void;
  togglePlayback: () => void;
  setPlaybackSpeed: (speed: number) => void;
}

export const useExecutionStore = create<ExecutionState>((set, get) => ({
  events: [],
  currentStep: 0,
  isPlaying: false,
  playbackSpeed: 800, // default Speed (Medium)
  code: '',
  fileName: '',
  language: '',
  phase: 'idle',
  unsupportedExt: undefined,

  startExecution: (data) => set({
    events: [],
    code: data.code,
    fileName: data.fileName,
    language: data.language,
    currentStep: 0,
    isPlaying: false,
    phase: 'loading',
    unsupportedExt: undefined
  }),

  appendEvent: (event) => set((state) => ({
    events: [...state.events, event],
    phase: 'ready'
  })),

  markUnsupported: (ext) => set({ phase: 'unsupported', unsupportedExt: ext, events: [] }),

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
    if (currentStep > 0) {
      set({ currentStep: currentStep - 1 });
    }
  },
  
  jumpToStep: (step) => {
    const { events } = get();
    if (step >= 0 && step < events.length) {
      set({ currentStep: step });
    }
  },
  
  togglePlayback: () => set((state) => ({ isPlaying: !state.isPlaying })),
  
  setPlaybackSpeed: (playbackSpeed) => set({ playbackSpeed })
}));
