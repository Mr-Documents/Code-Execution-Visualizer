import { beforeEach, describe, expect, it } from 'vitest';
import { useExecutionStore, type ExecutionEvent } from './useExecutionStore';

const stepEvent = (line: number, overrides: Partial<ExecutionEvent> = {}): ExecutionEvent => ({
  type: 'STEP',
  line,
  scope: {},
  callStack: [],
  ...overrides,
});

// Zustand stores are module-level singletons, so state must be reset between
// tests to keep them independent.
beforeEach(() => {
  useExecutionStore.setState({
    events: [],
    currentStep: 0,
    isPlaying: false,
    playbackSpeed: 800,
    code: '',
    fileName: '',
    language: '',
    phase: 'idle',
    unsupportedExt: undefined,
  });
});

describe('startExecution', () => {
  it('resets the timeline and enters the loading phase', () => {
    useExecutionStore.getState().appendEvent(stepEvent(1));
    useExecutionStore.setState({ currentStep: 0, isPlaying: true });

    useExecutionStore.getState().startExecution({ code: 'x = 1', fileName: 'a.js', language: 'javascript' });

    const state = useExecutionStore.getState();
    expect(state.events).toEqual([]);
    expect(state.currentStep).toBe(0);
    expect(state.isPlaying).toBe(false);
    expect(state.phase).toBe('loading');
    expect(state.code).toBe('x = 1');
    expect(state.fileName).toBe('a.js');
    expect(state.language).toBe('javascript');
    expect(state.unsupportedExt).toBeUndefined();
  });
});

describe('appendEvent', () => {
  it('appends events incrementally and flips phase to ready', () => {
    const { appendEvent } = useExecutionStore.getState();

    appendEvent(stepEvent(1));
    expect(useExecutionStore.getState().events).toHaveLength(1);
    expect(useExecutionStore.getState().phase).toBe('ready');

    appendEvent(stepEvent(2));
    const state = useExecutionStore.getState();
    expect(state.events).toHaveLength(2);
    expect(state.events[0].line).toBe(1);
    expect(state.events[1].line).toBe(2);
  });
});

describe('markUnsupported', () => {
  it('sets the unsupported phase and clears any prior events', () => {
    useExecutionStore.getState().appendEvent(stepEvent(1));

    useExecutionStore.getState().markUnsupported('.txt');

    const state = useExecutionStore.getState();
    expect(state.phase).toBe('unsupported');
    expect(state.unsupportedExt).toBe('.txt');
    expect(state.events).toEqual([]);
  });
});

describe('step navigation', () => {
  beforeEach(() => {
    const { appendEvent } = useExecutionStore.getState();
    appendEvent(stepEvent(1));
    appendEvent(stepEvent(2));
    appendEvent(stepEvent(3));
  });

  it('nextStep advances while more events remain', () => {
    useExecutionStore.getState().nextStep();
    expect(useExecutionStore.getState().currentStep).toBe(1);
  });

  it('nextStep at the last event stops playback instead of overrunning', () => {
    useExecutionStore.setState({ currentStep: 2, isPlaying: true });
    useExecutionStore.getState().nextStep();

    const state = useExecutionStore.getState();
    expect(state.currentStep).toBe(2);
    expect(state.isPlaying).toBe(false);
  });

  it('prevStep never goes below zero', () => {
    useExecutionStore.getState().prevStep();
    expect(useExecutionStore.getState().currentStep).toBe(0);
  });

  it('jumpToStep ignores out-of-range targets', () => {
    useExecutionStore.getState().jumpToStep(-1);
    expect(useExecutionStore.getState().currentStep).toBe(0);

    useExecutionStore.getState().jumpToStep(99);
    expect(useExecutionStore.getState().currentStep).toBe(0);

    useExecutionStore.getState().jumpToStep(2);
    expect(useExecutionStore.getState().currentStep).toBe(2);
  });
});

describe('playback controls', () => {
  it('togglePlayback flips isPlaying', () => {
    expect(useExecutionStore.getState().isPlaying).toBe(false);
    useExecutionStore.getState().togglePlayback();
    expect(useExecutionStore.getState().isPlaying).toBe(true);
    useExecutionStore.getState().togglePlayback();
    expect(useExecutionStore.getState().isPlaying).toBe(false);
  });

  it('setPlaybackSpeed updates the speed', () => {
    useExecutionStore.getState().setPlaybackSpeed(300);
    expect(useExecutionStore.getState().playbackSpeed).toBe(300);
  });
});
