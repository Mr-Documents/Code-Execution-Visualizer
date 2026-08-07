// Exercises the traversal caps: without them each step would walk (and issue a
// protocol round trip for) every one of these objects.
const many = [];
for (let i = 0; i < 300; i++) {
    many.push({ id: i, tags: ["a", "b"] });
}
console.log(many.length);
