const { shouldNotBeTraced } = require('./lib/main.js');

const result = shouldNotBeTraced(21);
console.log("done", result);
