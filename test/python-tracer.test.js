const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { runTracer, resolvePythonBin, consoleOutput } = require('./helpers');

const TRACER = path.join(__dirname, '..', 'src', 'adapters', 'python', 'tracer.py');
const fixture = (name) => path.join(__dirname, 'fixtures', name);

function trace(target, opts) {
    return runTracer(resolvePythonBin(), [TRACER, target], opts);
}

// Python support is experimental (see README), so this covers the contract the
// UI depends on rather than the full behaviour matrix the JS tracer gets.

test('normal script: produces steps, nested frames, and ends cleanly', async () => {
    const { events, exitCode } = await trace(path.join(__dirname, '..', 'test.py'));

    assert.equal(exitCode, 0);
    assert.ok(events.some((e) => e.type === 'STEP'), 'expected STEP events');
    assert.equal(events[events.length - 1].type, 'END');
    assert.ok(
        events.some((e) => (e.callStack || []).length > 1),
        'expected a nested call stack'
    );
});

test('console output uses the same delta contract as the JS tracer', async () => {
    const { events } = await trace(path.join(__dirname, '..', 'test.py'));

    assert.ok(events.every((e) => typeof e.stdoutDelta === 'string'));
    assert.equal(
        consoleOutput(events),
        'Starting script...\nInside greet function\nHello, Alice!\nFinished!\n'
    );
});

test('raising script: reports ERROR with the failing line', async () => {
    const { events, exitCode } = await trace(fixture('throw.py'));

    assert.equal(exitCode, 0);
    const error = events.find((e) => e.type === 'ERROR');
    assert.ok(error, 'expected an ERROR event');
    assert.equal(error.line, 3);
    assert.match(error.error, /Division by zero/);
    assert.equal(events[events.length - 1].type, 'ERROR');
});

test('infinite loop: halts at the step cap', async () => {
    const STEP_LIMIT = 50;
    const { events, exitCode } = await trace(fixture('infinite-loop.py'), {
        env: { CEV_MAX_STEPS: String(STEP_LIMIT) }
    });

    assert.equal(exitCode, 0);
    assert.equal(events.length, STEP_LIMIT + 1);

    const limit = events[events.length - 1];
    assert.equal(limit.type, 'LIMIT');
    assert.equal(limit.limitReason, 'steps');
    assert.equal(limit.stepLimit, STEP_LIMIT, 'LIMIT should report the cap it hit');
});

test('trace size is bounded independently of the step cap', async () => {
    const BYTE_LIMIT = 100 * 1024;
    const { events, exitCode } = await trace(fixture('infinite-loop.py'), {
        env: { CEV_MAX_TRACE_BYTES: String(BYTE_LIMIT), CEV_MAX_STEPS: '100000' }
    });

    assert.equal(exitCode, 0);
    const limit = events[events.length - 1];
    assert.equal(limit.type, 'LIMIT');
    assert.equal(limit.limitReason, 'size');
    assert.equal(limit.traceByteLimit, BYTE_LIMIT);
});

test('every heap reference resolves to a heap entry', async () => {
    const { events } = await trace(fixture('objects.py'));

    for (const event of events) {
        const heap = event.heap || {};
        for (const [id, object] of Object.entries(heap)) {
            for (const ref of object.refs || []) {
                assert.ok(heap[ref], `heap object ${id} references missing ${ref}`);
            }
        }
    }
});
