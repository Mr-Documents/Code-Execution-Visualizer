"""
Python execution tracer.

Runs the target script under `sys.settrace` and emits a newline-delimited JSON
event per executed line on stdout. The target's own prints are intercepted so
they don't corrupt the event stream.
"""
import sys
import json
import io
import os

# Halt runaway programs. Also bounds worst-case trace size.
MAX_STEPS = 5000
# Per-step caps on object-graph traversal. Each step re-walks reachable objects,
# so an unbounded walk over a large or deeply nested structure dominates cost
# (and can exceed the recursion limit).
MAX_HEAP_OBJECTS = 150
MAX_DEPTH = 5
MAX_ITEMS = 100

# Keep the real stdout so JSON events bypass the interceptor below.
original_stdout = sys.stdout


class StepLimitReached(BaseException):
    """Raised inside the traced frame to stop a runaway program.

    Derives from BaseException so ordinary ``except Exception`` handlers in user
    code don't swallow it.
    """


class InterceptedStdout:
    """Captures the target's stdout so it can be attached to events."""

    def __init__(self):
        self.buffer = io.StringIO()

    def write(self, data):
        self.buffer.write(data)
        return len(data)

    def flush(self):
        pass

    def getvalue(self):
        return self.buffer.getvalue()


stdout_interceptor = InterceptedStdout()
sys.stdout = stdout_interceptor

# Number of characters already reported. Events carry only the delta since the
# previous event; sending the whole buffer each time made total output quadratic
# in step count. Consumers rebuild the console by concatenating deltas.
_stdout_sent = 0


def take_stdout_delta():
    global _stdout_sent
    full = stdout_interceptor.getvalue()
    delta = full[_stdout_sent:]
    _stdout_sent = len(full)
    return delta


def emit(event_type, line, scope, heap, call_stack, error=None):
    event = {
        'type': event_type,
        'line': line,
        'scope': scope,
        'heap': heap,
        'callStack': call_stack,
        'stdoutDelta': take_stdout_delta(),
    }
    if error is not None:
        event['error'] = error
    original_stdout.write(json.dumps(event) + '\n')
    original_stdout.flush()


def get_call_stack(frame, target_path):
    stack = []
    curr = frame
    while curr:
        if os.path.abspath(curr.f_code.co_filename) == target_path:
            stack.append(curr.f_code.co_name)
        curr = curr.f_back
    return stack[::-1]


def build_heap_and_scope(locals_dict):
    """Serializes a frame's locals into a flat scope map plus a heap of objects."""
    scope = {}
    heap = {}
    seen_objects = set()
    counter = {'count': 0}

    def process_value(val, depth=0):
        if val is None or isinstance(val, (int, float, str, bool)):
            return {'type': type(val).__name__, 'value': repr(val)}

        type_name = type(val).__name__
        obj_id = 'ref-{}'.format(id(val))
        ref_result = {'type': type_name, 'value': type_name, 'ref': obj_id}

        # Already recorded (or being recorded further up the stack) — emitting
        # the reference alone is what keeps cycles from recursing forever.
        if obj_id in seen_objects:
            return ref_result
        seen_objects.add(obj_id)

        if depth >= MAX_DEPTH or counter['count'] >= MAX_HEAP_OBJECTS:
            heap[obj_id] = {'type': type_name, 'value': '…', 'refs': [], 'truncated': True}
            return ref_result
        counter['count'] += 1

        refs = []
        truncated = False

        def child(item):
            processed = process_value(item, depth + 1)
            if 'ref' in processed:
                refs.append(processed['ref'])
                return '[Ref: {}]'.format(processed['ref'])
            return processed['value']

        if isinstance(val, (list, tuple)):
            serialized = []
            for item in val[:MAX_ITEMS]:
                serialized.append(child(item))
            truncated = len(val) > MAX_ITEMS
        elif isinstance(val, dict):
            serialized = {}
            for i, (k, item) in enumerate(val.items()):
                if i >= MAX_ITEMS:
                    truncated = True
                    break
                serialized[str(k)] = child(item)
        else:
            try:
                attrs = vars(val)
            except TypeError:
                # No __dict__ (builtins, slots, C types) — fall back to repr.
                heap[obj_id] = {'type': type_name, 'value': repr(val)[:500], 'refs': []}
                return ref_result

            serialized = {}
            for i, (k, item) in enumerate(attrs.items()):
                if k.startswith('__'):
                    continue
                if i >= MAX_ITEMS:
                    truncated = True
                    break
                serialized[k] = child(item)

        entry = {'type': type_name, 'value': serialized, 'refs': refs}
        if truncated:
            entry['truncated'] = True
        heap[obj_id] = entry
        return ref_result

    for name, value in locals_dict.items():
        if name.startswith('__'):
            continue
        scope[name] = process_value(value)

    return scope, heap


def main():
    if len(sys.argv) < 2:
        sys.stderr.write('Usage: python tracer.py <target_file>\n')
        return 1

    target_file = os.path.abspath(sys.argv[1])
    with open(target_file, 'r', encoding='utf-8') as handle:
        source = handle.read()

    step_count = {'count': 0}

    def trace_calls(frame, event, arg):
        if event != 'line':
            return trace_calls
        if os.path.abspath(frame.f_code.co_filename) != target_file:
            return trace_calls

        scope, heap = build_heap_and_scope(frame.f_locals)
        call_stack = get_call_stack(frame, target_file)

        step_count['count'] += 1
        if step_count['count'] > MAX_STEPS:
            emit('LIMIT', frame.f_lineno, scope, heap, call_stack)
            raise StepLimitReached()

        emit('STEP', frame.f_lineno, scope, heap, call_stack)
        return trace_calls

    target_globals = {'__name__': '__main__', '__file__': target_file}
    terminated = False

    sys.settrace(trace_calls)
    try:
        # Compile with the real filename so tracebacks and frame filenames match.
        exec(compile(source, target_file, 'exec'), target_globals)
    except StepLimitReached:
        terminated = True  # LIMIT was already emitted from the trace function.
    except BaseException as exc:
        sys.settrace(None)
        terminated = True

        # Walk to the deepest traceback frame that belongs to the target file so
        # the reported line points at user code, not interpreter internals.
        tb = sys.exc_info()[2]
        line_num = -1
        while tb:
            if os.path.abspath(tb.tb_frame.f_code.co_filename) == target_file:
                line_num = tb.tb_lineno
            tb = tb.tb_next

        emit('ERROR', line_num, {}, {}, [], '{}: {}'.format(type(exc).__name__, exc))
    finally:
        sys.settrace(None)
        sys.stdout = original_stdout

    if not terminated:
        emit('END', -1, {}, {}, [])
    return 0


if __name__ == '__main__':
    sys.exit(main())
