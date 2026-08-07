// Inside the loop body the innermost scope holds only `i`; `items` and `total`
// live in the enclosing scope. Reading a single scope hid them.
const items = [10, 20, 30];
let total = 0;

for (let i = 0; i < 3; i++) {
    total += items[i];
}

console.log(total);
