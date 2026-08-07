const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { runTracer, consoleOutput } = require('./helpers');

const TRACER = path.join(__dirname, '..', 'src', 'adapters', 'javascript', 'tracer.js');
const fixture = (name) => path.join(__dirname, 'fixtures', name);

function trace(target, opts) {
    return runTracer('node', [TRACER, target], opts);
}

test('normal script: steps through, enters calls, and ends cleanly', async () => {
    const { events, exitCode } = await trace(path.join(__dirname, '..', 'test.js'));

    assert.equal(exitCode, 0);
    assert.ok(events.length > 0, 'expected at least one event');
    assert.equal(events[events.length - 1].type, 'END');
    assert.ok(!events.some((e) => e.type === 'ERROR' || e.type === 'LIMIT'));

    // Regression: the tracer once used stepOver exclusively and never entered a
    // called function, so the call stack never grew past the top level.
    assert.ok(
        events.some((e) => (e.callStack || []).length > 1),
        'expected a nested call stack'
    );
});

test('console output is emitted as deltas that reassemble in order', async () => {
    const { events } = await trace(path.join(__dirname, '..', 'test.js'));

    // Deltas keep payload linear in step count; the UI concatenates them.
    assert.ok(
        events.every((e) => typeof e.stdoutDelta === 'string'),
        'every event should carry a stdoutDelta'
    );
    assert.equal(
        consoleOutput(events),
        'Starting JS script...\nInside greet function\nHello, Alice!\nFinished!\n'
    );
});

test('local variables and referenced objects are captured', async () => {
    const { events } = await trace(path.join(__dirname, '..', 'test.js'));

    const withArray = events.find((e) => e.scope && e.scope.friends);
    assert.ok(withArray, 'expected the `friends` array to appear in scope');
    assert.ok(withArray.scope.friends.ref, 'array should reference a heap object');

    const heapObject = withArray.heap[withArray.scope.friends.ref];
    assert.ok(heapObject, 'referenced object should exist in the heap');
    assert.deepEqual(Object.values(heapObject.value), ['Bob', 'Charlie']);
});

test('every heap reference resolves to a heap entry', async () => {
    // Dangling references crash the graph view, so the tracer must never emit one.
    const { events } = await trace(fixture('objects.js'));

    for (const event of events) {
        const heap = event.heap || {};
        for (const [id, object] of Object.entries(heap)) {
            for (const ref of object.refs || []) {
                assert.ok(heap[ref], `heap object ${id} references missing ${ref}`);
            }
        }
        for (const [name, variable] of Object.entries(event.scope || {})) {
            if (variable.ref) {
                assert.ok(heap[variable.ref], `variable ${name} references missing ${variable.ref}`);
            }
        }
    }
});

test('large object graphs are truncated rather than walked without bound', async () => {
    const { events } = await trace(fixture('wide-object.js'), { timeoutMs: 60000 });

    const largest = Math.max(...events.map((e) => Object.keys(e.heap || {}).length));
    assert.ok(largest > 0, 'expected heap objects to be captured');
    // Caps are 150 expanded objects; truncated stubs allow modest overshoot.
    assert.ok(largest < 400, `heap grew to ${largest} objects, expected traversal caps to apply`);
});

test('throwing script: reports ERROR with the failing line and message', async () => {
    const { events, exitCode } = await trace(fixture('throw.js'));

    assert.equal(exitCode, 0);
    const error = events.find((e) => e.type === 'ERROR');
    assert.ok(error, 'expected an ERROR event');
    assert.equal(error.line, 3);
    assert.match(error.error, /Division by zero/);
    assert.deepEqual(error.callStack, ['<anonymous>', 'divide']);

    // ERROR is terminal — nothing may follow it.
    assert.equal(events[events.length - 1].type, 'ERROR');
});

test('infinite loop: halts at the step cap', { timeout: 40000 }, async () => {
    const { events, exitCode } = await trace(fixture('infinite-loop.js'), { timeoutMs: 35000 });

    assert.equal(exitCode, 0);
    assert.ok(events.length <= 5001, `expected <= 5001 events, got ${events.length}`);
    assert.equal(events[events.length - 1].type, 'LIMIT');
});

test('empty file: ends cleanly with no errors', async () => {
    const { events, exitCode } = await trace(fixture('empty.js'));

    assert.equal(exitCode, 0);
    assert.equal(events[events.length - 1].type, 'END');
    assert.ok(!events.some((e) => e.type === 'ERROR' || e.type === 'LIMIT'));
});

test('does not trace same-named files from other directories', async () => {
    // Regression: frames were matched on basename, so a require of a module
    // with the same filename got traced as if it were the user's code.
    const { events, exitCode } = await trace(fixture('shadowed/main.js'));

    assert.equal(exitCode, 0);
    const traced = new Set(events.flatMap((e) => e.callStack || []));
    assert.ok(!traced.has('shouldNotBeTraced'), 'stepped into a same-named dependency');
    assert.match(consoleOutput(events), /done/);
});

test('quiet by default: no debug output unless CEV_TRACER_DEBUG is set', async () => {
    const { stderr } = await trace(path.join(__dirname, '..', 'test.js'));
    assert.equal(stderr.trim(), '', `expected no stderr chatter, got:\n${stderr}`);
});
