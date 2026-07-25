console.log("Starting JS script...");

function greet(userName) {
    console.log("Inside greet function");
    const msg = `Hello, ${userName}!`;
    const items = [1, 2, [3, 4]];
    console.log(msg);
    return msg;
}

const name = "Alice";
const friends = ["Bob", "Charlie"];
greet(name);
console.log("Finished!");
