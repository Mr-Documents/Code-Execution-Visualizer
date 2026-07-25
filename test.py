print("Starting script...")

def greet(user_name):
    print("Inside greet function")
    msg = f"Hello, {user_name}!"
    items = [1, 2, [3, 4]]
    print(msg)
    return msg

name = "Alice"
friends = ["Bob", "Charlie"]
greet(name)
print("Finished!")
