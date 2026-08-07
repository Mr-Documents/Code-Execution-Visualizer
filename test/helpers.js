const { spawn, spawnSync } = require('child_process');

/**
 * Spawns a tracer script (JS or Python) against a target file, collects every
 * newline-delimited JSON event it prints to stdout, and resolves once the
 * process exits. Rejects if it doesn't exit within `timeoutMs`.
 */
function runTracer(command, args, { timeoutMs = 20000 } = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args);
        let stdout = '';
        let stderr = '';

        const timer = setTimeout(() => {
            child.kill();
            reject(new Error(`Tracer did not exit within ${timeoutMs}ms.\nstderr:\n${stderr}`));
        }, timeoutMs);

        child.stdout.on('data', (d) => { stdout += d.toString(); });
        child.stderr.on('data', (d) => { stderr += d.toString(); });

        child.on('close', (exitCode) => {
            clearTimeout(timer);
            const events = stdout
                .split('\n')
                .map((line) => line.trim())
                .filter(Boolean)
                .map((line) => JSON.parse(line));
            resolve({ events, exitCode, stderr });
        });

        child.on('error', (err) => {
            clearTimeout(timer);
            reject(err);
        });
    });
}

let cachedPythonBin;
/** Resolves whichever of 'python3'/'python' is actually usable on this machine. */
function resolvePythonBin() {
    if (cachedPythonBin) return cachedPythonBin;
    for (const candidate of ['python3', 'python']) {
        const result = spawnSync(candidate, ['--version']);
        if (!result.error && result.status === 0) {
            cachedPythonBin = candidate;
            return candidate;
        }
    }
    throw new Error("Neither 'python3' nor 'python' is available on PATH.");
}

/** Rebuilds the program's console output from per-event stdout deltas. */
function consoleOutput(events) {
    return events.map((event) => event.stdoutDelta || '').join('');
}

module.exports = { runTracer, resolvePythonBin, consoleOutput };
