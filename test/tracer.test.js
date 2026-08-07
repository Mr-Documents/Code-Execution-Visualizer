const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { runTracer } = require('./helpers');

const TRACER = path.join(__dirname, '..', 'src', 'adapters', 'javascript', 'tracer.js');

function trace(fixture, opts) {
    return runTracer('node', [TRACER, fixture], opts);
}

test('normal script: steps through, enters function calls, ends cleanly', async () => {
    const target = path.join(__dirname, '..', 'test.js');
    const { events, exitCode } = await trace(target);

    assert.equal(exitCode, 0);
    assert.ok(events.length > 0, 'expected at least one event');

    const last = events[events.length - 1];
    assert.equal(last.type, 'END');
    assert.match(last.stdout, /Finished!/);

    // Regression guard: the tracer used to `stepOver` exclusively and never
    // actually entered a called function, so callStack never grew past the
    // top level. Confirm we do see a nested frame.
    assert.ok(
        events.some((e) => Array.isArray(e.callStack) && e.callStack.length > 1),
        'expected at least one STEP event with a nested call stack'
    );

    assert.ok(!events.some((e) => e.type === 'ERROR' || e.type === 'LIMIT'));
});

test('throwing script: reports an ERROR event with the right line and message', async () => {
    const target = path.join(__dirname, 'fixtures', 'throw.js');
    const { events, exitCode } = await trace(target);

    assert.equal(exitCode, 0);
    const errorEvent = events.find((e) => e.type === 'ERROR');
    assert.ok(errorEvent, 'expected an ERROR event');
    assert.equal(errorEvent.line, 3);
    assert.match(errorEvent.error, /Division by zero/);

    // The ERROR event should be terminal — no trailing END after it.
    assert.equal(events[events.length - 1].type, 'ERROR');
});

test('infinite loop: step cap kicks in and halts execution', { timeout: 25000 }, async () => {
    const target = path.join(__dirname, 'fixtures', 'infinite-loop.js');
    const { events, exitCode } = await trace(target, { timeoutMs: 20000 });

    assert.equal(exitCode, 0);
    assert.ok(events.length <= 5001, `expected <= 5001 events, got ${events.length}`);

    const last = events[events.length - 1];
    assert.equal(last.type, 'LIMIT');
});

test('empty file: ends cleanly with no errors', async () => {
    const target = path.join(__dirname, 'fixtures', 'empty.js');
    const { events, exitCode } = await trace(target);

    assert.equal(exitCode, 0);
    assert.ok(events.length > 0);
    assert.equal(events[events.length - 1].type, 'END');
    assert.ok(!events.some((e) => e.type === 'ERROR' || e.type === 'LIMIT'));
});
