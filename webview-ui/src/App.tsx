import { memo, useEffect, useMemo, useRef } from 'react';
import { useExecutionStore } from './store/useExecutionStore';
import './theme.css';
import './App.css';
import { Play, Pause, SkipBack, SkipForward, RotateCcw, Terminal, AlertTriangle, Layers } from 'lucide-react';
import { ReferenceGraph } from './components/ReferenceGraph';
import { VariableInspector } from './components/VariableInspector';
import { getVsCodeApi } from './vscodeApi';

const SPEEDS = [
  { label: 'Slow', value: 1500 },
  { label: 'Med', value: 800 },
  { label: 'Fast', value: 300 },
  { label: 'Inst', value: 100 }
];

/** Renders a byte count as whole megabytes for user-facing messages. */
function formatMegabytes(bytes: number | undefined): string {
  if (!bytes) return 'the size limit';
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

interface CodeLineProps {
  lineNumber: number;
  text: string;
  isCurrent: boolean;
  isPrevious: boolean;
  isFailure: boolean;
}

/**
 * One row of the source listing.
 *
 * Memoized because a step only changes the highlight on a couple of rows —
 * without this, every line in the file re-renders on every step.
 */
const CodeLine = memo(function CodeLine(
  { lineNumber, text, isCurrent, isPrevious, isFailure }: CodeLineProps
) {
  const className = [
    'code-line-row',
    isCurrent ? 'current-executing-line' : '',
    isPrevious ? 'previous-executing-line' : '',
    isFailure ? 'error-executing-line' : ''
  ].filter(Boolean).join(' ');

  return (
    <div className={className}>
      <span className="line-number-gutter">{lineNumber}</span>
      <pre className="code-text-display">{text || ' '}</pre>
    </div>
  );
});

function App() {
  const {
    events, currentStep, isPlaying, playbackSpeed, code, fileName, language,
    phase, unsupportedExt, failureMessage,
    startExecution, appendEvents, markUnsupported, markFailed,
    nextStep, prevStep, togglePlayback, jumpToStep, setPlaybackSpeed
  } = useExecutionStore();

  const activeLineRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      switch (message?.command) {
        case 'EXECUTION_START':
          startExecution(message.payload);
          break;
        case 'EXECUTION_EVENTS':
          appendEvents(message.payload.events);
          break;
        case 'UNSUPPORTED_FILE':
          markUnsupported(message.payload.ext);
          break;
        case 'EXECUTION_FAILED':
          markFailed(message.payload.message);
          break;
      }
    };

    window.addEventListener('message', handleMessage);
    // The extension holds messages until this fires — a webview silently drops
    // anything posted before its scripts finish loading.
    getVsCodeApi().postMessage({ command: 'WEBVIEW_READY' });

    return () => window.removeEventListener('message', handleMessage);
  }, [startExecution, appendEvents, markUnsupported, markFailed]);

  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(nextStep, playbackSpeed);
    return () => clearInterval(interval);
  }, [isPlaying, nextStep, playbackSpeed]);

  useEffect(() => {
    activeLineRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [currentStep]);

  const currentEvent = events[currentStep];
  const previousEvent = currentStep > 0 ? events[currentStep - 1] : undefined;
  const isFailureEvent = currentEvent?.type === 'ERROR' || currentEvent?.type === 'LIMIT';

  const codeLines = useMemo(() => (code ? code.split(/\r?\n/) : []), [code]);

  /** Console output is stored as per-step deltas; rebuild the running text. */
  const consoleOutput = useMemo(() => {
    let output = '';
    const end = Math.min(currentStep, events.length - 1);
    for (let i = 0; i <= end; i++) output += events[i].stdoutDelta ?? '';
    return output;
  }, [events, currentStep]);

  const statusText = useMemo(() => {
    if (phase === 'failed') return 'Failed';
    if (phase === 'unsupported') return `Unsupported file${unsupportedExt ? ` (${unsupportedExt})` : ''}`;
    if (phase === 'loading' && events.length === 0) return 'Parsing code…';
    if (events.length === 0) return 'Awaiting Execution…';
    if (events.length === 1 && events[0].type === 'END') return 'Nothing to Visualize';
    if (currentEvent?.type === 'ERROR') return 'Crashed';
    if (currentEvent?.type === 'LIMIT') return 'Loop Limit Reached';
    if (currentStep === events.length - 1) return 'Finished';
    return isPlaying ? 'Running' : 'Paused';
  }, [phase, unsupportedExt, events, currentEvent, currentStep, isPlaying]);

  const statusClass = statusText === 'Crashed' || statusText === 'Failed'
    ? 'text-error'
    : statusText === 'Loop Limit Reached' ? 'text-limit' : 'text-success';

  const hasEvents = events.length > 0;
  const activeFunction = currentEvent?.callStack?.length
    ? currentEvent.callStack[currentEvent.callStack.length - 1]
    : 'Global Scope';

  return (
    <div className="dashboard-container">
      <header className="glass-panel header">
        <div className="header-title-section">
          <h1>Code Execution Visualizer</h1>
          {fileName && <span className="active-file-tag">{fileName} ({language})</span>}
        </div>
        <div className="status-indicator">
          <span className={`pulse-dot ${isPlaying ? 'pulse' : ''} ${isFailureEvent || phase === 'failed' ? 'error' : ''}`} />
          {hasEvents ? `${statusText} — Step ${currentStep + 1} / ${events.length}` : statusText}
        </div>
      </header>

      <main className="main-layout">
        <div className="glass-panel panel code-editor">
          <h2>Execution Source</h2>
          {codeLines.length > 0 ? (
            <div className="code-viewer-lines">
              {codeLines.map((text, index) => {
                const lineNumber = index + 1;
                const isCurrent = currentEvent?.line === lineNumber;
                return (
                  <div key={index} ref={isCurrent ? activeLineRef : undefined}>
                    <CodeLine
                      lineNumber={lineNumber}
                      text={text}
                      isCurrent={isCurrent}
                      isPrevious={previousEvent?.line === lineNumber}
                      isFailure={isCurrent && isFailureEvent}
                    />
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="placeholder">
              {phase === 'unsupported'
                ? `Unsupported file type${unsupportedExt ? ` (${unsupportedExt})` : ''}. Open a JavaScript or Python file.`
                : phase === 'failed'
                  ? failureMessage
                  : 'No execution loaded. Open a JavaScript or Python file and run "Visualize Execution".'}
            </div>
          )}
        </div>

        <div className="glass-panel panel memory-view" style={{ padding: 0, overflow: 'hidden' }}>
          <h2 style={{
            padding: '1rem', marginBottom: 0, position: 'absolute', zIndex: 10,
            background: 'var(--panel-bg)', width: '100%', borderBottom: '1px solid var(--panel-border)'
          }}>Memory / Graph</h2>
          <div style={{ width: '100%', height: '100%', marginTop: '3.5rem' }}>
            <ReferenceGraph />
          </div>
        </div>

        <div className="side-panels">
          <div className="glass-panel panel state-panel">
            <h2>Current State</h2>
            <div className="state-grid">
              <div className="state-item">
                <span className="state-label">File:</span>
                <span className="state-value highlight-cyan">{fileName || 'N/A'}</span>
              </div>
              <div className="state-item">
                <span className="state-label">Active Function:</span>
                <span className="state-value highlight-pink">{activeFunction}</span>
              </div>
              <div className="state-item">
                <span className="state-label">Line No:</span>
                <span className="state-value highlight-purple">{currentEvent ? currentEvent.line : 'N/A'}</span>
              </div>
              <div className="state-item">
                <span className="state-label">Status:</span>
                <span className={`state-value ${statusClass}`}>{statusText}</span>
              </div>
            </div>
          </div>

          <div className="glass-panel panel variable-inspector">
            <h2>
              Variable Inspector
              {currentEvent && (
                <span className="scope-badge">
                  {currentEvent.callStack?.length ? 'Local' : 'Global'}
                </span>
              )}
            </h2>
            <VariableInspector />
          </div>

          <div className="glass-panel panel call-stack">
            <h2>Call Stack</h2>
            {currentEvent?.callStack?.length ? (
              <div className="stack-frames-list">
                {currentEvent.callStack.map((frameName, index) => {
                  const isActive = index === currentEvent.callStack!.length - 1;
                  return (
                    <div key={`${frameName}-${index}`} className={`stack-frame-item ${isActive ? 'active-frame' : ''}`}>
                      <Layers size={14} className="frame-icon" />
                      <span className="frame-name">{frameName}()</span>
                      {isActive && <span className="active-frame-tag">ACTIVE</span>}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="placeholder">[Global Context]</div>
            )}
          </div>
        </div>
      </main>

      <div className="bottom-layout">
        <div className="glass-panel panel console-output">
          <h2 className="console-title"><Terminal size={14} /> Console Output</h2>
          <pre className="console-text">{consoleOutput || 'Console is empty.'}</pre>
        </div>

        {currentEvent?.type === 'ERROR' && (
          <div className="glass-panel panel error-visualization text-error">
            <h2 className="error-title"><AlertTriangle size={16} /> Runtime Exception</h2>
            <div className="error-content">
              <p className="error-message">{currentEvent.error}</p>
              <span className="error-meta">Crashed on Line {currentEvent.line}</span>
            </div>
          </div>
        )}

        {currentEvent?.type === 'LIMIT' && (
          <div className="glass-panel panel error-visualization limit-visualization">
            <h2 className="error-title"><AlertTriangle size={16} /> Execution Stopped</h2>
            <div className="error-content">
              <p className="error-message">
                {currentEvent.limitReason === 'size'
                  ? `This trace grew past ${formatMegabytes(currentEvent.traceByteLimit)} and was stopped to keep VS Code responsive. ` +
                    'Try visualizing a smaller portion of the program.'
                  : `Possible infinite loop detected — execution halted after ${(currentEvent.stepLimit ?? 5000).toLocaleString()} steps.`}
              </p>
              <span className="error-meta">Halted on Line {currentEvent.line}</span>
            </div>
          </div>
        )}

        {phase === 'failed' && failureMessage && (
          <div className="glass-panel panel error-visualization text-error">
            <h2 className="error-title"><AlertTriangle size={16} /> Could Not Run</h2>
            <div className="error-content">
              <p className="error-message">{failureMessage}</p>
            </div>
          </div>
        )}
      </div>

      <footer className="glass-panel timeline-controls">
        <div className="playback-buttons">
          <button onClick={() => jumpToStep(0)} disabled={currentStep === 0 || !hasEvents} title="Restart">
            <RotateCcw size={20} />
          </button>
          <button onClick={prevStep} disabled={currentStep === 0 || !hasEvents} title="Previous Step">
            <SkipBack size={20} />
          </button>
          <button onClick={togglePlayback} disabled={!hasEvents} className={isPlaying ? 'active' : ''} title="Play/Pause">
            {isPlaying ? <Pause size={20} /> : <Play size={20} />}
          </button>
          <button onClick={nextStep} disabled={currentStep >= events.length - 1 || !hasEvents} title="Next Step">
            <SkipForward size={20} />
          </button>
        </div>

        <div className="speed-selector">
          <span className="speed-label">Playback Speed:</span>
          <div className="speed-buttons">
            {SPEEDS.map(({ label, value }) => (
              <button
                key={value}
                className={playbackSpeed === value ? 'active' : ''}
                onClick={() => setPlaybackSpeed(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="timeline-scrubber">
          <input
            type="range"
            min={0}
            max={hasEvents ? events.length - 1 : 0}
            value={currentStep}
            onChange={(e) => jumpToStep(Number(e.target.value))}
            disabled={!hasEvents}
            className="neon-slider"
          />
        </div>
      </footer>
    </div>
  );
}

export default App;
