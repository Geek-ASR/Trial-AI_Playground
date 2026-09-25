import { B, CATEGORY_BLOCKS } from '../../world/blocks';
import type { VoxelOp } from '../../world/ops';
import { PAD, scatter } from '../viz';
import type { Lesson } from '../types';

const LINE_X = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const LINE_Y = [2.1, 3.9, 6.2, 7.8, 10.1, 12.2, 13.8, 16.1, 18, 20.2];

/** Two clusters of labelled points for k-NN. */
const KNN_POINTS = [
  [1, 1], [1.5, 2], [2, 1.2], [2.5, 2.5], [1.2, 3], [3, 1.5],
  [6, 6], [6.5, 7], [7, 6.2], [7.5, 7.5], [6.2, 8], [8, 6.5],
  [2, 7], [2.5, 8], [3, 7.2], [1.5, 7.8],
];
const KNN_LABELS = [0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2];

const KM_POINTS = [
  [1, 1], [1.5, 1.8], [2, 1], [1.2, 2.2], [8, 8], [8.5, 7.2], [7.5, 8.8], [9, 8.1],
  [1, 8], [2, 9], [1.5, 8.5], [2.2, 7.8],
];
const KM_START = [[0, 0], [5, 5], [0, 10]];

const grid = (n: number, lo: number, hi: number) =>
  Array.from({ length: n }, (_, i) => lo + ((hi - lo) * i) / (n - 1));

export const classic: Lesson[] = [
  {
    id: 'c1-mse',
    realm: 'classic',
    title: 'Measuring error: MSE',
    summary: 'A model is only as good as the loss you judge it by.',
    level: 'beginner',
    xp: 25,
    theory: `To improve a model we need a single number that says how wrong it is.
**Mean squared error** averages the squared differences between truth and prediction:

\`MSE = mean((y_true - y_pred)²)\`

Squaring makes all errors positive and punishes big mistakes much more than small ones.`,
    task: 'Write `mse(y_true, y_pred)`.',
    fn: 'mse',
    starter: {
      js: `function mse(y_true, y_pred) {\n  // average of squared differences\n}\n`,
      py: `def mse(y_true, y_pred):\n    # average of squared differences\n    pass\n`,
    },
    solution: {
      js: `function mse(y_true, y_pred) {\n  return y_true.reduce((s, y, i) => s + (y - y_pred[i]) ** 2, 0) / y_true.length;\n}\n`,
      py: `def mse(y_true, y_pred):\n    return sum((a - b) ** 2 for a, b in zip(y_true, y_pred)) / len(y_true)\n`,
    },
    hints: ['Square each difference before averaging.'],
    tests: [
      { call: 'mse([1, 2, 3], [1, 2, 3])', expect: 0 },
      { call: 'mse([0, 0], [1, 3])', expect: 5 },
      { call: 'mse([2.5, 0.0, 2, 8], [3, -0.5, 2, 7])', expect: 0.375 },
    ],
  },
  {
    id: 'c2-fit-line',
    realm: 'classic',
    title: 'Linear regression',
    summary: 'Fit the best straight line through data.',
    level: 'intermediate',
    xp: 45,
    theory: `**Linear regression** finds the line \`y = slope·x + intercept\` with the lowest MSE.
For one feature there's a closed-form answer (ordinary least squares):

\`slope = Σ(x - x̄)(y - ȳ) / Σ(x - x̄)²\`
\`intercept = ȳ - slope · x̄\`

It's the "hello world" of ML — and still one of the most used models in industry.`,
    task: 'Write `fit_line(xs, ys)` returning `[slope, intercept]`.',
    fn: 'fit_line',
    starter: {
      js: `function fit_line(xs, ys) {\n  const n = xs.length;\n  const mx = xs.reduce((a, b) => a + b, 0) / n;\n  const my = ys.reduce((a, b) => a + b, 0) / n;\n  // compute slope, then intercept\n  return [0, 0];\n}\n`,
      py: `def fit_line(xs, ys):\n    n = len(xs)\n    mx, my = sum(xs) / n, sum(ys) / n\n    # compute slope, then intercept\n    return [0, 0]\n`,
    },
    solution: {
      js: `function fit_line(xs, ys) {\n  const n = xs.length;\n  const mx = xs.reduce((a, b) => a + b, 0) / n;\n  const my = ys.reduce((a, b) => a + b, 0) / n;\n  let num = 0, den = 0;\n  for (let i = 0; i < n; i++) {\n    num += (xs[i] - mx) * (ys[i] - my);\n    den += (xs[i] - mx) ** 2;\n  }\n  const slope = num / den;\n  return [slope, my - slope * mx];\n}\n`,
      py: `def fit_line(xs, ys):\n    n = len(xs)\n    mx, my = sum(xs) / n, sum(ys) / n\n    num = sum((x - mx) * (y - my) for x, y in zip(xs, ys))\n    den = sum((x - mx) ** 2 for x in xs)\n    slope = num / den\n    return [slope, my - slope * mx]\n`,
    },
    hints: ['Numerator: Σ(x − x̄)(y − ȳ). Denominator: Σ(x − x̄)².', 'intercept = ȳ − slope·x̄'],
    tests: [
      { call: 'fit_line([0, 1, 2], [1, 3, 5])', expect: [2, 1] },
      { call: 'fit_line([1, 2, 3, 4], [10, 8, 6, 4])', expect: [-2, 12] },
      { call: 'fit_line([1, 2, 3], [2, 2, 5])', expect: [1.5, 0] },
    ],
    viz: {
      calls: [`fit_line(${JSON.stringify(LINE_X)}, ${JSON.stringify(LINE_Y)})`],
      render: ([fit]) => {
        const pts = LINE_X.map((x, i) => [x, LINE_Y[i]]);
        const bounds: [number, number, number, number] = [0, 11, 0, 22];
        const { ops, tx, tz } = scatter(pts, { bounds, y: 1 });
        if (Array.isArray(fit) && typeof fit[0] === 'number' && typeof fit[1] === 'number') {
          const [m, c] = fit as number[];
          for (let xv = 0; xv <= 11; xv += 0.1) {
            const X = tx(xv);
            const Z = tz(m * xv + c);
            if (Math.abs(Z) <= PAD && Math.abs(X) <= PAD) ops.push({ x: X, y: 0, z: Z, b: B.GOLD });
          }
        }
        return ops;
      },
      caption: 'Blue: data points. Gold: your fitted line running through them.',
    },
  },
  {
    id: 'c3-sigmoid',
    realm: 'classic',
    title: 'Logistic regression',
    summary: 'Squash any number into a probability.',
    level: 'beginner',
    xp: 30,
    theory: `For yes/no questions we want a **probability**, not an unbounded number.
The **sigmoid** squashes any real number into \`(0, 1)\`:

\`σ(z) = 1 / (1 + e^(−z))\`

Logistic regression is \`σ(w·x + b)\`: a linear model followed by a sigmoid.`,
    task: 'Write `predict_proba(w, b, x)` returning `σ(dot(w, x) + b)`.',
    fn: 'predict_proba',
    starter: {
      js: `function predict_proba(w, b, x) {\n  // z = dot(w, x) + b, then sigmoid\n}\n`,
      py: `import math\n\ndef predict_proba(w, b, x):\n    # z = dot(w, x) + b, then sigmoid\n    pass\n`,
    },
    solution: {
      js: `function predict_proba(w, b, x) {\n  const z = w.reduce((s, wi, i) => s + wi * x[i], b);\n  return 1 / (1 + Math.exp(-z));\n}\n`,
      py: `import math\n\ndef predict_proba(w, b, x):\n    z = sum(wi * xi for wi, xi in zip(w, x)) + b\n    return 1 / (1 + math.exp(-z))\n`,
    },
    hints: ['JS: `Math.exp`. Python: `math.exp`.'],
    tests: [
      { call: 'predict_proba([0, 0], 0, [5, 5])', expect: 0.5 },
      { call: 'predict_proba([1], 0, [2])', expect: 0.8807970779778823 },
      { call: 'predict_proba([2, -1], -1, [1, 1])', expect: 0.5 },
    ],
  },
  {
    id: 'c4-knn',
    realm: 'classic',
    title: 'k-Nearest Neighbours',
    summary: 'Classify by asking the neighbours.',
    level: 'intermediate',
    xp: 45,
    theory: `**k-NN** is the most intuitive classifier: to label a new point, find the \`k\`
closest training points (by Euclidean distance) and take a **majority vote** of their labels.
If two labels tie, choose the smaller label.

There's no training step at all — the data *is* the model.`,
    task: 'Write `knn_predict(points, labels, query, k)` returning the predicted label.',
    fn: 'knn_predict',
    starter: {
      js: `function knn_predict(points, labels, query, k) {\n  // 1. distance from query to every point\n  // 2. take the k closest\n  // 3. majority vote (ties -> smaller label)\n}\n`,
      py: `def knn_predict(points, labels, query, k):\n    # 1. distance from query to every point\n    # 2. take the k closest\n    # 3. majority vote (ties -> smaller label)\n    pass\n`,
    },
    solution: {
      js: `function knn_predict(points, labels, query, k) {\n  const d = points.map((p, i) => [Math.hypot(p[0] - query[0], p[1] - query[1]), labels[i]]);\n  d.sort((a, b) => a[0] - b[0]);\n  const votes = {};\n  for (const [, l] of d.slice(0, k)) votes[l] = (votes[l] || 0) + 1;\n  let best = null;\n  for (const l of Object.keys(votes).map(Number).sort((a, b) => a - b)) {\n    if (best === null || votes[l] > votes[best]) best = l;\n  }\n  return best;\n}\n`,
      py: `import math\n\ndef knn_predict(points, labels, query, k):\n    d = sorted((math.dist(p, query), l) for p, l in zip(points, labels))\n    votes = {}\n    for _, l in d[:k]:\n        votes[l] = votes.get(l, 0) + 1\n    return min(votes, key=lambda l: (-votes[l], l))\n`,
    },
    hints: ['Distance: √((x₁−x₂)² + (y₁−y₂)²).', 'Sort by distance, slice the first k, then count labels.'],
    tests: [
      { call: 'knn_predict([[0, 0], [1, 1], [9, 9]], [0, 0, 1], [0.5, 0.5], 1)', expect: 0 },
      { call: 'knn_predict([[0, 0], [1, 1], [9, 9], [8, 8], [9, 8]], [0, 0, 1, 1, 1], [7, 7], 3)', expect: 1 },
      { call: 'knn_predict([[0, 0], [2, 0], [5, 0]], [1, 0, 1], [1, 0], 2)', expect: 0 },
    ],
    viz: {
      calls: grid(13, 0, 9).flatMap((y) =>
        grid(13, 0, 9).map((x) => `knn_predict(${JSON.stringify(KNN_POINTS)}, ${JSON.stringify(KNN_LABELS)}, [${x}, ${y}], 3)`),
      ),
      render: (vals) => {
        const ops: VoxelOp[] = [];
        const g = grid(13, 0, 9);
        const bounds: [number, number, number, number] = [0, 9, 0, 9];
        const { tx, tz } = scatter([[0, 0]], { bounds });
        g.forEach((y, r) =>
          g.forEach((x, c) => {
            const label = vals[r * 13 + c];
            if (typeof label !== 'number') return;
            const b = CATEGORY_BLOCKS[label % CATEGORY_BLOCKS.length];
            for (let dx = 0; dx < 2; dx++) for (let dz = 0; dz < 2; dz++) ops.push({ x: tx(x) + dx, y: 0, z: tz(y) - dz, b });
          }),
        );
        const pts = scatter(KNN_POINTS, { bounds, labels: KNN_LABELS, y: 1 });
        pts.ops.forEach((o) => { ops.push(o); ops.push({ ...o, y: 2, b: B.WHITE }); });
        return ops;
      },
      caption: 'The floor is coloured by your classifier\'s prediction; white-capped pillars are the training points.',
    },
  },
  {
    id: 'c5-kmeans',
    realm: 'classic',
    title: 'k-Means clustering',
    summary: 'Find groups nobody labelled for you.',
    level: 'advanced',
    xp: 55,
    theory: `**k-Means** is unsupervised: no labels. It repeats two steps:

1. **Assign** each point to its nearest centroid.
2. **Update** each centroid to the mean of the points assigned to it.

If a centroid gets no points, leave it where it is. Run a few iterations and the
centroids settle into the middle of natural groups.`,
    task: 'Write `kmeans_step(points, centroids)` performing ONE assign + update step and returning the new centroids.',
    fn: 'kmeans_step',
    starter: {
      js: `function kmeans_step(points, centroids) {\n  // assign each point to its nearest centroid, then average each group\n}\n`,
      py: `def kmeans_step(points, centroids):\n    # assign each point to its nearest centroid, then average each group\n    pass\n`,
    },
    solution: {
      js: `function kmeans_step(points, centroids) {\n  const sums = centroids.map(() => [0, 0, 0]);\n  for (const p of points) {\n    let best = 0;\n    centroids.forEach((c, i) => {\n      const d = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2;\n      const bd = (p[0] - centroids[best][0]) ** 2 + (p[1] - centroids[best][1]) ** 2;\n      if (d < bd) best = i;\n    });\n    sums[best][0] += p[0]; sums[best][1] += p[1]; sums[best][2] += 1;\n  }\n  return centroids.map((c, i) => (sums[i][2] ? [sums[i][0] / sums[i][2], sums[i][1] / sums[i][2]] : c));\n}\n`,
      py: `def kmeans_step(points, centroids):\n    groups = [[] for _ in centroids]\n    for p in points:\n        d = [(p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 for c in centroids]\n        groups[d.index(min(d))].append(p)\n    return [\n        [sum(p[0] for p in g) / len(g), sum(p[1] for p in g) / len(g)] if g else list(c)\n        for g, c in zip(groups, centroids)\n    ]\n`,
    },
    hints: ['Keep a list of points (or running sums) per centroid.', 'An empty cluster keeps its old centroid.'],
    tests: [
      { call: 'kmeans_step([[0, 0], [0, 2], [10, 10], [10, 12]], [[1, 1], [9, 9]])', expect: [[0, 1], [10, 11]] },
      { call: 'kmeans_step([[1, 1], [3, 3]], [[0, 0], [100, 100]])', expect: [[2, 2], [100, 100]] },
    ],
    viz: {
      calls: [`kmeans_step(${JSON.stringify(KM_POINTS)}, ${JSON.stringify(KM_START)})`],
      render: ([cents]) => {
        if (!Array.isArray(cents)) return [];
        const c = cents as number[][];
        const labels = KM_POINTS.map((p) => {
          let best = 0;
          c.forEach((q, i) => {
            if ((p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 < (p[0] - c[best][0]) ** 2 + (p[1] - c[best][1]) ** 2) best = i;
          });
          return best;
        });
        const bounds: [number, number, number, number] = [0, 10, 0, 10];
        const { ops, tx, tz } = scatter(KM_POINTS, { bounds, labels });
        c.forEach((q, i) => {
          for (let y = 0; y < 5; y++) ops.push({ x: tx(q[0]), y, z: tz(q[1]), b: y === 4 ? B.GOLD : CATEGORY_BLOCKS[i] });
        });
        return ops;
      },
      caption: 'Points coloured by cluster; gold-topped towers mark where your centroids moved.',
    },
  },
  {
    id: 'c6-precision-recall',
    realm: 'classic',
    title: 'Precision & recall',
    summary: 'Why 99% accuracy can be a terrible model.',
    level: 'intermediate',
    xp: 40,
    theory: `If only 1% of patients have a disease, a model that always says "healthy" is
99% accurate — and useless. Better metrics for the positive class (label \`1\`):

- **Precision** = TP / (TP + FP): of the ones we flagged, how many were right?
- **Recall** = TP / (TP + FN): of the real positives, how many did we catch?

Return 0 for a metric whose denominator is 0.`,
    task: 'Write `precision_recall(y_true, y_pred)` returning `[precision, recall]`.',
    fn: 'precision_recall',
    starter: {
      js: `function precision_recall(y_true, y_pred) {\n  let tp = 0, fp = 0, fn = 0;\n  // count them\n  return [0, 0];\n}\n`,
      py: `def precision_recall(y_true, y_pred):\n    tp = fp = fn = 0\n    # count them\n    return [0, 0]\n`,
    },
    solution: {
      js: `function precision_recall(y_true, y_pred) {\n  let tp = 0, fp = 0, fn = 0;\n  y_true.forEach((t, i) => {\n    const p = y_pred[i];\n    if (p === 1 && t === 1) tp++;\n    else if (p === 1 && t === 0) fp++;\n    else if (p === 0 && t === 1) fn++;\n  });\n  return [tp + fp ? tp / (tp + fp) : 0, tp + fn ? tp / (tp + fn) : 0];\n}\n`,
      py: `def precision_recall(y_true, y_pred):\n    tp = sum(1 for t, p in zip(y_true, y_pred) if t == 1 and p == 1)\n    fp = sum(1 for t, p in zip(y_true, y_pred) if t == 0 and p == 1)\n    fn = sum(1 for t, p in zip(y_true, y_pred) if t == 1 and p == 0)\n    return [tp / (tp + fp) if tp + fp else 0, tp / (tp + fn) if tp + fn else 0]\n`,
    },
    hints: ['TP: predicted 1 and truly 1. FP: predicted 1 but truly 0. FN: predicted 0 but truly 1.'],
    tests: [
      { call: 'precision_recall([1, 0, 1, 1], [1, 1, 0, 1])', expect: [2 / 3, 2 / 3] },
      { call: 'precision_recall([0, 0, 0, 1], [0, 0, 0, 0])', expect: [0, 0] },
      { call: 'precision_recall([1, 1, 0, 0], [1, 0, 0, 0])', expect: [1, 0.5] },
    ],
  },
  {
    id: 'c7-gini',
    realm: 'classic',
    title: 'Decision trees: Gini impurity',
    summary: 'How trees decide where to split.',
    level: 'advanced',
    xp: 45,
    theory: `A decision tree splits data to make each branch as **pure** as possible.
**Gini impurity** measures how mixed a set of labels is:

\`gini = 1 - Σ pₖ²\` where \`pₖ\` is the fraction of labels equal to class k.

All one class → 0 (pure). A 50/50 split of two classes → 0.5.
Random forests and gradient-boosted trees (XGBoost, LightGBM) are built on this idea.`,
    task: 'Write `gini(labels)` for a non-empty list of labels.',
    fn: 'gini',
    starter: {
      js: `function gini(labels) {\n  const counts = {};\n  // count each label, then 1 - sum(p^2)\n}\n`,
      py: `def gini(labels):\n    counts = {}\n    # count each label, then 1 - sum(p**2)\n    pass\n`,
    },
    solution: {
      js: `function gini(labels) {\n  const counts = {};\n  for (const l of labels) counts[l] = (counts[l] || 0) + 1;\n  return 1 - Object.values(counts).reduce((s, c) => s + (c / labels.length) ** 2, 0);\n}\n`,
      py: `def gini(labels):\n    counts = {}\n    for l in labels:\n        counts[l] = counts.get(l, 0) + 1\n    return 1 - sum((c / len(labels)) ** 2 for c in counts.values())\n`,
    },
    hints: ['Count occurrences with a dictionary / object.'],
    tests: [
      { call: 'gini([1, 1, 1])', expect: 0 },
      { call: 'gini([0, 1, 0, 1])', expect: 0.5 },
      { call: 'gini([0, 1, 2])', expect: 2 / 3 },
      { call: 'gini(["cat", "cat", "dog", "cat"])', expect: 0.375 },
    ],
  },
];
