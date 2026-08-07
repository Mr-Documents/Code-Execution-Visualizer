const { spawn } = require('child_process');
const path = require('path');
const net = require('net');
const crypto = require('crypto');

if (process.argv.length < 3) {
    console.error('Usage: node tracer.js <target_file>');
    process.exit(1);
}

const targetFile = path.resolve(process.argv[2]);

// Spawn node with debugger paused on start
const child = spawn('node', ['--inspect-brk=0', targetFile]);

let stdoutBuffer = '';
let stderrBuffer = '';
let wsClient = null;

const MAX_STEPS = 5000;
let stepCount = 0;
let terminatedEarly = false; // set once we've already sent a LIMIT/ERROR event, to suppress the exit handler's END

child.stdout.on('data', (data) => {
    stdoutBuffer += data.toString();
});

child.stderr.on('data', (data) => {
    const str = data.toString();
    stderrBuffer += str;
    
    // Log child stderr for debugging
    process.stderr.write(`[Child Stderr] ${str}`);
    
    // If not connected yet, try to find the debug socket URL
    if (!wsClient) {
        const match = stderrBuffer.match(/ws:\/\/127\.0\.0\.1:\d+\/[a-f0-9-]+/);
        if (match) {
            const wsUrl = match[0];
            connectDebugWS(wsUrl);
        }
    }
});

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

// Low-level net.Socket WebSocket client for V8 DevTools Debugger
function connectDebugWS(url) {
    process.stderr.write(`[Tracer Debug] Connecting to ${url}\n`);
    const parsed = new URL(url);
    const host = parsed.hostname;
    const port = parsed.port || 80;
    const requestPath = parsed.pathname + parsed.search;
    
    const key = crypto.randomBytes(16).toString('base64');
    const socket = net.connect(port, host, () => {
        socket.write(
            `GET ${requestPath} HTTP/1.1\r\n` +
            `Host: ${host}:${port}\r\n` +
            `Upgrade: websocket\r\n` +
            `Connection: Upgrade\r\n` +
            `Sec-WebSocket-Key: ${key}\r\n` +
            `Sec-WebSocket-Version: 13\r\n\r\n`
        );
    });

    let handshaken = false;
    let buffer = Buffer.alloc(0);

    const pendingRequests = new Map();
    let idCounter = 1;

    function sendCommand(method, params = {}) {
        return new Promise((resolve, reject) => {
            const id = idCounter++;
            pendingRequests.set(id, { resolve, reject });
            const msg = JSON.stringify({ id, method, params });
            
            process.stderr.write(`[Tracer Debug] Send Command: ${msg}\n`);

            const payload = Buffer.from(msg, 'utf8');
            const len = payload.length;
            let header;
            
            // Masking is REQUIRED for client frames sent to server
            const mask = crypto.randomBytes(4);
            
            if (len < 126) {
                header = Buffer.alloc(6);
                header[0] = 0x81; // text, fin
                header[1] = len | 0x80;
                mask.copy(header, 2);
            } else if (len < 65536) {
                header = Buffer.alloc(8);
                header[0] = 0x81;
                header[1] = 126 | 0x80;
                header.writeUInt16BE(len, 2);
                mask.copy(header, 4);
            } else {
                header = Buffer.alloc(14);
                header[0] = 0x81;
                header[1] = 127 | 0x80;
                header.writeBigUInt64BE(BigInt(len), 2);
                mask.copy(header, 10);
            }

            const maskedPayload = Buffer.alloc(len);
            for (let i = 0; i < len; i++) {
                maskedPayload[i] = payload[i] ^ mask[i % 4];
            }

            socket.write(Buffer.concat([header, maskedPayload]));
        });
    }

    const heap = {};
    const seenObjects = new Set();
    // Debugger.paused callFrames often carry an empty `url` — the reliable way
    // to resolve a frame's source file is via its scriptId through this map,
    // built from Debugger.scriptParsed events.
    const scriptUrls = {};
    function resolveFrameUrl(frame) {
        return frame.url || scriptUrls[frame.location.scriptId] || '';
    }

    async function processObject(objectId, type) {
        if (seenObjects.has(objectId)) return objectId;
        seenObjects.add(objectId);

        // Function objects' prototype/constructor chain leads into built-ins
        // (Function.prototype.constructor -> Function -> prototype -> ...).
        // V8 mints a fresh objectId every time that chain is inspected, so the
        // seenObjects dedup above never catches it and this recurses forever.
        // Functions aren't useful in a heap view anyway — record them shallowly.
        if (type.startsWith('function')) {
            heap[objectId] = { type, value: 'function', refs: [] };
            return objectId;
        }

        try {
            const result = await sendCommand('Runtime.getProperties', {
                objectId,
                ownProperties: true
            });

            const value = {};
            const refs = [];

            for (const prop of result.result || []) {
                if (!prop.value || !prop.name) continue;
                if (prop.name === '__proto__' || prop.name === 'constructor' || prop.name === 'prototype') continue;
                if (prop.name === 'length' && type.includes('Array')) continue;

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
            // Ignore
        }
        return objectId;
    }

    async function handleMessage(msgStr) {
        process.stderr.write(`[Tracer Debug] Received Msg: ${msgStr.substring(0, 300)}\n`);
        const msg = JSON.parse(msgStr);
        
        // Resolve command responses
        if (msg.id && pendingRequests.has(msg.id)) {
            const { resolve, reject } = pendingRequests.get(msg.id);
            pendingRequests.delete(msg.id);
            if (msg.error) reject(msg.error);
            else resolve(msg.result);
            return;
        }

        if (msg.method === 'Debugger.scriptParsed') {
            scriptUrls[msg.params.scriptId] = msg.params.url;
        }

        // Handle execution context destroyed (script finished)
        if (msg.method === 'Runtime.executionContextDestroyed') {
            process.stderr.write(`[Tracer Debug] Execution context destroyed. Closing...\n`);
            sendEvent('END', -1, {}, {}, []);
            if (wsClient) wsClient.close();
            process.exit(0);
        }

        // Handle Debugger events
        if (msg.method === 'Debugger.paused') {
            const callFrames = msg.params.callFrames;
            if (!callFrames || callFrames.length === 0) {
                sendCommand('Debugger.resume');
                return;
            }

            if (msg.params.reason === 'exception' || msg.params.reason === 'promiseRejection') {
                const excFrame = callFrames[0];
                const excFrameUrl = resolveFrameUrl(excFrame);
                const excIsTarget = excFrameUrl && (excFrameUrl === targetFile || excFrameUrl.includes(path.basename(targetFile)));
                const excLine = excIsTarget ? excFrame.location.lineNumber + 1 : -1;
                const excCallStack = callFrames
                    .filter(f => {
                        const url = resolveFrameUrl(f);
                        return url && (url === targetFile || url.includes(path.basename(targetFile)));
                    })
                    .map(f => f.functionName || '<anonymous>')
                    .reverse();

                const exceptionObj = msg.params.data;
                let message = 'Uncaught exception';
                if (exceptionObj) {
                    if (exceptionObj.description) {
                        message = exceptionObj.description.split('\n')[0];
                    } else if (exceptionObj.className) {
                        message = exceptionObj.className;
                    }
                }

                terminatedEarly = true;
                sendEvent('ERROR', excLine, {}, {}, excCallStack, message);
                if (wsClient) wsClient.close();
                child.kill();
                return;
            }

            const frame = callFrames[0];
            const frameUrl = resolveFrameUrl(frame);
            const isTarget = frameUrl && (frameUrl === targetFile || frameUrl.includes(path.basename(targetFile)));

            if (!isTarget) {
                // We've stepped into library/Node-internal code (e.g. inside
                // console.log). Step back OUT to the caller instead of
                // resuming — resume runs freely to the next breakpoint (there
                // isn't one), which would blow past the rest of the trace.
                sendCommand('Debugger.stepOut');
                return;
            }

            const line = frame.location.lineNumber + 1;

            const callStack = callFrames
                .filter(f => {
                    const url = resolveFrameUrl(f);
                    return url && (url === targetFile || url.includes(path.basename(targetFile)));
                })
                .map(f => f.functionName || '<anonymous>')
                .reverse();

            const localScope = frame.scopeChain.find(s => s.type === 'local' || s.type === 'block');
            const scopeData = {};

            Object.keys(heap).forEach(k => delete heap[k]);
            seenObjects.clear();

            if (localScope && localScope.object.objectId) {
                try {
                    const result = await sendCommand('Runtime.getProperties', {
                        objectId: localScope.object.objectId,
                        ownProperties: true
                    });

                    for (const prop of result.result || []) {
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
                    // Ignore scope properties error
                }
            }

            stepCount++;
            if (stepCount > MAX_STEPS) {
                terminatedEarly = true;
                sendEvent('LIMIT', line, scopeData, heap, callStack);
                if (wsClient) wsClient.close();
                child.kill();
                return;
            }

            sendEvent('STEP', line, scopeData, heap, callStack);
            sendCommand('Debugger.stepInto');
        }
    }

    socket.on('data', (chunk) => {
        if (!handshaken) {
            const str = chunk.toString();
            if (str.includes('HTTP/1.1 101')) {
                handshaken = true;
                process.stderr.write('[Tracer Debug] Upgrade successful via net.connect!\n');
                const idx = str.indexOf('\r\n\r\n');
                chunk = idx !== -1 ? chunk.slice(idx + 4) : Buffer.alloc(0);
                
                // Initialize inspector settings once handshaken
                sendCommand('Debugger.enable').then(() => {
                    return sendCommand('Runtime.enable');
                }).then(() => {
                    // Pause on uncaught exceptions so we can report them as an
                    // ERROR event instead of letting the child crash silently.
                    return sendCommand('Debugger.setPauseOnExceptions', { state: 'uncaught' });
                }).then(() => {
                    // Set breakpoint on target file line 0 to catch start of user code
                    const escapedFilename = path.basename(targetFile).replace(/\./g, '\\.');
                    return sendCommand('Debugger.setBreakpointByUrl', {
                        lineNumber: 0,
                        urlRegex: `.*${escapedFilename}`
                    });
                }).then(() => {
                    return sendCommand('Runtime.runIfWaitingForDebugger');
                }).catch(e => {
                    console.error('Failed to initialize inspector:', e);
                    process.exit(1);
                });
            } else {
                return;
            }
        }

        buffer = Buffer.concat([buffer, chunk]);
        while (buffer.length >= 2) {
            const secondByte = buffer[1];
            const hasMask = (secondByte & 0x80) !== 0;
            let payloadLength = secondByte & 0x7F;
            let headerLength = 2;

            if (payloadLength === 126) {
                if (buffer.length < 4) break;
                payloadLength = buffer.readUInt16BE(2);
                headerLength = 4;
            } else if (payloadLength === 127) {
                if (buffer.length < 10) break;
                payloadLength = Number(buffer.readBigUInt64BE(2));
                headerLength = 10;
            }

            let mask = null;
            if (hasMask) {
                if (buffer.length < headerLength + 4) break;
                mask = buffer.slice(headerLength, headerLength + 4);
                headerLength += 4;
            }

            if (buffer.length < headerLength + payloadLength) break;

            const payload = buffer.slice(headerLength, headerLength + payloadLength);
            buffer = buffer.slice(headerLength + payloadLength);

            if (mask) {
                for (let i = 0; i < payload.length; i++) {
                    payload[i] ^= mask[i % 4];
                }
            }

            handleMessage(payload.toString('utf8')).catch(console.error);
        }
    });

    socket.on('error', (err) => {
        console.error('Socket error during connection:', err);
    });

    wsClient = {
        sendCommand,
        close: () => socket.destroy()
    };
}

child.on('exit', (code) => {
    if (!terminatedEarly) {
        sendEvent('END', -1, {}, {}, []);
    }
    if (wsClient) wsClient.close();
    process.exit(code);
});

child.on('error', (err) => {
    sendEvent('ERROR', -1, {}, {}, [], err.message);
    if (wsClient) wsClient.close();
    process.exit(1);
});
