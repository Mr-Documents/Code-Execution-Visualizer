import sys
import json
import traceback
import io
import os

# Save original stdout so we can print JSON events to it
original_stdout = sys.stdout

class InterceptedStdout:
    def __init__(self):
        self.buffer = io.StringIO()
    def write(self, data):
        self.buffer.write(data)
    def flush(self):
        pass
    def getvalue(self):
        return self.buffer.getvalue()

stdout_interceptor = InterceptedStdout()
sys.stdout = stdout_interceptor

def get_call_stack(frame, target_path):
    stack = []
    curr = frame
    while curr:
        curr_file = os.path.abspath(curr.f_code.co_filename)
        if curr_file == target_path:
            stack.append(curr.f_code.co_name)
        curr = curr.f_back
    return stack[::-1]

def build_heap_and_scope(locals_dict):
    scope = {}
    heap = {}
    seen_objects = {}

    def process_value(val):
        if val is None or isinstance(val, (int, float, str, bool)):
            return {'type': type(val).__name__, 'value': repr(val)}
        
        obj_id = f"ref-{id(val)}"
        if obj_id in seen_objects:
            return {'type': type(val).__name__, 'value': type(val).__name__, 'ref': obj_id}
        
        seen_objects[obj_id] = True
        refs = []
        
        if isinstance(val, list):
            serialized_val = []
            for item in val:
                processed = process_value(item)
                if 'ref' in processed:
                    refs.append(processed['ref'])
                    serialized_val.append(f"[Ref: {processed['ref']}]")
                else:
                    serialized_val.append(processed['value'])
        elif isinstance(val, dict):
            serialized_val = {}
            for k, item in val.items():
                processed = process_value(item)
                if 'ref' in processed:
                    refs.append(processed['ref'])
                    serialized_val[k] = f"[Ref: {processed['ref']}]"
                else:
                    serialized_val[k] = processed['value']
        else:
            serialized_val = {}
            try:
                for k, item in vars(val).items():
                    if not k.startswith('__'):
                        processed = process_value(item)
                        if 'ref' in processed:
                            refs.append(processed['ref'])
                            serialized_val[k] = f"[Ref: {processed['ref']}]"
                        else:
                            serialized_val[k] = processed['value']
            except TypeError:
                serialized_val = repr(val)

        heap[obj_id] = {
            'type': type(val).__name__,
            'value': serialized_val,
            'refs': refs
        }
        
        return {'type': type(val).__name__, 'value': type(val).__name__, 'ref': obj_id}

    for k, v in locals_dict.items():
        if k.startswith('__') or k == 'stdout_interceptor' or k == 'original_stdout':
            continue
        scope[k] = process_value(v)
        
    return scope, heap

if __name__ == '__main__':
    if len(sys.argv) < 2:
        original_stdout.write("Usage: python tracer.py <target_file>\n")
        sys.exit(1)
        
    target_file = os.path.abspath(sys.argv[1])
    
    with open(target_file, 'r') as f:
        code = f.read()

    # Create target globals to run with
    target_globals = {'__name__': '__main__'}

    def trace_calls(frame, event, arg):
        if event != 'line':
            return trace_calls
        
        frame_file = os.path.abspath(frame.f_code.co_filename)
        if frame_file != target_file:
            return trace_calls

        scope, heap = build_heap_and_scope(frame.f_locals)
        call_stack = get_call_stack(frame, target_file)
        stdout_val = stdout_interceptor.getvalue()

        event_data = {
            'type': 'STEP',
            'line': frame.f_lineno,
            'scope': scope,
            'heap': heap,
            'callStack': call_stack,
            'stdout': stdout_val
        }
        
        original_stdout.write(json.dumps(event_data) + '\n')
        original_stdout.flush()
        return trace_calls

    sys.settrace(trace_calls)
    try:
        # Override compiler's filename so it matches target_file
        compiled_code = compile(code, target_file, 'exec')
        exec(compiled_code, target_globals)
    except Exception as e:
        sys.settrace(None)
        tb = sys.exc_info()[2]
        while tb and os.path.abspath(tb.tb_frame.f_code.co_filename) != target_file:
            tb = tb.tb_next
        line_num = tb.tb_lineno if tb else -1
        
        error_event = {
            'type': 'ERROR',
            'line': line_num,
            'scope': {},
            'heap': {},
            'callStack': [],
            'error': str(e),
            'stdout': stdout_interceptor.getvalue()
        }
        original_stdout.write(json.dumps(error_event) + '\n')
        original_stdout.flush()
    finally:
        sys.settrace(None)
        sys.stdout = original_stdout
        
    end_event = {
        'type': 'END',
        'line': -1,
        'scope': {},
        'heap': {},
        'callStack': [],
        'stdout': stdout_interceptor.getvalue()
    }
    original_stdout.write(json.dumps(end_event) + '\n')
    original_stdout.flush()
