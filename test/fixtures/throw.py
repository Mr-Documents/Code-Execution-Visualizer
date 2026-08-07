def divide(a, b):
    if b == 0:
        raise ValueError("Division by zero")
    return a / b


print("start")
divide(10, 0)
