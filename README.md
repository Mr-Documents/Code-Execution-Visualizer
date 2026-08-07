# Code Execution Visualizer

<div align="center">

A futuristic holographic cyberpunk code execution visualization dashboard for Visual Studio Code.

[![VS Code Version](https://img.shields.io/badge/VS%20Code-^1.80.0-blue.svg)](https://code.visualstudio.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.1.3-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19.2.7-cyan.svg)](https://react.dev/)

</div>

---

## ✨ Features

### Real-Time Execution Tracking
- **Line-by-Line Visualization**: Watch your code execute step-by-step with precise line tracking
- **Live Variable Inspection**: Monitor variable values and types as they change during execution
- **Call Stack Monitoring**: View the complete function call hierarchy at any point in execution

### Interactive Timeline Controls
- **Playback Controls**: Play, pause, step forward, step backward, and restart execution
- **Timeline Scrubber**: Drag to jump to any point in the execution timeline
- **Auto-Playback**: Watch your code execute automatically with adjustable speed

### Memory Visualization
- **Reference Graph**: Interactive graph showing object relationships and memory references
- **Heap Tracking**: Visual representation of memory allocation and object references
- **Variable Inspector**: Detailed view of all variables in current scope with types and values

### Multi-Language Support
- **JavaScript**: Full support using the Node.js V8 Debugger Protocol for accurate step-through, including nested function calls, runtime exceptions, and infinite-loop protection
- **Python**: Experimental support using Python's built-in `sys.settrace` — not yet covered by the same hardening as the JavaScript path

### Cyberpunk UI Design
- **Glass Morphism Panels**: Modern frosted glass aesthetic with blur effects
- **Neon Accent Colors**: Vibrant cyberpunk-inspired color scheme
- **Smooth Animations**: Fluid transitions powered by Framer Motion
- **Responsive Layout**: Clean, organized dashboard interface

---

## 🚀 Installation

### Prerequisites
- Visual Studio Code (version 1.80.0 or higher)
- Node.js (for JavaScript tracing)
- Python 3.x (for Python tracing)

### Build from Source

1. **Clone the repository**
   ```bash
   git clone https://github.com/YOUR_GITHUB_USERNAME/code-execution-visualizer.git
   cd "code Execution Visualizer"
   ```

2. **Install dependencies**
   ```bash
   npm run install:all
   ```

3. **Build the extension**
   ```bash
   npm run compile
   npm run build:webview
   ```

4. **Install in VS Code**
   - Open VS Code
   - Go to Extensions → Install from VSIX...
   - Select the generated package

---

## 📖 Usage

### Basic Usage

1. **Open a Python or JavaScript file** in VS Code
   ```python
   # example.py
   print("Starting script...")
   
   def greet(user_name):
       msg = f"Hello, {user_name}!"
       return msg
   
   name = "Alice"
   greet(name)
   ```

2. **Launch the Visualizer**
   - Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac)
   - Type "Visualize Execution"
   - Select the command

3. **Explore the Dashboard**
   - Use the timeline controls to step through execution
   - Watch variables update in the Variable Inspector
   - View object relationships in the Reference Graph
   - Monitor the call stack as functions are called

### Controls

| Control | Action |
|---------|--------|
| ⏮️ | Jump to first step |
| ⏪ | Step backward |
| ⏯️ | Play/Pause auto-playback |
| ⏩ | Step forward |
| 🔴 | Timeline scrubber (drag to navigate) |

---

## 🏗️ Architecture

### Extension Core
- **ExecutionManager**: Manages the visualization lifecycle and coordinates between tracers and UI
- **Adapter Pattern**: Unified interface for different language tracers
- **Webview Integration**: Seamless communication between extension and React UI

### Language Tracers
- **Python Tracer**: Uses `sys.settrace` to hook into every executed line
- **JavaScript Tracer**: Uses Node.js `inspector` module (V8 Debugger Protocol) for step-through debugging

### Webview UI
- **React 19**: Modern, component-based UI architecture
- **Zustand**: Lightweight state management for execution timeline
- **ReactFlow**: Interactive graph visualization for memory references
- **Framer Motion**: Smooth animations and transitions
- **Lucide React**: Beautiful, consistent icon set

---

## 📁 Project Structure

```
code Execution Visualizer/
├── src/
│   ├── adapters/           # Language tracer adapters
│   │   ├── Adapter.ts     # Common adapter interface
│   │   ├── python/        # Python tracer implementation
│   │   └── javascript/    # JavaScript tracer implementation
│   ├── core/
│   │   └── ExecutionManager.ts  # Main execution coordinator
│   └── extension.ts       # VS Code extension entry point
├── webview-ui/            # React-based visualization UI
│   ├── src/
│   │   ├── components/    # React components
│   │   │   ├── VariableInspector.tsx
│   │   │   └── ReferenceGraph.tsx
│   │   ├── store/         # Zustand state management
│   │   │   └── useExecutionStore.ts
│   │   ├── App.tsx        # Main application component
│   │   └── theme.css      # Cyberpunk styling
│   └── package.json
├── package.json
└── README.md
```

---

## 🔧 Development

### Available Scripts

| Command | Description |
|---------|-------------|
| `npm run compile` | Compile TypeScript extension |
| `npm run watch` | Watch mode for development |
| `npm run package` | Build production package |
| `npm run build:webview` | Build React webview UI |
| `npm run install:all` | Install all dependencies |

### Building the Webview UI

```bash
cd webview-ui
npm install
npm run build
```

### Compiling the Extension

```bash
npm run compile
```

### Debugging the tracers

Both tracers honour two environment variables:

| Variable | Default | Purpose |
|---|---|---|
| `CEV_TRACER_DEBUG` | off | Log the V8 Inspector protocol exchange to stderr. Off by default because it easily exceeds the size of the trace itself. |
| `CEV_MAX_STEPS` | `5000` | Override the infinite-loop step cap. The JavaScript tracer costs one debugger round trip per step, so the test suite lowers this to keep runs fast. |
| `CEV_MAX_TRACE_BYTES` | `33554432` (32 MB) | Override the total trace size cap. Steps alone don't bound memory — a program holding a large structure re-serializes it on every step — so this is what actually protects the UI. |

```bash
CEV_TRACER_DEBUG=1 node src/adapters/javascript/tracer.js path/to/script.js
CEV_MAX_STEPS=100 node src/adapters/javascript/tracer.js path/to/script.js
```

---

## 🎨 UI Components

### Variable Inspector
Displays all variables in the current execution scope with:
- Variable names and types
- Current values
- Object reference IDs
- Real-time updates as execution progresses

### Reference Graph
Interactive visualization showing:
- Object relationships and references
- Memory allocation patterns
- Heap structure visualization
- Zoom and pan capabilities

### Timeline Controls
Intuitive playback interface:
- Step-by-step navigation
- Continuous playback
- Timeline scrubbing
- Progress indicator

---

## 🧪 Testing

### Automated

CI (`.github/workflows/ci.yml`) runs on every push/PR against Ubuntu and
Windows: type-checks and builds both the extension and the webview, then runs:

```bash
npm run test:tracer   # spawns the tracers against fixtures in test/ and
                       # asserts on the emitted event stream (normal run,
                       # thrown exception, infinite-loop step cap, empty file)
npm run test:webview  # vitest unit tests for the execution store
```

### Manual

Example scripts are included for manually exercising the dashboard UI:

- **test.py**: Python test script with function calls and variable assignments
- **test.js**: JavaScript test script with similar functionality

To test the visualizer:
1. Open either test file in VS Code
2. Run "Visualize Execution" command
3. Observe the execution timeline and variable updates

---

## 🔮 Future Enhancements

- [ ] Harden and fully support Python (currently experimental)
- [ ] Support for additional languages (TypeScript, Java, C++)
- [ ] Breakpoints and step into/over/out controls
- [ ] Export execution traces to JSON
- [ ] Performance profiling mode
- [ ] Custom theme support
- [ ] Configurable step limit (currently a fixed 5000-step cap)

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit pull requests or open issues for bugs and feature requests.

---

## 📊 Tech Stack

**Extension**
- TypeScript 5.1.3
- VS Code API
- Webpack 5.85.0

**Webview UI**
- React 19.2.7
- TypeScript 6.0.2
- Vite 8.1.1
- Zustand 5.0.14
- ReactFlow 11.11.4
- Framer Motion 12.42.2
- Lucide React 1.25.0




