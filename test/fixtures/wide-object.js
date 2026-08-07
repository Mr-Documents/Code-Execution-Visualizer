// Exercises the traversal caps: without them each step would walk (and issue a
// protocol round trip for) every one of these 300 objects.
// The graph is constructed in a separate module so this file's few steps are
// spent on the traversal itself rather than on building the data.
const many = require('./wide-object-data.js');

const count = many.length;
console.log(count);
