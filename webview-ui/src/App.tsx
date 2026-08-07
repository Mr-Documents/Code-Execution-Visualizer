import { useEffect, useRef } from 'react';
import { useExecutionStore } from './store/useExecutionStore';
import './theme.css';
import './App.css';
import { Play, Pause, SkipBack, SkipForward, RotateCcw, Terminal, AlertTriangle, Layers } from 'lucide-react';
import { ReferenceGraph } from './components/ReferenceGraph';
import { VariableInspector } from './components/VariableInspector';

function App() {
  const {
    events, currentStep, isPlaying, playbackSpeed, code, fileName, language, phase, unsupportedExt,
    startExecution, appendEvent, markUnsupported, nextStep, prevStep, togglePlayback, jumpToStep, setPlaybackSpeed
  } = useExecutionStore();

  const activeLineRef = useRef<HTMLDivElement | null>(null);
  const codeContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // Listen for messages from the VS Code extension
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      switch (message.command) {
        case 'EXECUTION_START':
          startExecution({
            code: message.payload.code,
            fileName: message.payload.fileName,
            language: message.payload.language
          });
          break;
        case 'EXECUTION_EVENT':
          appendEvent(message.payload.event);
          break;
        case 'UNSUPPORTED_FILE':
          markUnsupported(message.payload.ext);
          break;
      }
    };

    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [startExecution, appendEvent, markUnsupported]);

  // Auto-playback effect based on user selected speed
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isPlaying) {
      interval = setInterval(() => {
        nextStep();
      }, playbackSpeed);
    }
    return () => clearInterval(interval);
  }, [isPlaying, nextStep, playbackSpeed]);

  // Scrolling should automatically follow execution
  useEffect(() => {
    if (activeLineRef.current) {
      activeLineRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [currentStep]);

  const currentEvent = events[currentStep];
  const prevEvent = currentStep > 0 ? events[currentStep - 1] : undefined;

  // Split code into lines for rendering
  const codeLines = code ? code.split(/\r?\n/) : [];

  // Determine current execution status string
  let statusString = 'Awaiting Execution...';
  if (phase === 'loading' && events.length === 0) {
    statusString = 'Parsing code...';
  } else if (phase === 'unsupported') {
    statusString = `Unsupported file${unsupportedExt ? ` (${unsupportedExt})` : ''}`;
  } else if (events.length === 1 && events[0].type === 'END') {
    statusString = 'Nothing to Visualize';
  } else if (events.length > 0) {
    if (currentEvent?.type === 'ERROR') statusString = 'Crashed';
    else if (currentEvent?.type === 'LIMIT') statusString = 'Loop Limit Reached';
    else if (currentStep === events.length - 1) statusString = 'Finished';
    else if (isPlaying) statusString = 'Running';
    else statusString = 'Paused';
  }

  return (
    <div className="dashboard-container">
      <header className="glass-panel header">
        <div className="header-title-section">
          <h1>Code Execution Visualizer</h1>
          {fileName && <span className="active-file-tag">{fileName} ({language})</span>}
        </div>
        <div className="status-indicator">
          <span className={`pulse-dot ${isPlaying ? 'pulse' : ''} ${currentEvent?.type === 'ERROR' || currentEvent?.type === 'LIMIT' ? 'error' : ''}`}></span>
          {events.length > 0 ? `${statusString} — Step ${currentStep + 1} / ${events.length}` : statusString}
        </div>
      </header>

      <main className="main-layout">
        {/* Code Editor Panel */}
        <div className="glass-panel panel code-editor" ref={codeContainerRef}>
          <h2>Execution Source</h2>
          {codeLines.length > 0 ? (
            <div className="code-viewer-lines">
              {phase === 'loading' && events.length === 0 && (
                <div className="placeholder">Starting tracer...</div>
              )}
              {codeLines.map((lineText, idx) => {
                const lineNum = idx + 1;
                const isCurrent = currentEvent && lineNum === currentEvent.line;
                const isPrev = prevEvent && lineNum === prevEvent.line;
                const isErrorLine = isCurrent && (currentEvent?.type === 'ERROR' || currentEvent?.type === 'LIMIT');

                return (
                  <div
                    key={idx}
                    ref={isCurrent ? activeLineRef : null}
                    className={`code-line-row ${isCurrent ? 'current-executing-line' : ''} ${isPrev ? 'previous-executing-line' : ''} ${isErrorLine ? 'error-executing-line' : ''}`}
                  >
                    <span className="line-number-gutter">{lineNum}</span>
                    <pre className="code-text-display">{lineText || ' '}</pre>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="placeholder">
              {phase === 'unsupported'
                ? `Unsupported file type${unsupportedExt ? ` (${unsupportedExt})` : ''}. Open a JavaScript or Python file.`
                : 'No execution loaded. Open a JavaScript or Python file and run "Visualize Execution".'}
            </div>
          )}
        </div>

        {/* Memory Graph Panel */}
        <div className="glass-panel panel memory-view" style={{ padding: 0, overflow: 'hidden' }}>
          <h2 style={{ padding: '1rem', marginBottom: 0, position: 'absolute', zIndex: 10, background: 'var(--panel-bg)', width: '100%', borderBottom: '1px solid var(--panel-border)' }}>Memory / Graph</h2>
          <div style={{ width: '100%', height: '100%', marginTop: '3.5rem' }}>
            <ReferenceGraph />
          </div>
        </div>

        {/* Side panels */}
        <div className="side-panels">
          {/* Current State Metadata Panel */}
          <div className="glass-panel panel state-panel">
            <h2>Current State</h2>
            <div className="state-grid">
              <div className="state-item">
                <span className="state-label">File:</span>
                <span className="state-value highlight-cyan">{fileName || 'N/A'}</span>
              </div>
              <div className="state-item">
                <span className="state-label">Active Function:</span>
                <span className="state-value highlight-pink">
                  {currentEvent?.callStack && currentEvent.callStack.length > 0 
                    ? currentEvent.callStack[currentEvent.callStack.length - 1] 
                    : 'Global Scope'}
                </span>
              </div>
              <div className="state-item">
                <span className="state-label">Line No:</span>
                <span className="state-value highlight-purple">{currentEvent ? currentEvent.line : 'N/A'}</span>
              </div>
              <div className="state-item">
                <span className="state-label">Status:</span>
                <span className={`state-value ${statusString === 'Crashed' ? 'text-error' : statusString === 'Loop Limit Reached' ? 'text-limit' : 'text-success'}`}>{statusString}</span>
              </div>
            </div>
          </div>

          {/* Variable Inspector */}
          <div className="glass-panel panel variable-inspector">
            <h2>
              Variable Inspector
              {currentEvent && (
                <span className="scope-badge">
                  {currentEvent.callStack && currentEvent.callStack.length > 0 ? 'Local' : 'Global'}
                </span>
              )}
            </h2>
            <VariableInspector />
          </div>
          
          {/* Call Stack Panel */}
          <div className="glass-panel panel call-stack">
            <h2>Call Stack</h2>
            {currentEvent?.callStack && currentEvent.callStack.length > 0 ? (
              <div className="stack-frames-list">
                {currentEvent.callStack.map((frameName, index) => {
                  const isActive = index === currentEvent.callStack!.length - 1;
                  return (
                    <div key={index} className={`stack-frame-item ${isActive ? 'active-frame' : ''}`}>
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

      {/* Console and Error panel displays */}
      <div className="bottom-layout">
        {/* Live Console Output */}
        <div className="glass-panel panel console-output">
          <h2 className="console-title"><Terminal size={14} /> Console Output</h2>
          <pre className="console-text">
            {currentEvent?.stdout ? currentEvent.stdout : 'Console is empty.'}
          </pre>
        </div>

        {/* Error panel */}
        {currentEvent?.type === 'ERROR' && (
          <div className="glass-panel panel error-visualization text-error">
            <h2 className="error-title"><AlertTriangle size={16} /> Runtime Exception</h2>
            <div className="error-content">
              <p className="error-message">{currentEvent.error}</p>
              <span className="error-meta">Crashed on Line {currentEvent.line}</span>
            </div>
          </div>
        )}

        {/* Infinite-loop protection panel */}
        {currentEvent?.type === 'LIMIT' && (
          <div className="glass-panel panel error-visualization limit-visualization">
            <h2 className="error-title"><AlertTriangle size={16} /> Execution Stopped</h2>
            <div className="error-content">
              <p className="error-message">Possible infinite loop detected — execution halted after 5000 steps.</p>
              <span className="error-meta">Halted on Line {currentEvent.line}</span>
            </div>
          </div>
        )}
      </div>

      <footer className="glass-panel timeline-controls">
        <div className="playback-buttons">
          <button onClick={() => jumpToStep(0)} disabled={currentStep === 0 || events.length === 0} title="Restart">
            <RotateCcw size={20} />
          </button>
          <button onClick={prevStep} disabled={currentStep === 0 || events.length === 0} title="Previous Step">
            <SkipBack size={20} />
          </button>
          <button onClick={togglePlayback} disabled={events.length === 0} className={isPlaying ? 'active' : ''} title="Play/Pause">
            {isPlaying ? <Pause size={20} /> : <Play size={20} />}
          </button>
          <button onClick={nextStep} disabled={currentStep === events.length - 1 || events.length === 0} title="Next Step">
            <SkipForward size={20} />
          </button>
        </div>

        {/* Speed Selector */}
        <div className="speed-selector">
          <span className="speed-label">Playback Speed:</span>
          <div className="speed-buttons">
            <button 
              className={playbackSpeed === 1500 ? 'active' : ''} 
              onClick={() => setPlaybackSpeed(1500)}
            >
              Slow
            </button>
            <button 
              className={playbackSpeed === 800 ? 'active' : ''} 
              onClick={() => setPlaybackSpeed(800)}
            >
              Med
            </button>
            <button 
              className={playbackSpeed === 300 ? 'active' : ''} 
              onClick={() => setPlaybackSpeed(300)}
            >
              Fast
            </button>
            <button 
              className={playbackSpeed === 100 ? 'active' : ''} 
              onClick={() => setPlaybackSpeed(100)}
            >
              Inst
            </button>
          </div>
        </div>
        
        <div className="timeline-scrubber">
          <input 
            type="range" 
            min={0} 
            max={events.length > 0 ? events.length - 1 : 0} 
            value={currentStep}
            onChange={(e) => jumpToStep(Number(e.target.value))}
            disabled={events.length === 0}
            className="neon-slider"
          />
        </div>
      </footer>
    </div>
  );
}

export default App;
