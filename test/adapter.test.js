const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { ProcessTracerAdapter } = require('../src/adapters/ProcessTracerAdapter.ts');

/** Test double that runs whatever command the test needs. */
class StubAdapter extends ProcessTracerAdapter {
    constructor(command, args) {
        super();
        this.command = command;
        this.args = args;
    }
    get runtimeName() { return 'Stub Runtime'; }
    buildCommand() { return { command: this.command, args: this.args }; }
}

/** Runs an adapter to completion, collecting everything it emits. */
function run(adapter, filePath = 'ignored') {
    return new Promise((resolve) => {
        const events = [];
        const failures = [];
        adapter.on('event', (e) => events.push(e));
        adapter.on('failure', (message) => failures.push(message));
        adapter.on('close', () => setImmediate(() => resolve({ events, failures })));
        adapter.start(filePath);
    });
}

/** Emits the given stdout text from a child process, in one or more writes. */
function emitScript(chunks) {
    const writes = chunks
        .map((c) => `process.stdout.write(${JSON.stringify(c)});`)
        .join('');
    return ['-e', writes];
}

test('reports a readable failure when the runtime is missing', async () => {
    const adapter = new StubAdapter('definitely-not-a-real-binary-xyz', []);

    const failure = await new Promise((resolve) => {
        adapter.on('failure', resolve);
        adapter.start('ignored');
    });

    // Without an 'error' listener Node would rethrow and take down the host.
    assert.match(failure, /Could not find/);
    assert.match(failure, /definitely-not-a-real-binary-xyz/);
    assert.match(failure, /Stub Runtime/);
});

test('parses newline-delimited events split across chunk boundaries', async () => {
    // The JSON is deliberately cut mid-object to exercise buffering.
    const adapter = new StubAdapter('node', emitScript([
        '{"type":"STEP","li',
        'ne":1}\n{"type":"END","line":-1}\n'
    ]));

    const { events, failures } = await run(adapter);

    assert.deepEqual(failures, []);
    assert.deepEqual(events, [
        { type: 'STEP', line: 1 },
        { type: 'END', line: -1 }
    ]);
});

test('skips malformed lines without discarding valid ones', async () => {
    const adapter = new StubAdapter('node', emitScript([
        'not json\n{"type":"STEP","line":7}\n'
    ]));

    const { events, failures } = await run(adapter);

    assert.deepEqual(failures, []);
    assert.deepEqual(events, [{ type: 'STEP', line: 7 }]);
});

test('surfaces stderr when the tracer exits without producing events', async () => {
    const adapter = new StubAdapter('node', [
        '-e', 'process.stderr.write("ImportError: boom\\n"); process.exit(3);'
    ]);

    const { events, failures } = await run(adapter);

    assert.deepEqual(events, []);
    assert.equal(failures.length, 1);
    assert.match(failures[0], /exited with code 3/);
    assert.match(failures[0], /ImportError: boom/);
});

test('a non-zero exit after successful events is not reported as a failure', async () => {
    // The step cap kills the child, so a non-zero code is expected there.
    const adapter = new StubAdapter('node', [
        '-e', 'process.stdout.write(\'{"type":"STEP","line":1}\\n\'); process.exit(1);'
    ]);

    const { events, failures } = await run(adapter);

    assert.equal(events.length, 1);
    assert.deepEqual(failures, []);
});

test('stop() suppresses the failure report for a deliberate kill', async () => {
    const adapter = new StubAdapter('node', ['-e', 'setTimeout(() => {}, 10000);']);

    const failures = [];
    adapter.on('failure', (m) => failures.push(m));
    adapter.start(path.join(__dirname, 'unused.js'));
    adapter.stop();

    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.deepEqual(failures, []);
});
