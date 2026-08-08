import { beforeEach, describe, expect, it } from 'vitest';
import { useExecutionStore, selectStateEvent, type ExecutionEvent } from './useExecutionStore';

const step = (line: number, overrides: Partial<ExecutionEvent> = {}): ExecutionEvent => ({
  type: 'STEP',
  line,
  scope: {},
  callStack: [],
  ...overrides
});

const reset = () => useExecutionStore.setState({
  events: [],
  currentStep: 0,
  isPlaying: false,
  playbackSpeed: 800,
  code: '',
  fileName: '',
  language: '',
  phase: 'idle',
  unsupportedExt: undefined,
  failureMessage: undefined
});

// The store is a module-level singleton, so state must be reset between tests.
beforeEach(reset);

describe('startExecution', () => {
  it('resets the timeline and enters the loading phase', () => {
    useExecutionStore.getState().appendEvents([step(1)]);
    useExecutionStore.setState({ isPlaying: true });

    useExecutionStore.getState().startExecution({
      code: 'x = 1', fileName: 'a.js', language: 'javascript'
    });

    const state = useExecutionStore.getState();
    expect(state.events).toEqual([]);
    expect(state.currentStep).toBe(0);
    expect(state.isPlaying).toBe(false);
    expect(state.phase).toBe('loading');
    expect(state.code).toBe('x = 1');
    expect(state.fileName).toBe('a.js');
    expect(state.language).toBe('javascript');
  });

  it('clears a previous run failure', () => {
    useExecutionStore.getState().markFailed('node not found');

    useExecutionStore.getState().startExecution({ code: '', fileName: 'b.js', language: 'javascript' });

    expect(useExecutionStore.getState().failureMessage).toBeUndefined();
    expect(useExecutionStore.getState().phase).toBe('loading');
  });
});

describe('appendEvents', () => {
  it('appends a batch in order and flips phase to ready', () => {
    useExecutionStore.getState().appendEvents([step(1), step(2)]);

    const state = useExecutionStore.getState();
    expect(state.events.map((e) => e.line)).toEqual([1, 2]);
    expect(state.phase).toBe('ready');
  });

  it('accumulates across batches without dropping earlier events', () => {
    const { appendEvents } = useExecutionStore.getState();
    appendEvents([step(1), step(2)]);
    appendEvents([step(3)]);

    expect(useExecutionStore.getState().events.map((e) => e.line)).toEqual([1, 2, 3]);
  });

  it('ignores an empty batch', () => {
    useExecutionStore.getState().appendEvents([]);

    const state = useExecutionStore.getState();
    expect(state.events).toEqual([]);
    expect(state.phase).toBe('idle');
  });

  it('does not overwrite a terminal failure phase', () => {
    useExecutionStore.getState().markFailed('tracer died');
    useExecutionStore.getState().appendEvents([step(1)]);

    expect(useExecutionStore.getState().phase).toBe('failed');
  });
});

describe('markUnsupported', () => {
  it('sets the unsupported phase and clears prior events', () => {
    useExecutionStore.getState().appendEvents([step(1)]);

    useExecutionStore.getState().markUnsupported('.txt');

    const state = useExecutionStore.getState();
    expect(state.phase).toBe('unsupported');
    expect(state.unsupportedExt).toBe('.txt');
    expect(state.events).toEqual([]);
  });
});

describe('markFailed', () => {
  it('records the message, stops playback, and keeps events for inspection', () => {
    useExecutionStore.getState().appendEvents([step(1), step(2)]);
    useExecutionStore.setState({ isPlaying: true });

    useExecutionStore.getState().markFailed('Could not find node on your PATH.');

    const state = useExecutionStore.getState();
    expect(state.phase).toBe('failed');
    expect(state.failureMessage).toBe('Could not find node on your PATH.');
    expect(state.isPlaying).toBe(false);
    expect(state.events).toHaveLength(2);
  });
});

describe('step navigation', () => {
  beforeEach(() => {
    useExecutionStore.getState().appendEvents([step(1), step(2), step(3)]);
  });

  it('nextStep advances while events remain', () => {
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
    const { jumpToStep } = useExecutionStore.getState();

    jumpToStep(-1);
    expect(useExecutionStore.getState().currentStep).toBe(0);

    jumpToStep(99);
    expect(useExecutionStore.getState().currentStep).toBe(0);

    jumpToStep(2);
    expect(useExecutionStore.getState().currentStep).toBe(2);
  });
});

describe('playback controls', () => {
  it('togglePlayback flips isPlaying', () => {
    const { togglePlayback } = useExecutionStore.getState();

    togglePlayback();
    expect(useExecutionStore.getState().isPlaying).toBe(true);

    togglePlayback();
    expect(useExecutionStore.getState().isPlaying).toBe(false);
  });

  it('setPlaybackSpeed updates the speed', () => {
    useExecutionStore.getState().setPlaybackSpeed(300);
    expect(useExecutionStore.getState().playbackSpeed).toBe(300);
  });
});

describe('selectStateEvent', () => {
  const withState = (line: number): ExecutionEvent => ({
    type: 'STEP',
    line,
    scope: { x: { type: 'number', value: line } },
    heap: { 'ref-1': { type: 'object', value: {}, refs: [] } },
    callStack: []
  });
  const terminal = (type: 'END' | 'LIMIT'): ExecutionEvent => ({
    type, line: -1, scope: {}, heap: {}, callStack: []
  });

  it('returns the current event when it has state', () => {
    const events = [withState(1), withState(2)];
    expect(selectStateEvent(events, 1)).toBe(events[1]);
  });

  it('falls back to the last state-bearing event at END', () => {
    // Regression: END carries no scope/heap because the program has exited,
    // which blanked the graph and inspector the instant a run finished.
    const events = [withState(1), withState(2), terminal('END')];
    expect(selectStateEvent(events, 2)).toBe(events[1]);
  });

  it('falls back at a size-capped LIMIT, which also omits state', () => {
    const events = [withState(1), terminal('LIMIT')];
    expect(selectStateEvent(events, 1)).toBe(events[0]);
  });

  it('does NOT fall back for a STEP that is legitimately empty', () => {
    // A step before anything is declared really has no variables; showing an
    // earlier step's state there would misrepresent the program.
    const empty: ExecutionEvent = { type: 'STEP', line: 3, scope: {}, heap: {}, callStack: [] };
    const events = [withState(1), empty];
    expect(selectStateEvent(events, 1)).toBe(empty);
  });

  it('does not fall back for an ERROR, which now carries crash state', () => {
    const crash: ExecutionEvent = {
      type: 'ERROR', line: 3, scope: {}, heap: {}, callStack: [], error: 'boom'
    };
    const events = [withState(1), crash];
    expect(selectStateEvent(events, 1)).toBe(crash);
  });

  it('returns the terminal event itself when nothing before it had state', () => {
    const events = [terminal('END')];
    expect(selectStateEvent(events, 0)).toBe(events[0]);
  });

  it('returns undefined for an out-of-range step', () => {
    expect(selectStateEvent([], 0)).toBeUndefined();
  });
});

describe('console output reconstruction', () => {
  // Events carry per-step deltas; the UI concatenates them up to the current
  // step. This guards the contract both sides depend on.
  it('concatenating deltas up to a step yields the output at that step', () => {
    useExecutionStore.getState().appendEvents([
      step(1, { stdoutDelta: 'a\n' }),
      step(2, { stdoutDelta: '' }),
      step(3, { stdoutDelta: 'b\n' })
    ]);

    const { events } = useExecutionStore.getState();
    const outputAt = (i: number) =>
      events.slice(0, i + 1).map((e) => e.stdoutDelta ?? '').join('');

    expect(outputAt(0)).toBe('a\n');
    expect(outputAt(1)).toBe('a\n');
    expect(outputAt(2)).toBe('a\nb\n');
  });
});
