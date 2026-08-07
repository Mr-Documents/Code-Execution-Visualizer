const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { runTracer, resolvePythonBin } = require('./helpers');

const TRACER = path.join(__dirname, '..', 'src', 'adapters', 'python', 'tracer.py');

// Python support is experimental (not yet hardened the way the JS tracer is
// — see README) so this is a smoke test, not a full regression suite: it
// just confirms the tracer runs a normal script end-to-end without crashing.
test('normal script: produces step events and ends cleanly', async () => {
    const pythonBin = resolvePythonBin();
    const target = path.join(__dirname, '..', 'test.py');
    const { events, exitCode } = await runTracer(pythonBin, [TRACER, target]);

    assert.equal(exitCode, 0);
    assert.ok(events.some((e) => e.type === 'STEP'), 'expected at least one STEP event');

    const last = events[events.length - 1];
    assert.equal(last.type, 'END');
    assert.match(last.stdout, /Finished!/);
});
