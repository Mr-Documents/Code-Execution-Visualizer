// A large structure stays in scope for the whole loop, so every step
// re-serializes it. This is the shape that makes trace size grow with
// (graph size x step count) rather than with step count alone.
const data = require('./wide-object-data.js');

let total = 0;
for (let i = 0; i < 100; i++) {
    total += data[i].id;
}

console.log(total);
