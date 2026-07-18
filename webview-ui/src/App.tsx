import { useEffect } from 'react';
import { useExecutionStore } from './store/useExecutionStore';
import './theme.css';
import './App.css';
import { Play, Pause, SkipBack, SkipForward, RotateCcw } from 'lucide-react';
import { ReferenceGraph } from './components/ReferenceGraph';
import { VariableInspector } from './components/VariableInspector';

function App() {
  const { 
    events, currentStep, isPlaying, 
    setEvents, nextStep, prevStep, togglePlayback, jumpToStep
  } = useExecutionStore();

  useEffect(() => {
    // Initialize Web Worker
    const worker = new Worker(new URL('./workers/executionWorker.ts', import.meta.url), { type: 'module' });

    worker.onmessage = (e: MessageEvent) => {
      if (e.data.type === 'EVENTS_PROCESSED') {
        setEvents(e.data.payload);
      }
    };

    // Listen for messages from the VS Code extension
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      switch (message.command) {
        case 'EXECUTION_EVENTS':
          // Offload to Web Worker instead of freezing main thread
          worker.postMessage({ type: 'PARSE_EVENTS', payload: message.payload });
          break;
      }
    };

    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
      worker.terminate();
    };
  }, [setEvents]);

  // Auto-playback effect
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isPlaying) {
      interval = setInterval(() => {
        nextStep();
      }, 800); // fixed speed for now
    }
    return () => clearInterval(interval);
  }, [isPlaying, nextStep]);

  const currentEvent = events[currentStep];

  return (
    <div className="dashboard-container">
      <header className="glass-panel header">
        <h1>Code Execution Visualizer</h1>
        <div className="status-indicator">
          <span className="pulse-dot"></span>
          {events.length > 0 ? `Step ${currentStep + 1} / ${events.length}` : 'Awaiting Execution Data...'}
        </div>
      </header>

      <main className="main-layout">
        <div className="glass-panel panel code-editor">
          <h2>Execution Source</h2>
          <div className="placeholder">
            {currentEvent ? `Executing Line: ${currentEvent.line}` : 'No execution loaded'}
          </div>
        </div>

        <div className="glass-panel panel memory-view" style={{ padding: 0, overflow: 'hidden' }}>
          <h2 style={{ padding: '1rem', marginBottom: 0, position: 'absolute', zIndex: 10, background: 'var(--panel-bg)', width: '100%', borderBottom: '1px solid var(--panel-border)' }}>Memory / Graph</h2>
          <div style={{ width: '100%', height: '100%', marginTop: '3.5rem' }}>
            <ReferenceGraph />
          </div>
        </div>

        <div className="side-panels">
          <div className="glass-panel panel variable-inspector">
            <h2>Variable Inspector</h2>
            <VariableInspector />
          </div>
          
          <div className="glass-panel panel call-stack">
            <h2>Call Stack</h2>
            <div className="placeholder">
              [Stack Frames]
            </div>
          </div>
        </div>
      </main>

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
