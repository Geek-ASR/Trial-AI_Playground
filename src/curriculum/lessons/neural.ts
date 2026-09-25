import { B } from '../../world/blocks';
import { bars } from '../viz';
import type { Lesson } from '../types';

export const neural: Lesson[] = [
  {
    id: 'n1-relu',
    realm: 'neural',
    title: 'Activation: ReLU',
    summary: 'The tiny non-linearity that made deep learning work.',
    level: 'beginner',
    xp: 25,
    theory: `Stack linear layers and you still get… a linear function. **Activations** add the
bends that let networks model curves, faces and language.

**ReLU** (rectified linear unit) is brutally simple: \`relu(x) = max(0, x)\`.
Negative values become 0; positive values pass through untouched.`,
    task: 'Write `relu(xs)` applying ReLU to every element of a list.',
    fn: 'relu',
    starter: {
      js: `function relu(xs) {\n  // max(0, x) for each x\n}\n`,
      py: `def relu(xs):\n    # max(0, x) for each x\n    pass\n`,
    },
    solution: {
      js: `function relu(xs) {\n  return xs.map((x) => Math.max(0, x));\n}\n`,
      py: `def relu(xs):\n    return [max(0, x) for x in xs]\n`,
    },
    hints: ['`Math.max(0, x)` / `max(0, x)`.'],
    tests: [
      { call: 'relu([-2, -0.5, 0, 0.5, 2])', expect: [0, 0, 0, 0.5, 2] },
      { call: 'relu([])', expect: [] },
    ],
    viz: {
      calls: ['relu([-6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6])'],
      render: ([v]) => bars(v),
      caption: 'relu(−6 … 6): a flat floor, then a straight ramp — the famous hinge shape.',
    },
  },
  {
    id: 'n2-neuron',
    realm: 'neural',
    title: 'A single neuron',
    summary: 'Weights, bias, activation. That\'s it.',
    level: 'beginner',
    xp: 30,
    theory: `An artificial **neuron** computes a weighted sum of its inputs, adds a **bias**,
and passes the result through an activation:

\`output = σ(w · x + b)\`

With a sigmoid activation, a single neuron *is* logistic regression. Networks are
millions of these, wired in layers.`,
    task: 'Write `neuron(weights, bias, inputs)` using the sigmoid activation.',
    fn: 'neuron',
    starter: {
      js: `function neuron(weights, bias, inputs) {\n  // z = w·x + b; return 1 / (1 + e^-z)\n}\n`,
      py: `import math\n\ndef neuron(weights, bias, inputs):\n    # z = w·x + b; return 1 / (1 + e^-z)\n    pass\n`,
    },
    solution: {
      js: `function neuron(weights, bias, inputs) {\n  const z = weights.reduce((s, w, i) => s + w * inputs[i], bias);\n  return 1 / (1 + Math.exp(-z));\n}\n`,
      py: `import math\n\ndef neuron(weights, bias, inputs):\n    z = sum(w * x for w, x in zip(weights, inputs)) + bias\n    return 1 / (1 + math.exp(-z))\n`,
    },
    hints: ['This is the dot product from Foundations plus one extra number.'],
    tests: [
      { call: 'neuron([1, 1], -2, [1, 1])', expect: 0.5 },
      { call: 'neuron([0.5, -0.5], 0, [4, 2])', expect: 0.7310585786300049 },
      { call: 'neuron([10], -5, [0])', expect: 0.0066928509242848554 },
    ],
  },
  {
    id: 'n3-softmax',
    realm: 'neural',
    title: 'Softmax',
    summary: 'Turn scores into a probability distribution.',
    level: 'intermediate',
    xp: 40,
    theory: `A classifier outputs one raw score (**logit**) per class. **Softmax** turns them into
probabilities that are positive and sum to 1:

\`softmax(z)ᵢ = e^(zᵢ) / Σⱼ e^(zⱼ)\`

**Numerical trick:** subtract \`max(z)\` from every score first. The answer is identical but
\`e^1000\` no longer overflows to infinity. Every LLM does this for every token it generates.`,
    task: 'Write a numerically stable `softmax(zs)`.',
    fn: 'softmax',
    starter: {
      js: `function softmax(zs) {\n  const m = Math.max(...zs);\n  // exponentiate (z - m), then divide by the sum\n}\n`,
      py: `import math\n\ndef softmax(zs):\n    m = max(zs)\n    # exponentiate (z - m), then divide by the sum\n    pass\n`,
    },
    solution: {
      js: `function softmax(zs) {\n  const m = Math.max(...zs);\n  const e = zs.map((z) => Math.exp(z - m));\n  const s = e.reduce((a, b) => a + b, 0);\n  return e.map((x) => x / s);\n}\n`,
      py: `import math\n\ndef softmax(zs):\n    m = max(zs)\n    e = [math.exp(z - m) for z in zs]\n    s = sum(e)\n    return [x / s for x in e]\n`,
    },
    hints: ['Subtract the max before calling exp.', 'Divide every exponentiated value by their sum.'],
    tests: [
      { call: 'softmax([0, 0])', expect: [0.5, 0.5] },
      { call: 'softmax([1, 2, 3])', expect: [0.09003057317038046, 0.24472847105479764, 0.6652409557748219] },
      { call: 'softmax([1000, 1000])', expect: [0.5, 0.5] },
    ],
    viz: {
      calls: ['softmax([1, 3, 0.5, 2, 4, 1.5])'],
      render: ([v]) => bars(v),
      caption: 'The biggest logit grabs most of the probability mass.',
    },
  },
  {
    id: 'n4-cross-entropy',
    realm: 'neural',
    title: 'Cross-entropy loss',
    summary: 'The loss behind nearly every classifier and LLM.',
    level: 'intermediate',
    xp: 40,
    theory: `Given predicted probabilities and the index of the true class, **cross-entropy** is

\`loss = −ln(p[true_class])\`

Confident and right → loss near 0. Confident and wrong → huge loss.
Pre-training an LLM is literally minimising this loss on "what's the next token?".`,
    task: 'Write `cross_entropy(probs, label)`.',
    fn: 'cross_entropy',
    starter: {
      js: `function cross_entropy(probs, label) {\n  // -log of the probability given to the true class\n}\n`,
      py: `import math\n\ndef cross_entropy(probs, label):\n    # -log of the probability given to the true class\n    pass\n`,
    },
    solution: {
      js: `function cross_entropy(probs, label) {\n  return -Math.log(probs[label]);\n}\n`,
      py: `import math\n\ndef cross_entropy(probs, label):\n    return -math.log(probs[label])\n`,
    },
    hints: ['Natural log: `Math.log` in JS, `math.log` in Python.'],
    tests: [
      { call: 'cross_entropy([0.25, 0.75], 1)', expect: 0.2876820724517809 },
      { call: 'cross_entropy([1, 0], 0)', expect: 0 },
      { call: 'cross_entropy([0.5, 0.25, 0.25], 2)', expect: 1.3862943611198906 },
    ],
  },
  {
    id: 'n5-dense',
    realm: 'neural',
    title: 'A dense layer',
    summary: 'Many neurons at once: ReLU(Wx + b).',
    level: 'intermediate',
    xp: 45,
    theory: `A **dense layer** is a row of neurons sharing the same inputs. With weight matrix
\`W\` (one row per neuron) and bias vector \`b\`:

\`output = relu(W · x + b)\`

Stack a few of these and you have a multilayer perceptron — the network you can train
live in the **Neural Forge**.`,
    task: 'Write `dense_forward(W, b, x)` returning `relu(W·x + b)` as a list.',
    fn: 'dense_forward',
    starter: {
      js: `function dense_forward(W, b, x) {\n  // for each row: relu(dot(row, x) + b[i])\n}\n`,
      py: `def dense_forward(W, b, x):\n    # for each row: relu(dot(row, x) + b[i])\n    pass\n`,
    },
    solution: {
      js: `function dense_forward(W, b, x) {\n  return W.map((row, i) => Math.max(0, row.reduce((s, w, j) => s + w * x[j], b[i])));\n}\n`,
      py: `def dense_forward(W, b, x):\n    return [max(0, sum(w * xj for w, xj in zip(row, x)) + bi) for row, bi in zip(W, b)]\n`,
    },
    hints: ['It\'s mat_vec from Foundations, plus a bias, plus relu.'],
    tests: [
      { call: 'dense_forward([[1, 2], [-1, -1]], [0, 0], [1, 1])', expect: [3, 0] },
      { call: 'dense_forward([[0.5, 0.5], [1, -1], [2, 0]], [1, 0, -5], [2, 4])', expect: [4, 0, 0] },
    ],
    viz: {
      calls: ['dense_forward([[1, 0.5], [0.2, 1], [-1, 2], [1, -1], [0.7, 0.7], [2, -0.5], [-0.3, 1.5], [1, 1]], [0, 1, 0, 2, -1, 0, 1, -2], [3, 2])'],
      render: ([v]) => bars(v, { colors: [B.BLUE, B.CYAN, B.GREEN, B.YELLOW, B.ORANGE, B.RED, B.PINK, B.PURPLE] }),
      caption: 'Eight neurons\' activations for input [3, 2]. Stubs are neurons ReLU switched off.',
    },
  },
  {
    id: 'n6-backprop',
    realm: 'neural',
    title: 'Backpropagation',
    summary: 'The chain rule, doing all the learning.',
    level: 'advanced',
    xp: 60,
    theory: `How does a network know how to change each weight? **Backpropagation** applies the
chain rule. For a linear neuron \`ŷ = w·x + b\` with loss \`L = (ŷ − y)²\`:

\`∂L/∂wᵢ = 2(ŷ − y) · xᵢ\`
\`∂L/∂b = 2(ŷ − y)\`

Deep-learning libraries (PyTorch, JAX, TensorFlow) automate exactly this, layer by layer.`,
    task: 'Write `gradients(w, b, x, y)` returning `[∂L/∂w₀, ∂L/∂w₁, …, ∂L/∂b]`.',
    fn: 'gradients',
    starter: {
      js: `function gradients(w, b, x, y) {\n  const y_hat = w.reduce((s, wi, i) => s + wi * x[i], b);\n  const err = y_hat - y;\n  // return [...one gradient per weight, gradient for b]\n}\n`,
      py: `def gradients(w, b, x, y):\n    y_hat = sum(wi * xi for wi, xi in zip(w, x)) + b\n    err = y_hat - y\n    # return [*one gradient per weight, gradient for b]\n    pass\n`,
    },
    solution: {
      js: `function gradients(w, b, x, y) {\n  const y_hat = w.reduce((s, wi, i) => s + wi * x[i], b);\n  const err = y_hat - y;\n  return [...x.map((xi) => 2 * err * xi), 2 * err];\n}\n`,
      py: `def gradients(w, b, x, y):\n    y_hat = sum(wi * xi for wi, xi in zip(w, x)) + b\n    err = y_hat - y\n    return [2 * err * xi for xi in x] + [2 * err]\n`,
    },
    hints: ['Every gradient shares the factor 2·(ŷ − y).'],
    tests: [
      { call: 'gradients([1, 1], 0, [2, 3], 5)', expect: [0, 0, 0] },
      { call: 'gradients([2], 1, [3], 4)', expect: [18, 6] },
      { call: 'gradients([0.5, -1], 0, [2, 1], 1)', expect: [-4, -2, -2] },
    ],
  },
];
