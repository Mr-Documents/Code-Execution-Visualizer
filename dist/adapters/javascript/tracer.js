/**
 * JavaScript execution tracer.
 *
 * Spawns the target script under `node --inspect-brk`, drives it one line at a
 * time over the V8 Inspector protocol, and emits a newline-delimited JSON
 * event per executed line on stdout.
 *
 * The WebSocket client is hand-rolled (over a raw net.Socket) so the tracer has
 * no runtime dependencies and can be shipped as a single file.
 */
const { spawn } = require('child_process');
const path = require('path');
const net = require('net');
const crypto = require('crypto');
const { pathToFileURL, fileURLToPath } = require('url');

// Verbose protocol logging is opt-in: it easily outdoes the real payload in
// volume, and the extension pipes our stderr into the host's output channel.
const DEBUG = !!process.env.CEV_TRACER_DEBUG;

/** Reads a positive integer from the environment, falling back if unset/invalid. */
function positiveIntFromEnv(name, fallback) {
    const raw = process.env[name];
    if (!raw) return fallback;
    const parsed = Number.parseInt(raw, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Halt runaway programs. Also bounds worst-case trace size.
 *
 * Overridable via `CEV_MAX_STEPS`: each step costs one inspector round trip, so
 * tests exercise the cap with a small value instead of paying for 5000 of them.
 */
const MAX_STEPS = positiveIntFromEnv('CEV_MAX_STEPS', 5000);

/**
 * Cap on total emitted trace bytes.
 *
 * The step cap alone doesn't bound memory: every step re-serializes the heap
 * reachable from scope, so a program holding a large structure across a long
 * run can produce hundreds of MB — all of which the webview retains so the
 * timeline stays scrubbable. This bounds what the UI is ever asked to hold.
 */
const MAX_TRACE_BYTES = positiveIntFromEnv('CEV_MAX_TRACE_BYTES', 32 * 1024 * 1024);
/** Per-step caps on object-graph traversal. Each step re-walks reachable
 *  objects from scratch (V8 re-issues object ids on every pause, so results
 *  can't be cached), which makes an unbounded walk the dominant cost. */
const MAX_HEAP_OBJECTS = 150;
const MAX_DEPTH = 5;
const MAX_PROPS = 100;
/** Enough to find the inspector URL; prevents unbounded growth on a chatty child. */
const MAX_STDERR_BUFFER = 64 * 1024;

if (process.argv.length < 3) {
    process.stderr.write('Usage: node tracer.js <target_file>\n');
    process.exit(1);
}

const targetFile = path.resolve(process.argv[2]);
const targetFileUrl = pathToFileURL(targetFile).href;

const child = spawn('node', ['--inspect-brk=0', targetFile]);

let stdoutBuffer = '';
let stdoutSent = 0;
let stderrBuffer = '';
let wsClient = null;
let stepCount = 0;
let bytesEmitted = 0;
/** Set once a terminal event (ERROR/LIMIT) has been emitted, so the exit and
 *  context-destroyed handlers don't append a contradictory END after it. */
let finished = false;

function debug(message) {
    if (DEBUG) process.stderr.write(`[tracer] ${message}\n`);
}

/** Windows paths are case-insensitive and mix separators; normalize for compare. */
function normalizePath(p) {
    const unified = p.replace(/\\/g, '/');
    return process.platform === 'win32' ? unified.toLowerCase() : unified;
}
const targetPathNorm = normalizePath(targetFile);

/**
 * True if a script URL refers to the file being traced.
 *
 * Matching on basename alone gives false positives for common names — a target
 * `index.js` would match every `index.js` in node_modules — so resolve file
 * URLs to real paths and compare them in full.
 */
function isTargetUrl(url) {
    if (!url) return false;
    if (url === targetFileUrl) return true;
    if (url.startsWith('file://')) {
        try {
            return normalizePath(fileURLToPath(url)) === targetPathNorm;
        } catch {
            return false;
        }
    }
    return normalizePath(url) === targetPathNorm;
}

function escapeRegExp(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

child.stdout.on('data', (data) => {
    stdoutBuffer += data.toString();
});

child.stderr.on('data', (data) => {
    const str = data.toString();
    if (DEBUG) process.stderr.write(`[child] ${str}`);

    if (wsClient) return; // Already connected; no need to keep scanning or buffering.

    if (stderrBuffer.length < MAX_STDERR_BUFFER) stderrBuffer += str;

    const match = stderrBuffer.match(/ws:\/\/127\.0\.0\.1:\d+\/[a-f0-9-]+/);
    if (match) connectDebugWS(match[0]);
});

/**
 * Emits one execution event.
 *
 * `stdoutDelta` carries only what the program printed since the previous event.
 * Sending the full cumulative buffer each time made total output quadratic in
 * step count; consumers rebuild the running console by concatenating deltas.
 */
function sendEvent(type, line, scope, heap, callStack, extra = {}) {
    const delta = stdoutBuffer.slice(stdoutSent);
    stdoutSent = stdoutBuffer.length;

    const event = {
        type,
        line,
        scope,
        heap,
        callStack,
        stdoutDelta: delta,
        ...extra
    };
    const payload = JSON.stringify(event);
    bytesEmitted += payload.length + 1;
    process.stdout.write(payload + '\n');
}

/** Renders a non-object remote value as a display string. */
function safeValue(obj) {
    if (obj.type === 'object' && obj.subtype === 'null') return 'null';
    if (obj.type === 'undefined') return 'undefined';
    if (obj.type === 'object') return obj.className || 'Object';
    if (obj.type === 'function') return 'Function';
    // bigint/symbol and friends arrive without a JSON-serializable `value`.
    if (obj.unserializableValue !== undefined) return String(obj.unserializableValue);
    if (obj.value === undefined) return obj.description !== undefined ? String(obj.description) : '';
    return String(obj.value);
}

/** Composes the display type for a remote object, e.g. `object (array)`. */
function describeType(remoteObject) {
    return remoteObject.type + (remoteObject.subtype ? ` (${remoteObject.subtype})` : '');
}

function connectDebugWS(url) {
    debug(`connecting to ${url}`);
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
    let handshakeBuffer = '';
    let buffer = Buffer.alloc(0);
    /** Reassembly state for fragmented WebSocket messages. */
    let fragments = [];
    let fragmentOpcode = null;
    let closed = false;

    const pendingRequests = new Map();
    let idCounter = 1;

    /** Rejects every in-flight command so awaiting callers can't hang forever. */
    function failPending(reason) {
        for (const { reject } of pendingRequests.values()) reject(new Error(reason));
        pendingRequests.clear();
    }

    function sendCommand(method, params = {}) {
        if (closed || socket.destroyed) {
            return Promise.reject(new Error('inspector socket is closed'));
        }
        return new Promise((resolve, reject) => {
            const id = idCounter++;
            pendingRequests.set(id, { resolve, reject });
            const msg = JSON.stringify({ id, method, params });
            debug(`send ${method}`);

            const payload = Buffer.from(msg, 'utf8');
            const len = payload.length;
            // Client-to-server frames must be masked (RFC 6455 §5.3).
            const mask = crypto.randomBytes(4);
            let header;

            if (len < 126) {
                header = Buffer.alloc(6);
                header[1] = len | 0x80;
                mask.copy(header, 2);
            } else if (len < 65536) {
                header = Buffer.alloc(8);
                header[1] = 126 | 0x80;
                header.writeUInt16BE(len, 2);
                mask.copy(header, 4);
            } else {
                header = Buffer.alloc(14);
                header[1] = 127 | 0x80;
                header.writeBigUInt64BE(BigInt(len), 2);
                mask.copy(header, 10);
            }
            header[0] = 0x81; // FIN + text frame

            const maskedPayload = Buffer.alloc(len);
            for (let i = 0; i < len; i++) {
                maskedPayload[i] = payload[i] ^ mask[i % 4];
            }

            socket.write(Buffer.concat([header, maskedPayload]));
        });
    }

    /** scriptId -> url, from Debugger.scriptParsed. Paused call frames frequently
     *  carry an empty `url`, so the scriptId is the only reliable source. */
    const scriptUrls = new Map();
    function resolveFrameUrl(frame) {
        return frame.url || scriptUrls.get(frame.location.scriptId) || '';
    }

    function isTargetFrame(frame) {
        return isTargetUrl(resolveFrameUrl(frame));
    }

    function targetCallStack(callFrames) {
        return callFrames
            .filter(isTargetFrame)
            .map((f) => f.functionName || '<anonymous>')
            .reverse();
    }

    /**
     * Walks an object graph into `heap`, bounded by depth/breadth/total caps.
     *
     * Without caps a single large collection turns into thousands of sequential
     * round trips *per step*, and a deeply linked structure can overflow the
     * stack. Truncated entries are flagged so the UI can say so.
     */
    async function processObject(objectId, type, ctx, depth = 0) {
        if (ctx.seen.has(objectId)) return;
        ctx.seen.add(objectId);

        // A function's prototype/constructor chain runs off into built-ins, and
        // V8 mints a fresh object id each time it's inspected, so `seen` never
        // catches the cycle. Functions carry no useful state — record shallowly.
        if (type.startsWith('function')) {
            ctx.heap[objectId] = { type, value: 'function', refs: [] };
            return;
        }

        if (depth >= MAX_DEPTH || ctx.count >= MAX_HEAP_OBJECTS) {
            ctx.heap[objectId] = { type, value: '…', refs: [], truncated: true };
            return;
        }
        ctx.count++;

        let result;
        try {
            result = await sendCommand('Runtime.getProperties', { objectId, ownProperties: true });
        } catch {
            ctx.heap[objectId] = { type, value: '<unavailable>', refs: [] };
            return;
        }

        const value = {};
        const refs = [];
        const isArray = type.includes('array');
        const pending = [];
        let truncated = false;
        let propCount = 0;

        for (const prop of result.result || []) {
            if (!prop.value || !prop.name) continue;
            // Skip prototype plumbing — it's noise in a heap view and the source
            // of the runaway recursion described above.
            if (prop.name === '__proto__' || prop.name === 'constructor' || prop.name === 'prototype') continue;
            if (isArray && prop.name === 'length') continue;

            if (propCount >= MAX_PROPS) {
                truncated = true;
                break;
            }
            propCount++;

            if (prop.value.objectId) {
                const refId = prop.value.objectId;
                refs.push(refId);
                value[prop.name] = `[Ref: ${refId}]`;
                // Fetch siblings concurrently: each round trip costs ~1ms of
                // protocol latency, and a wide object would otherwise serialize
                // one per property. Dedup stays correct because `seen`/`count`
                // are updated synchronously on entry, before any await.
                pending.push(processObject(refId, describeType(prop.value), ctx, depth + 1));
            } else {
                value[prop.name] = safeValue(prop.value);
            }
        }

        ctx.heap[objectId] = { type, value, refs, ...(truncated ? { truncated: true } : {}) };
        if (pending.length) await Promise.all(pending);
    }

    /** Names injected by the CommonJS wrapper — not the user's variables. */
    const MODULE_WRAPPER_NAMES = new Set([
        'exports', 'require', 'module', '__filename', '__dirname'
    ]);

    /**
     * Scope kinds worth showing. `global` is excluded deliberately: it holds
     * every Node built-in and would bury the user's own variables.
     */
    const VISIBLE_SCOPE_TYPES = new Set(['local', 'block', 'closure', 'catch', 'script']);

    /**
     * Captures everything visible from the paused call stack, plus the
     * reachable heap.
     *
     * Two things are merged, both innermost-first so inner declarations
     * correctly shadow outer ones:
     *
     * 1. The current frame's own scope chain — a loop body's innermost scope
     *    holds only the loop variable, so reading just that hid the enclosing
     *    function's accumulators.
     *
     * 2. Every *other* target frame still on the stack. V8 only reports a
     *    closure scope for variables a function actually references — a
     *    function that never touches its caller's locals gets no closure
     *    entry for them at all, even though they're still alive on the stack
     *    above it. Reading each live frame's own locals directly is what
     *    keeps a caller's variables visible while stepping through a call
     *    that doesn't reference them, instead of the graph going blank for
     *    the duration of the call.
     *
     * Frames that have already returned are correctly excluded: nothing still
     * on the stack references them, matching real reachability.
     */
    async function captureState(callFrames) {
        const ctx = { heap: {}, seen: new Set(), count: 0 };
        const scope = {};
        const pending = [];

        for (const frame of callFrames) {
            if (!isTargetFrame(frame)) continue;

            for (const scopeEntry of frame.scopeChain) {
                if (!VISIBLE_SCOPE_TYPES.has(scopeEntry.type)) continue;
                const objectId = scopeEntry.object && scopeEntry.object.objectId;
                if (!objectId) continue;

                let result;
                try {
                    result = await sendCommand('Runtime.getProperties', { objectId, ownProperties: true });
                } catch {
                    continue;
                }

                for (const prop of result.result || []) {
                    if (!prop.name || !prop.value) continue;
                    if (MODULE_WRAPPER_NAMES.has(prop.name)) continue;
                    // Innermost binding wins; don't let an outer frame overwrite it.
                    if (Object.prototype.hasOwnProperty.call(scope, prop.name)) continue;

                    const type = describeType(prop.value);
                    if (prop.value.objectId) {
                        scope[prop.name] = { type, value: prop.value.type, ref: prop.value.objectId };
                        pending.push(processObject(prop.value.objectId, type, ctx));
                    } else {
                        scope[prop.name] = { type, value: safeValue(prop.value) };
                    }
                }
            }
        }

        await Promise.all(pending);
        return { scope, heap: ctx.heap };
    }

    /** Emits a terminal event and tears down the run. */
    function terminate(type, line, scope, heap, callStack, extra) {
        if (finished) return;
        finished = true;
        sendEvent(type, line, scope, heap, callStack, extra);
        close();
        child.kill();
    }

    async function handlePaused(params) {
        const callFrames = params.callFrames;
        if (!callFrames || callFrames.length === 0) {
            sendCommand('Debugger.resume').catch(() => {});
            return;
        }

        if (params.reason === 'exception' || params.reason === 'promiseRejection') {
            const frame = callFrames[0];
            const line = isTargetFrame(frame) ? frame.location.lineNumber + 1 : -1;
            const data = params.data || {};
            const message = data.description
                ? String(data.description).split('\n')[0]
                : data.className || 'Uncaught exception';
            terminate('ERROR', line, {}, {}, targetCallStack(callFrames), { error: message });
            return;
        }

        const frame = callFrames[0];
        if (!isTargetFrame(frame)) {
            // We're inside library or Node-internal code (e.g. within console.log).
            // Step back out to the caller — `resume` would run to the next
            // breakpoint, of which there are none, skipping the rest of the trace.
            sendCommand('Debugger.stepOut').catch(() => {});
            return;
        }

        const line = frame.location.lineNumber + 1;
        const callStack = targetCallStack(callFrames);
        const { scope, heap } = await captureState(callFrames);

        if (++stepCount > MAX_STEPS) {
            terminate('LIMIT', line, scope, heap, callStack, {
                limitReason: 'steps',
                stepLimit: MAX_STEPS
            });
            return;
        }

        sendEvent('STEP', line, scope, heap, callStack);

        // Checked after emitting so the step that crossed the line is still
        // shown, and the LIMIT event explains why the trace stops there.
        if (bytesEmitted > MAX_TRACE_BYTES) {
            terminate('LIMIT', line, {}, {}, callStack, {
                limitReason: 'size',
                traceBytes: bytesEmitted,
                traceByteLimit: MAX_TRACE_BYTES
            });
            return;
        }

        sendCommand('Debugger.stepInto').catch(() => {});
    }

    async function handleMessage(msgStr) {
        let msg;
        try {
            msg = JSON.parse(msgStr);
        } catch {
            debug(`ignoring non-JSON frame (${msgStr.length} bytes)`);
            return;
        }

        if (msg.id !== undefined && pendingRequests.has(msg.id)) {
            const { resolve, reject } = pendingRequests.get(msg.id);
            pendingRequests.delete(msg.id);
            if (msg.error) reject(new Error(msg.error.message || 'inspector command failed'));
            else resolve(msg.result);
            return;
        }

        switch (msg.method) {
            case 'Debugger.scriptParsed':
                scriptUrls.set(msg.params.scriptId, msg.params.url);
                return;
            case 'Runtime.executionContextDestroyed':
                if (!finished) {
                    finished = true;
                    sendEvent('END', -1, {}, {}, []);
                }
                close();
                process.exit(0);
                return;
            case 'Debugger.paused':
                await handlePaused(msg.params);
                return;
            default:
                return;
        }
    }

    function close() {
        if (closed) return;
        closed = true;
        failPending('inspector socket closed');
        socket.destroy();
    }

    socket.on('data', (chunk) => {
        if (!handshaken) {
            handshakeBuffer += chunk.toString('latin1');
            const headerEnd = handshakeBuffer.indexOf('\r\n\r\n');
            if (headerEnd === -1) return; // Response split across chunks; wait for more.

            if (!handshakeBuffer.startsWith('HTTP/1.1 101')) {
                process.stderr.write('[tracer] inspector refused the WebSocket upgrade\n');
                close();
                return;
            }

            handshaken = true;
            debug('websocket upgrade complete');
            // Anything after the header terminator is already frame data.
            chunk = Buffer.from(handshakeBuffer.slice(headerEnd + 4), 'latin1');
            handshakeBuffer = '';

            sendCommand('Debugger.enable')
                .then(() => sendCommand('Runtime.enable'))
                // Pause on uncaught exceptions so they surface as ERROR events
                // rather than the child dying silently.
                .then(() => sendCommand('Debugger.setPauseOnExceptions', { state: 'uncaught' }))
                .then(() => sendCommand('Debugger.setBreakpointByUrl', {
                    lineNumber: 0,
                    urlRegex: `.*${escapeRegExp(path.basename(targetFile))}$`
                }))
                .then(() => sendCommand('Runtime.runIfWaitingForDebugger'))
                .catch((e) => {
                    process.stderr.write(`[tracer] failed to initialize inspector: ${e.message}\n`);
                    process.exit(1);
                });
        }

        buffer = Buffer.concat([buffer, chunk]);

        while (buffer.length >= 2) {
            const firstByte = buffer[0];
            const secondByte = buffer[1];
            const isFinal = (firstByte & 0x80) !== 0;
            const opcode = firstByte & 0x0f;
            const hasMask = (secondByte & 0x80) !== 0;
            let payloadLength = secondByte & 0x7f;
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
                mask = buffer.subarray(headerLength, headerLength + 4);
                headerLength += 4;
            }

            if (buffer.length < headerLength + payloadLength) break;

            const payload = Buffer.from(buffer.subarray(headerLength, headerLength + payloadLength));
            buffer = buffer.subarray(headerLength + payloadLength);

            if (mask) {
                for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
            }

            if (opcode === 0x8) { // close
                close();
                return;
            }
            if (opcode === 0x9) { // ping — reply so the peer doesn't drop us
                const pong = Buffer.concat([Buffer.from([0x8a, 0x80]), crypto.randomBytes(4)]);
                if (!socket.destroyed) socket.write(pong);
                continue;
            }
            if (opcode === 0xa) continue; // pong

            if (opcode === 0x0) {
                fragments.push(payload);
            } else if (opcode === 0x1) {
                fragments = [payload];
                fragmentOpcode = opcode;
            } else {
                continue; // binary or reserved — the inspector protocol is text-only
            }

            if (!isFinal) continue;
            if (fragmentOpcode !== 0x1) { fragments = []; continue; }

            const message = Buffer.concat(fragments).toString('utf8');
            fragments = [];
            fragmentOpcode = null;
            handleMessage(message).catch((e) => debug(`message handler error: ${e.message}`));
        }
    });

    socket.on('error', (err) => {
        debug(`socket error: ${err.message}`);
        failPending(`inspector socket error: ${err.message}`);
    });

    socket.on('close', () => {
        failPending('inspector socket closed');
    });

    wsClient = { sendCommand, close };
}

child.on('exit', (code) => {
    if (!finished) {
        finished = true;
        sendEvent('END', -1, {}, {}, []);
    }
    if (wsClient) wsClient.close();
    process.exit(code === null ? 0 : code);
});

child.on('error', (err) => {
    if (!finished) {
        finished = true;
        sendEvent('ERROR', -1, {}, {}, [], { error: `Failed to run node: ${err.message}` });
    }
    if (wsClient) wsClient.close();
    process.exit(1);
});
