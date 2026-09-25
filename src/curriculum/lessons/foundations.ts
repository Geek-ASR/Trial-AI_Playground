import { bars, heatmap } from '../viz';
import type { Lesson } from '../types';

export const foundations: Lesson[] = [
  {
    id: 'f1-functions',
    realm: 'foundations',
    title: 'Your first function',
    summary: 'Every model is just a function. Write one.',
    level: 'beginner',
    xp: 20,
    theory: `A machine-learning model is a **function**: numbers go in, a prediction comes out.
Before we train anything, let's make sure writing one feels natural.

In this playground you can answer in **JavaScript** or **Python** — switch with the
language toggle. The tests run the same way for both.`,
    task: 'Write `square(x)` that returns `x` multiplied by itself.',
    fn: 'square',
    starter: {
      js: `function square(x) {\n  // return x times x\n}\n`,
      py: `def square(x):\n    # return x times x\n    pass\n`,
    },
    solution: {
      js: `function square(x) {\n  return x * x;\n}\n`,
      py: `def square(x):\n    return x * x\n`,
    },
    hints: ['Use the `*` operator.', 'Don\'t forget to `return` the value.'],
    tests: [
      { call: 'square(3)', expect: 9 },
      { call: 'square(-4)', expect: 16 },
      { call: 'square(0.5)', expect: 0.25 },
    ],
    viz: {
      calls: ['square(1)', 'square(2)', 'square(3)', 'square(4)', 'square(5)', 'square(6)'],
      render: (v) => bars(v),
      caption: 'Towers of 1², 2², … 6² — notice how fast squares grow.',
    },
  },
  {
    id: 'f2-vector-add',
    realm: 'foundations',
    title: 'Vectors',
    summary: 'Data points are lists of numbers. Add two of them.',
    level: 'beginner',
    xp: 25,
    theory: `A **vector** is an ordered list of numbers. A house might be \`[bedrooms, area, age]\`;
a pixel might be \`[red, green, blue]\`. Almost everything in ML is a vector.

Adding vectors works **element by element**: \`[1, 2] + [10, 20] = [11, 22]\`.`,
    task: 'Write `vector_add(a, b)` that returns a new list where each element is `a[i] + b[i]`.',
    fn: 'vector_add',
    starter: {
      js: `function vector_add(a, b) {\n  const out = [];\n  // loop over the indices and push a[i] + b[i]\n  return out;\n}\n`,
      py: `def vector_add(a, b):\n    out = []\n    # loop over the indices and append a[i] + b[i]\n    return out\n`,
    },
    solution: {
      js: `function vector_add(a, b) {\n  return a.map((x, i) => x + b[i]);\n}\n`,
      py: `def vector_add(a, b):\n    return [x + y for x, y in zip(a, b)]\n`,
    },
    hints: ['JS: `a.map((x, i) => x + b[i])`.', 'Python: `zip(a, b)` pairs up the elements.'],
    tests: [
      { call: 'vector_add([1, 2, 3], [10, 20, 30])', expect: [11, 22, 33] },
      { call: 'vector_add([0.5, -1], [0.5, 1])', expect: [1, 0] },
      { call: 'vector_add([], [])', expect: [] },
    ],
    viz: {
      calls: ['vector_add([3, 1, 4, 1, 5], [2, 7, 1, 8, 2])'],
      render: ([v]) => bars(v),
      caption: '[3,1,4,1,5] + [2,7,1,8,2] as towers.',
    },
  },
  {
    id: 'f3-dot',
    realm: 'foundations',
    title: 'The dot product',
    summary: 'The single most important operation in deep learning.',
    level: 'beginner',
    xp: 30,
    theory: `The **dot product** multiplies two vectors element by element and adds the results:

\`dot([1, 2, 3], [4, 5, 6]) = 1·4 + 2·5 + 3·6 = 32\`

A neuron is a dot product of its **weights** with its **inputs**. Attention in transformers
is dot products between queries and keys. Similarity search is dot products between embeddings.
Learn this one well.`,
    task: 'Write `dot(a, b)` returning the sum of `a[i] * b[i]`.',
    fn: 'dot',
    starter: {
      js: `function dot(a, b) {\n  let total = 0;\n  // add a[i] * b[i] for every i\n  return total;\n}\n`,
      py: `def dot(a, b):\n    total = 0\n    # add a[i] * b[i] for every i\n    return total\n`,
    },
    solution: {
      js: `function dot(a, b) {\n  let total = 0;\n  for (let i = 0; i < a.length; i++) total += a[i] * b[i];\n  return total;\n}\n`,
      py: `def dot(a, b):\n    return sum(x * y for x, y in zip(a, b))\n`,
    },
    hints: ['Keep a running total and add one product per index.'],
    tests: [
      { call: 'dot([1, 2, 3], [4, 5, 6])', expect: 32 },
      { call: 'dot([1, 0], [0, 1])', expect: 0 },
      { call: 'dot([0.5, 0.5], [2, -2])', expect: 0 },
      { call: 'dot([-1, 3], [2, 2])', expect: 4 },
    ],
  },
  {
    id: 'f4-mat-vec',
    realm: 'foundations',
    title: 'Matrix × vector',
    summary: 'A layer of a neural network, in one line of maths.',
    level: 'intermediate',
    xp: 35,
    theory: `A **matrix** is a list of rows, each row a vector. Multiplying a matrix \`M\` by a
vector \`v\` gives a new vector: **one dot product per row**.

\`\`\`
[[1, 2],      [5,      [1·5 + 2·6,     [17,
 [3, 4]]  ×    6]   =   3·5 + 4·6]  =   39]
\`\`\`

A dense neural-network layer is exactly this: \`outputs = W × inputs\`.`,
    task: 'Write `mat_vec(M, v)` returning a list with `dot(row, v)` for each row of `M`.',
    fn: 'mat_vec',
    starter: {
      js: `function mat_vec(M, v) {\n  // one dot product per row\n}\n`,
      py: `def mat_vec(M, v):\n    # one dot product per row\n    pass\n`,
    },
    solution: {
      js: `function mat_vec(M, v) {\n  return M.map((row) => row.reduce((s, x, i) => s + x * v[i], 0));\n}\n`,
      py: `def mat_vec(M, v):\n    return [sum(x * y for x, y in zip(row, v)) for row in M]\n`,
    },
    hints: ['Reuse the dot product idea for each row.', 'The output has as many entries as M has rows.'],
    tests: [
      { call: 'mat_vec([[1, 2], [3, 4]], [5, 6])', expect: [17, 39] },
      { call: 'mat_vec([[1, 0, 0], [0, 1, 0], [0, 0, 1]], [7, 8, 9])', expect: [7, 8, 9] },
      { call: 'mat_vec([[2, -1]], [3, 3])', expect: [3] },
    ],
    viz: {
      calls: [
        'mat_vec([[1, 2, 3], [4, 5, 6], [7, 8, 9], [2, 2, 2], [0, 1, 0], [3, 0, 1]], [1, 1, 1])',
      ],
      render: ([v]) => bars(v),
      caption: 'Each tower is one row of the matrix dotted with [1,1,1] — the row sums.',
    },
  },
  {
    id: 'f5-matmul',
    realm: 'foundations',
    title: 'Matrix multiplication',
    summary: 'Batch everything: the operation GPUs were built for.',
    level: 'intermediate',
    xp: 40,
    theory: `Multiplying matrix \`A\` (n×k) by \`B\` (k×m) gives \`C\` (n×m) where

\`C[i][j] = dot(row i of A, column j of B)\`

This is how a whole **batch** of inputs flows through a layer at once, and it's the
operation GPUs and TPUs are optimised for.`,
    task: 'Write `matmul(A, B)` returning the matrix product as a list of rows.',
    fn: 'matmul',
    starter: {
      js: `function matmul(A, B) {\n  // C[i][j] = sum over k of A[i][k] * B[k][j]\n}\n`,
      py: `def matmul(A, B):\n    # C[i][j] = sum over k of A[i][k] * B[k][j]\n    pass\n`,
    },
    solution: {
      js: `function matmul(A, B) {\n  return A.map((row) => B[0].map((_, j) => row.reduce((s, a, k) => s + a * B[k][j], 0)));\n}\n`,
      py: `def matmul(A, B):\n    return [[sum(A[i][k] * B[k][j] for k in range(len(B))) for j in range(len(B[0]))] for i in range(len(A))]\n`,
    },
    hints: ['Three nested loops: rows of A, columns of B, and the shared dimension k.'],
    tests: [
      { call: 'matmul([[1, 2], [3, 4]], [[5, 6], [7, 8]])', expect: [[19, 22], [43, 50]] },
      { call: 'matmul([[1, 0], [0, 1]], [[9, 8], [7, 6]])', expect: [[9, 8], [7, 6]] },
      { call: 'matmul([[1, 2, 3]], [[1], [2], [3]])', expect: [[14]] },
    ],
    viz: {
      calls: ['matmul([[1, 2, 3], [4, 5, 6], [7, 8, 9], [1, 0, 1]], [[1, 0, 2, 1], [0, 1, 1, 2], [1, 1, 0, 3]])'],
      render: ([m]) => heatmap(m),
      caption: 'The 4×4 product as a heat-map: taller and warmer = bigger value.',
    },
  },
  {
    id: 'f6-gradient-step',
    realm: 'foundations',
    title: 'Walking downhill',
    summary: 'Gradient descent: how every model learns.',
    level: 'intermediate',
    xp: 40,
    theory: `Training a model means **minimising a loss**. The **gradient** tells you which way is
uphill, so you take a small step the other way:

\`new_w = w - learning_rate × gradient\`

For the loss \`L(w) = (w - 3)²\`, the gradient is \`2(w - 3)\`. Repeating the step moves \`w\`
towards 3 — that's gradient descent.`,
    task: 'Write `descend(w, lr, steps)` that starts at `w` and applies `steps` gradient-descent updates on `L(w) = (w - 3)²`, returning the final `w`.',
    fn: 'descend',
    starter: {
      js: `function descend(w, lr, steps) {\n  for (let i = 0; i < steps; i++) {\n    const grad = 0; // TODO: gradient of (w - 3)^2\n    w = w - lr * grad;\n  }\n  return w;\n}\n`,
      py: `def descend(w, lr, steps):\n    for _ in range(steps):\n        grad = 0  # TODO: gradient of (w - 3)**2\n        w = w - lr * grad\n    return w\n`,
    },
    solution: {
      js: `function descend(w, lr, steps) {\n  for (let i = 0; i < steps; i++) {\n    const grad = 2 * (w - 3);\n    w = w - lr * grad;\n  }\n  return w;\n}\n`,
      py: `def descend(w, lr, steps):\n    for _ in range(steps):\n        grad = 2 * (w - 3)\n        w = w - lr * grad\n    return w\n`,
    },
    hints: ['The gradient of (w − 3)² is 2 × (w − 3).'],
    tests: [
      { call: 'descend(0, 0.1, 1)', expect: 0.6 },
      { call: 'descend(0, 0.1, 2)', expect: 1.08 },
      { call: 'descend(10, 0.5, 1)', expect: 3 },
      { call: 'descend(0, 0.1, 100)', expect: 3, tol: 1e-4 },
    ],
    viz: {
      calls: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((s) => `descend(0, 0.15, ${s})`),
      render: (v) => bars(v),
      caption: 'w after 0…9 steps, climbing towards the minimum at w = 3.',
    },
  },
];
