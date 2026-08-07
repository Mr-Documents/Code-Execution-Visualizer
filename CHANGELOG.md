# Changelog

## 0.1.0

Initial release.

- Step-by-step execution visualization for JavaScript, with live variable inspection, call stack, console output, and a heap/reference graph.
- Timeline scrubber, play/pause auto-playback, adjustable speed, and step counter.
- Runtime exception display with failing-line highlighting.
- Infinite-loop protection (execution halts after 5000 steps).
- Experimental Python support (`sys.settrace`-based); not yet covered by the same hardening as the JavaScript path.
