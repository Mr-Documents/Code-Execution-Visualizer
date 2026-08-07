nested = {"inner": {"deep": [1, 2, 3]}}
items = [nested, {"other": "value"}]

cyclic = {"name": "loop"}
cyclic["self"] = cyclic

print(len(items) + len(cyclic))
