/**
 * Short coding challenges. Tests are expressions valid in both JavaScript and
 * Python (like the lessons), checked with numeric tolerance.
 */

export interface CodeChallenge {
  id: string;
  title: string;
  level: 'easy' | 'medium' | 'hard';
  prompt: string;
  fn: string;
  starter: { js: string; py: string };
  solution: { js: string; py: string };
  tests: { call: string; expect: unknown }[];
  reward: number;
}

export const CODE_CHALLENGES: CodeChallenge[] = [
  {
    id: 'c-relu', title: 'ReLU', level: 'easy', fn: 'relu', reward: 12,
    prompt: 'Write relu(x): return x if it is positive, otherwise 0.',
    starter: { js: 'function relu(x) {\n  // your code\n}\n', py: 'def relu(x):\n    # your code\n    pass\n' },
    solution: { js: 'function relu(x) { return Math.max(0, x); }', py: 'def relu(x):\n    return max(0, x)\n' },
    tests: [{ call: 'relu(3)', expect: 3 }, { call: 'relu(-2)', expect: 0 }, { call: 'relu(0)', expect: 0 }, { call: 'relu(0.5)', expect: 0.5 }],
  },
  {
    id: 'c-clip', title: 'Clip', level: 'easy', fn: 'clip', reward: 12,
    prompt: 'Write clip(x, lo, hi): keep x inside the range [lo, hi]. (Used for gradient clipping!)',
    starter: { js: 'function clip(x, lo, hi) {\n  // your code\n}\n', py: 'def clip(x, lo, hi):\n    # your code\n    pass\n' },
    solution: { js: 'function clip(x, lo, hi) { return Math.min(hi, Math.max(lo, x)); }', py: 'def clip(x, lo, hi):\n    return min(hi, max(lo, x))\n' },
    tests: [{ call: 'clip(5, 0, 1)', expect: 1 }, { call: 'clip(-3, -1, 1)', expect: -1 }, { call: 'clip(0.25, 0, 1)', expect: 0.25 }],
  },
  {
    id: 'c-dot', title: 'Dot product', level: 'easy', fn: 'dot', reward: 15,
    prompt: 'Write dot(a, b) for two lists of equal length: the sum of a[i] × b[i].',
    starter: { js: 'function dot(a, b) {\n  // your code\n}\n', py: 'def dot(a, b):\n    # your code\n    pass\n' },
    solution: { js: 'function dot(a, b) { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; }', py: 'def dot(a, b):\n    return sum(x * y for x, y in zip(a, b))\n' },
    tests: [{ call: 'dot([1, 2, 3], [4, 5, 6])', expect: 32 }, { call: 'dot([1, -1], [1, 1])', expect: 0 }, { call: 'dot([2], [0.5])', expect: 1 }],
  },
  {
    id: 'c-mean', title: 'Mean', level: 'easy', fn: 'mean', reward: 12,
    prompt: 'Write mean(xs): the average of a list of numbers.',
    starter: { js: 'function mean(xs) {\n  // your code\n}\n', py: 'def mean(xs):\n    # your code\n    pass\n' },
    solution: { js: 'function mean(xs) { return xs.reduce((s, x) => s + x, 0) / xs.length; }', py: 'def mean(xs):\n    return sum(xs) / len(xs)\n' },
    tests: [{ call: 'mean([1, 2, 3, 4])', expect: 2.5 }, { call: 'mean([10])', expect: 10 }, { call: 'mean([-1, 1])', expect: 0 }],
  },
  {
    id: 'c-argmax', title: 'Argmax', level: 'easy', fn: 'argmax', reward: 15,
    prompt: 'Write argmax(xs): the index of the largest value (the first one if tied). This is how a classifier picks its answer.',
    starter: { js: 'function argmax(xs) {\n  // your code\n}\n', py: 'def argmax(xs):\n    # your code\n    pass\n' },
    solution: { js: 'function argmax(xs) { let b = 0; for (let i = 1; i < xs.length; i++) if (xs[i] > xs[b]) b = i; return b; }', py: 'def argmax(xs):\n    return xs.index(max(xs))\n' },
    tests: [{ call: 'argmax([0.1, 0.7, 0.2])', expect: 1 }, { call: 'argmax([5, 1, 5])', expect: 0 }, { call: 'argmax([-3, -1, -2])', expect: 1 }],
  },
  {
    id: 'c-onehot', title: 'One-hot', level: 'easy', fn: 'one_hot', reward: 15,
    prompt: 'Write one_hot(i, n): a list of n zeros with a 1 at position i.',
    starter: { js: 'function one_hot(i, n) {\n  // your code\n}\n', py: 'def one_hot(i, n):\n    # your code\n    pass\n' },
    solution: { js: 'function one_hot(i, n) { return Array.from({ length: n }, (_, k) => (k === i ? 1 : 0)); }', py: 'def one_hot(i, n):\n    return [1 if k == i else 0 for k in range(n)]\n' },
    tests: [{ call: 'one_hot(1, 3)', expect: [0, 1, 0] }, { call: 'one_hot(0, 1)', expect: [1] }, { call: 'one_hot(3, 5)', expect: [0, 0, 0, 1, 0] }],
  },
  {
    id: 'c-mse', title: 'Mean squared error', level: 'medium', fn: 'mse', reward: 20,
    prompt: 'Write mse(pred, target): the average of (pred[i] − target[i])².',
    starter: { js: 'function mse(pred, target) {\n  // your code\n}\n', py: 'def mse(pred, target):\n    # your code\n    pass\n' },
    solution: { js: 'function mse(p, t) { let s = 0; for (let i = 0; i < p.length; i++) s += (p[i] - t[i]) ** 2; return s / p.length; }', py: 'def mse(pred, target):\n    return sum((p - t) ** 2 for p, t in zip(pred, target)) / len(pred)\n' },
    tests: [{ call: 'mse([1, 2, 3], [1, 2, 3])', expect: 0 }, { call: 'mse([0, 0], [1, 3])', expect: 5 }, { call: 'mse([2], [-2])', expect: 16 }],
  },
  {
    id: 'c-accuracy', title: 'Accuracy', level: 'medium', fn: 'accuracy', reward: 18,
    prompt: 'Write accuracy(pred, labels): the fraction of positions where the prediction equals the label.',
    starter: { js: 'function accuracy(pred, labels) {\n  // your code\n}\n', py: 'def accuracy(pred, labels):\n    # your code\n    pass\n' },
    solution: { js: 'function accuracy(p, y) { let c = 0; for (let i = 0; i < p.length; i++) if (p[i] === y[i]) c++; return c / p.length; }', py: 'def accuracy(pred, labels):\n    return sum(1 for p, y in zip(pred, labels) if p == y) / len(pred)\n' },
    tests: [{ call: 'accuracy([1, 0, 1, 1], [1, 0, 0, 1])', expect: 0.75 }, { call: 'accuracy([2, 2], [2, 2])', expect: 1 }, { call: 'accuracy([0], [1])', expect: 0 }],
  },
  {
    id: 'c-normalize', title: 'Normalise to probabilities', level: 'medium', fn: 'normalize', reward: 18,
    prompt: 'Write normalize(xs): divide every (non-negative) value by the total so the list sums to 1.',
    starter: { js: 'function normalize(xs) {\n  // your code\n}\n', py: 'def normalize(xs):\n    # your code\n    pass\n' },
    solution: { js: 'function normalize(xs) { const t = xs.reduce((s, x) => s + x, 0); return xs.map((x) => x / t); }', py: 'def normalize(xs):\n    t = sum(xs)\n    return [x / t for x in xs]\n' },
    tests: [{ call: 'normalize([1, 1, 2])', expect: [0.25, 0.25, 0.5] }, { call: 'normalize([5])', expect: [1] }, { call: 'normalize([3, 1])', expect: [0.75, 0.25] }],
  },
  {
    id: 'c-sigmoid', title: 'Sigmoid', level: 'medium', fn: 'sigmoid', reward: 18,
    prompt: 'Write sigmoid(z) = 1 / (1 + e^(−z)). (JavaScript: Math.exp · Python: import math, math.exp)',
    starter: { js: 'function sigmoid(z) {\n  // your code\n}\n', py: 'import math\n\ndef sigmoid(z):\n    # your code\n    pass\n' },
    solution: { js: 'function sigmoid(z) { return 1 / (1 + Math.exp(-z)); }', py: 'import math\n\ndef sigmoid(z):\n    return 1 / (1 + math.exp(-z))\n' },
    tests: [{ call: 'sigmoid(0)', expect: 0.5 }, { call: 'sigmoid(2)', expect: 0.8807970779778823 }, { call: 'sigmoid(-2)', expect: 0.11920292202211755 }],
  },
  {
    id: 'c-euclid', title: 'Distance', level: 'medium', fn: 'distance', reward: 18,
    prompt: 'Write distance(a, b): the Euclidean distance between two points given as lists. (k-NN and k-means both need it.)',
    starter: { js: 'function distance(a, b) {\n  // your code\n}\n', py: 'def distance(a, b):\n    # your code\n    pass\n' },
    solution: { js: 'function distance(a, b) { let s = 0; for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2; return Math.sqrt(s); }', py: 'def distance(a, b):\n    return sum((x - y) ** 2 for x, y in zip(a, b)) ** 0.5\n' },
    tests: [{ call: 'distance([0, 0], [3, 4])', expect: 5 }, { call: 'distance([1, 1, 1], [1, 1, 1])', expect: 0 }, { call: 'distance([-1], [2])', expect: 3 }],
  },
  {
    id: 'c-softmax', title: 'Softmax', level: 'hard', fn: 'softmax', reward: 30,
    prompt: 'Write softmax(xs): exponentiate each value and divide by the total. Tip: subtract the max first so big numbers don’t overflow.',
    starter: { js: 'function softmax(xs) {\n  // your code\n}\n', py: 'import math\n\ndef softmax(xs):\n    # your code\n    pass\n' },
    solution: { js: 'function softmax(xs) { const m = Math.max(...xs); const e = xs.map((x) => Math.exp(x - m)); const t = e.reduce((s, x) => s + x, 0); return e.map((x) => x / t); }', py: 'import math\n\ndef softmax(xs):\n    m = max(xs)\n    e = [math.exp(x - m) for x in xs]\n    t = sum(e)\n    return [x / t for x in e]\n' },
    tests: [{ call: 'softmax([0, 0])', expect: [0.5, 0.5] }, { call: 'softmax([1, 2, 3])', expect: [0.09003057317038046, 0.24472847105479764, 0.6652409557748219] }, { call: 'softmax([1000, 1000])', expect: [0.5, 0.5] }],
  },
  {
    id: 'c-gdstep', title: 'Gradient descent', level: 'hard', fn: 'descend', reward: 30,
    prompt: 'Minimise f(w) = (w − 3)². Its gradient is 2(w − 3). Write descend(w, lr, steps): apply w ← w − lr × gradient, steps times, and return w.',
    starter: { js: 'function descend(w, lr, steps) {\n  // your code\n}\n', py: 'def descend(w, lr, steps):\n    # your code\n    pass\n' },
    solution: { js: 'function descend(w, lr, steps) { for (let i = 0; i < steps; i++) w -= lr * 2 * (w - 3); return w; }', py: 'def descend(w, lr, steps):\n    for _ in range(steps):\n        w -= lr * 2 * (w - 3)\n    return w\n' },
    tests: [{ call: 'descend(0, 0.5, 1)', expect: 3 }, { call: 'descend(0, 0.1, 1)', expect: 0.6 }, { call: 'descend(10, 0.1, 50)', expect: 3.0001 }],
  },
  {
    id: 'c-knn1', title: 'Nearest neighbour', level: 'hard', fn: 'nearest_label', reward: 35,
    prompt: 'points is a list of [x, y, label]. Write nearest_label(points, x, y): the label of the point closest to (x, y).',
    starter: { js: 'function nearest_label(points, x, y) {\n  // your code\n}\n', py: 'def nearest_label(points, x, y):\n    # your code\n    pass\n' },
    solution: { js: 'function nearest_label(points, x, y) { let best = null, bd = Infinity; for (const [px, py, l] of points) { const d = (px - x) ** 2 + (py - y) ** 2; if (d < bd) { bd = d; best = l; } } return best; }', py: 'def nearest_label(points, x, y):\n    return min(points, key=lambda p: (p[0] - x) ** 2 + (p[1] - y) ** 2)[2]\n' },
    tests: [{ call: 'nearest_label([[0, 0, 0], [5, 5, 1]], 1, 1)', expect: 0 }, { call: 'nearest_label([[0, 0, 0], [5, 5, 1]], 4, 6)', expect: 1 }, { call: 'nearest_label([[2, 2, 7]], -9, 9)', expect: 7 }],
  },
];

/** Tolerance for comparing results (descend() converges to 3 within 1e-3). */
export const CODE_TOLERANCE = 1e-3;
