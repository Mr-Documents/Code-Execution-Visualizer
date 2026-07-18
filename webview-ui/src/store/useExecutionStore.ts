import { create } from 'zustand';

// Types for the MVP execution events
export interface ExecutionEvent {
  type: 'STEP' | 'EXCEPTION' | 'CALL' | 'RETURN';
  line: number;
  scope: Record<string, VariableValue>;
  callStack?: string[];
  heap?: Record<string, any>;
}

export interface VariableValue {
  type: string;
  value: any;
  ref?: string; // ID of object in heap
}

interface ExecutionState {
  events: ExecutionEvent[];
  currentStep: number;
  isPlaying: boolean;
  playbackSpeed: number;
  
  // Actions
  setEvents: (events: ExecutionEvent[]) => void;
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
  playbackSpeed: 1000,

  setEvents: (events) => set({ events, currentStep: 0, isPlaying: false }),
  
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
