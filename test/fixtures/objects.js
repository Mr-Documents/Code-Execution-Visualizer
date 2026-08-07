const nested = { inner: { deep: [1, 2, 3] } };
const list = [nested, { other: "value" }];
const cyclic = { name: "loop" };
cyclic.self = cyclic;

console.log(list.length + Object.keys(cyclic).length);
