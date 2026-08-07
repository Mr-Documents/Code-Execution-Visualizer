// Built outside the traced entry point on purpose: the tracer only records
// steps in the target file, so the graph appears in scope without the test
// paying a round trip per construction step.
const many = [];
for (let i = 0; i < 300; i++) {
    many.push({ id: i, tags: ["a", "b"] });
}

module.exports = many;
