// Deliberately shares a filename with the entry point that requires it.
// Matching frames on basename alone would trace this as if it were user code.
function shouldNotBeTraced(value) {
    return value * 2;
}

module.exports = { shouldNotBeTraced };
