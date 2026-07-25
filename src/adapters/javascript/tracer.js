const { Worker } = require('worker_threads');
const inspector = require('inspector');
const path = require('path');

if (process.argv.length < 3) {
    console.error('Usage: node tracer.js <target_file>');
    process.exit(1);
}

const targetFile = path.resolve(process.argv[2]);

let stdoutBuffer = '';

// Spawn target code in a worker thread and pause on start
const workerCode = `
  const { parentPort } = require('worker_threads');
  
  // Intercept prints
  process.stdout.write = (chunk) => {
    parentPort.postMessage({ type: 'stdout', data: chunk.toString() });
    return true;
  };
  
  process.stderr.write = (chunk) => {
    parentPort.postMessage({ type: 'stdout', data: chunk.toString() });
    return true;
  };

  console.log = (...args) => {
    parentPort.postMessage({ type: 'stdout', data: args.map(String).join(' ') + '\\n' });
  };
  
  console.error = (...args) => {
    parentPort.postMessage({ type: 'stdout', data: args.map(String).join(' ') + '\\n' });
  };

  try {
    require(${JSON.stringify(targetFile)});
  } catch (e) {
    // Let it throw so inspector captures it
    throw e;
  }
`;

const worker = new Worker(workerCode, {
    eval: true,
    execArgv: ['--inspect-brk=0']
});

worker.on('message', (msg) => {
    if (msg.type === 'stdout') {
        stdoutBuffer += msg.data;
    }
});

// Connect to worker inspector
const session = new inspector.Session();
try {
    session.connectToWorker(worker);
} catch (e) {
    console.error('Failed to connect to worker inspector:', e);
    process.exit(1);
}

function sendEvent(type, line, scope, heap, callStack, error = undefined) {
    const event = {
        type,
        line,
        scope,
        heap,
        callStack,
        stdout: stdoutBuffer,
        ...(error ? { error } : {})
    };
    process.stdout.write(JSON.stringify(event) + '\n');
}

function safeValue(obj) {
    if (obj.type === 'object' && obj.subtype === 'null') return 'null';
    if (obj.type === 'undefined') return 'undefined';
    if (obj.type === 'object') return obj.className || 'Object';
    if (obj.type === 'function') return 'Function';
    return String(obj.value);
}

function post(method, params = {}) {
    return new Promise((resolve, reject) => {
        session.post(method, params, (err, result) => {
            if (err) reject(err);
            else resolve(result);
        });
    });
}

const heap = {};
const seenObjects = new Set();

async function processObject(objectId, type) {
    if (seenObjects.has(objectId)) return objectId;
    seenObjects.add(objectId);

    try {
        const props = await post('Runtime.getProperties', {
            objectId,
            ownProperties: true
        });

        const value = {};
        const refs = [];

        for (const prop of props.result) {
            if (!prop.value || !prop.name) continue;
            if (prop.name === '__proto__' || prop.name === 'length' && type.includes('Array')) continue;

            if (prop.value.objectId) {
                const refId = prop.value.objectId;
                refs.push(refId);
                value[prop.name] = `[Ref: ${refId}]`;
                await processObject(refId, prop.value.type + (prop.value.subtype ? ` (${prop.value.subtype})` : ''));
            } else {
                value[prop.name] = safeValue(prop.value);
            }
        }

        heap[objectId] = {
            type,
            value,
            refs
        };
    } catch (e) {
        // Object might have been collected or is invalid
    }

    return objectId;
}

session.on('Debugger.paused', async (message) => {
    const callFrames = message.params.callFrames;
    if (!callFrames || callFrames.length === 0) {
        await post('Debugger.resume');
        return;
    }

    const frame = callFrames[0];
    
    // Check if we are inside the target file
    const isTarget = frame.url && (frame.url === targetFile || frame.url.includes(path.basename(targetFile)));
    
    if (!isTarget) {
        await post('Debugger.stepInto');
        return;
    }

    const line = frame.location.lineNumber + 1; // 0-indexed
    
    const callStack = callFrames
        .filter(f => f.url && (f.url === targetFile || f.url.includes(path.basename(targetFile))))
        .map(f => f.functionName || '<anonymous>')
        .reverse();

    const localScope = frame.scopeChain.find(s => s.type === 'local' || s.type === 'block');
    const scopeData = {};

    // Reset heap tracking for this step
    Object.keys(heap).forEach(k => delete heap[k]);
    seenObjects.clear();

    if (localScope && localScope.object.objectId) {
        try {
            const props = await post('Runtime.getProperties', {
                objectId: localScope.object.objectId,
                ownProperties: true
            });

            for (const prop of props.result) {
                if (!prop.name || prop.name === 'exports' || prop.name === 'require' || prop.name === 'module' || prop.name === '__filename' || prop.name === '__dirname') {
                    continue;
                }
                
                if (prop.value) {
                    if (prop.value.objectId) {
                        const refId = prop.value.objectId;
                        scopeData[prop.name] = {
                            type: prop.value.type + (prop.value.subtype ? ` (${prop.value.subtype})` : ''),
                            value: prop.value.type,
                            ref: refId
                        };
                        await processObject(refId, prop.value.type + (prop.value.subtype ? ` (${prop.value.subtype})` : ''));
                    } else {
                        scopeData[prop.name] = {
                            type: prop.value.type + (prop.value.subtype ? ` (${prop.value.subtype})` : ''),
                            value: safeValue(prop.value)
                        };
                    }
                }
            }
        } catch (e) {
            // Ignore
        }
    }

    sendEvent('STEP', line, scopeData, heap, callStack);

    await post('Debugger.stepOver');
});

worker.on('exit', (code) => {
    sendEvent('END', -1, {}, {}, []);
    process.exit(code);
});

worker.on('error', (err) => {
    sendEvent('ERROR', -1, {}, {}, [], err.message);
    process.exit(1);
});

async function run() {
    try {
        await post('Debugger.enable');
        await post('Runtime.enable');
    } catch (e) {
        console.error('Failed to initialize debugger session:', e);
        process.exit(1);
    }
}

run();
