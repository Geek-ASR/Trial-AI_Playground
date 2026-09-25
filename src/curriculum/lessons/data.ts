import { B } from '../../world/blocks';
import { bars, scatter } from '../viz';
import type { Lesson } from '../types';

/** A fixed, lumpy sample so histograms look interesting. */
export const HEIGHTS = [
  152, 158, 160, 161, 163, 164, 165, 165, 166, 167, 168, 168, 169, 170, 170, 171, 171, 172, 172, 173,
  173, 174, 175, 175, 176, 177, 178, 179, 180, 181, 182, 184, 186, 188, 191, 195,
];

const STUDY_HOURS = [1, 2, 2, 3, 4, 4, 5, 6, 6, 7, 8, 9];
const EXAM_SCORES = [52, 55, 61, 60, 68, 65, 72, 75, 80, 79, 86, 91];

export const data: Lesson[] = [
  {
    id: 'd1-mean',
    realm: 'data',
    title: 'The mean',
    summary: 'The simplest summary of a dataset.',
    level: 'beginner',
    xp: 20,
    theory: `The **mean** (average) is the sum of the values divided by how many there are.
It's the first thing you compute on any new dataset — and the building block of variance,
normalisation and loss functions.`,
    task: 'Write `mean(xs)` returning the arithmetic mean of a non-empty list.',
    fn: 'mean',
    starter: {
      js: `function mean(xs) {\n  // sum divided by count\n}\n`,
      py: `def mean(xs):\n    # sum divided by count\n    pass\n`,
    },
    solution: {
      js: `function mean(xs) {\n  return xs.reduce((a, b) => a + b, 0) / xs.length;\n}\n`,
      py: `def mean(xs):\n    return sum(xs) / len(xs)\n`,
    },
    hints: ['JS: `xs.reduce((a, b) => a + b, 0)` sums a list.', 'Python: `sum(xs) / len(xs)`.'],
    tests: [
      { call: 'mean([1, 2, 3, 4])', expect: 2.5 },
      { call: 'mean([10])', expect: 10 },
      { call: 'mean([-5, 5, 3])', expect: 1 },
    ],
  },
  {
    id: 'd2-variance',
    realm: 'data',
    title: 'Spread: variance & std',
    summary: 'How far do values wander from the mean?',
    level: 'beginner',
    xp: 25,
    theory: `**Variance** is the mean of the squared distances from the mean:

\`var = mean((x - mean(xs))²)\`

The **standard deviation** is its square root, in the same units as the data.
(This is the *population* variance — divide by \`n\`, not \`n − 1\`.)`,
    task: 'Write `std(xs)` returning the population standard deviation.',
    fn: 'std',
    starter: {
      js: `function std(xs) {\n  const m = xs.reduce((a, b) => a + b, 0) / xs.length;\n  // mean of squared differences, then square root\n}\n`,
      py: `import math\n\ndef std(xs):\n    m = sum(xs) / len(xs)\n    # mean of squared differences, then square root\n    pass\n`,
    },
    solution: {
      js: `function std(xs) {\n  const m = xs.reduce((a, b) => a + b, 0) / xs.length;\n  const v = xs.reduce((a, x) => a + (x - m) ** 2, 0) / xs.length;\n  return Math.sqrt(v);\n}\n`,
      py: `import math\n\ndef std(xs):\n    m = sum(xs) / len(xs)\n    v = sum((x - m) ** 2 for x in xs) / len(xs)\n    return math.sqrt(v)\n`,
    },
    hints: ['First compute the mean.', 'Square each difference, average them, then take the square root.'],
    tests: [
      { call: 'std([2, 4, 4, 4, 5, 5, 7, 9])', expect: 2 },
      { call: 'std([5, 5, 5])', expect: 0 },
      { call: 'std([1, 3])', expect: 1 },
    ],
  },
  {
    id: 'd3-median',
    realm: 'data',
    title: 'The median',
    summary: 'A summary that outliers can\'t bully.',
    level: 'beginner',
    xp: 25,
    theory: `The **median** is the middle value once the data is sorted. With an even count,
it's the mean of the two middle values.

One billionaire walking into a café wrecks the *mean* income but barely moves the *median*.
That's why robust statistics matter when data is messy.`,
    task: 'Write `median(xs)`. Don\'t modify the input list.',
    fn: 'median',
    starter: {
      js: `function median(xs) {\n  const s = [...xs].sort((a, b) => a - b);\n  // pick the middle (or average the two middles)\n}\n`,
      py: `def median(xs):\n    s = sorted(xs)\n    # pick the middle (or average the two middles)\n    pass\n`,
    },
    solution: {
      js: `function median(xs) {\n  const s = [...xs].sort((a, b) => a - b);\n  const mid = Math.floor(s.length / 2);\n  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;\n}\n`,
      py: `def median(xs):\n    s = sorted(xs)\n    mid = len(s) // 2\n    return s[mid] if len(s) % 2 else (s[mid - 1] + s[mid]) / 2\n`,
    },
    hints: ['JS gotcha: `.sort()` without a comparator sorts numbers as strings!', 'Use `length % 2` to test for odd length.'],
    tests: [
      { call: 'median([3, 1, 2])', expect: 2 },
      { call: 'median([4, 1, 3, 2])', expect: 2.5 },
      { call: 'median([10, 2, 1000000])', expect: 10 },
      { call: 'median([7])', expect: 7 },
    ],
  },
  {
    id: 'd4-normalize',
    realm: 'data',
    title: 'Min-max scaling',
    summary: 'Put every feature on the same 0-to-1 scale.',
    level: 'beginner',
    xp: 30,
    theory: `Features with big numbers (salary in rupees) drown out features with small ones
(years of experience). **Min-max scaling** maps each value into \`[0, 1]\`:

\`x' = (x - min) / (max - min)\`

If every value is the same, return all zeros (there's nothing to scale).`,
    task: 'Write `normalize(xs)` returning the min-max scaled list.',
    fn: 'normalize',
    starter: {
      js: `function normalize(xs) {\n  const lo = Math.min(...xs);\n  const hi = Math.max(...xs);\n  // map each x to (x - lo) / (hi - lo)\n}\n`,
      py: `def normalize(xs):\n    lo, hi = min(xs), max(xs)\n    # map each x to (x - lo) / (hi - lo)\n    pass\n`,
    },
    solution: {
      js: `function normalize(xs) {\n  const lo = Math.min(...xs);\n  const hi = Math.max(...xs);\n  if (hi === lo) return xs.map(() => 0);\n  return xs.map((x) => (x - lo) / (hi - lo));\n}\n`,
      py: `def normalize(xs):\n    lo, hi = min(xs), max(xs)\n    if hi == lo:\n        return [0 for _ in xs]\n    return [(x - lo) / (hi - lo) for x in xs]\n`,
    },
    hints: ['Handle the case max == min separately to avoid dividing by zero.'],
    tests: [
      { call: 'normalize([10, 20, 30])', expect: [0, 0.5, 1] },
      { call: 'normalize([5, 5])', expect: [0, 0] },
      { call: 'normalize([-1, 0, 3])', expect: [0, 0.25, 1] },
    ],
    viz: {
      calls: ['normalize([12, 45, 7, 33, 90, 61, 28, 3, 77, 50])'],
      render: ([v]) => bars(v),
      caption: 'Scaled values: the smallest becomes a 1-block stub, the largest reaches the top.',
    },
  },
  {
    id: 'd5-histogram',
    realm: 'data',
    title: 'Histograms',
    summary: 'See the shape of your data — in blocks.',
    level: 'intermediate',
    xp: 35,
    theory: `A **histogram** splits the range \`[min, max]\` into \`bins\` equal-width buckets and
counts how many values land in each. It reveals skew, outliers and multiple peaks that a
mean alone would hide.

Bucket index for a value: \`floor((x - min) / width)\`, where \`width = (max - min) / bins\`.
The maximum value belongs in the **last** bin.`,
    task: 'Write `histogram(xs, bins)` returning a list of `bins` counts.',
    fn: 'histogram',
    starter: {
      js: `function histogram(xs, bins) {\n  const counts = new Array(bins).fill(0);\n  // find the bucket for each x and increment it\n  return counts;\n}\n`,
      py: `def histogram(xs, bins):\n    counts = [0] * bins\n    # find the bucket for each x and increment it\n    return counts\n`,
    },
    solution: {
      js: `function histogram(xs, bins) {\n  const counts = new Array(bins).fill(0);\n  const lo = Math.min(...xs), hi = Math.max(...xs);\n  const width = (hi - lo) / bins || 1;\n  for (const x of xs) counts[Math.min(bins - 1, Math.floor((x - lo) / width))]++;\n  return counts;\n}\n`,
      py: `def histogram(xs, bins):\n    counts = [0] * bins\n    lo, hi = min(xs), max(xs)\n    width = (hi - lo) / bins or 1\n    for x in xs:\n        counts[min(bins - 1, int((x - lo) // width))] += 1\n    return counts\n`,
    },
    hints: ['Clamp the bucket index with `min(bins - 1, …)` so the max value lands in the last bin.'],
    tests: [
      { call: 'histogram([0, 1, 2, 3], 2)', expect: [2, 2] },
      { call: 'histogram([1, 1, 1, 10], 3)', expect: [3, 0, 1] },
      { call: 'histogram([0, 10], 5)', expect: [1, 0, 0, 0, 1] },
    ],
    viz: {
      calls: [`histogram(${JSON.stringify(HEIGHTS)}, 9)`],
      render: ([v]) => bars(v),
      caption: 'Heights of 36 people in 9 bins — a rough bell curve rises from the pad.',
    },
  },
  {
    id: 'd6-correlation',
    realm: 'data',
    title: 'Correlation',
    summary: 'Do two variables move together?',
    level: 'intermediate',
    xp: 40,
    theory: `**Pearson correlation** measures how linearly two variables move together, from
−1 (perfectly opposite) through 0 (unrelated) to +1 (perfectly together):

\`r = Σ(x - x̄)(y - ȳ) / sqrt(Σ(x - x̄)² · Σ(y - ȳ)²)\`

Remember: correlation is not causation — but it is a great first look.`,
    task: 'Write `correlation(xs, ys)` returning Pearson\'s r.',
    fn: 'correlation',
    starter: {
      js: `function correlation(xs, ys) {\n  const n = xs.length;\n  const mx = xs.reduce((a, b) => a + b, 0) / n;\n  const my = ys.reduce((a, b) => a + b, 0) / n;\n  // covariance over the product of spreads\n}\n`,
      py: `import math\n\ndef correlation(xs, ys):\n    n = len(xs)\n    mx, my = sum(xs) / n, sum(ys) / n\n    # covariance over the product of spreads\n    pass\n`,
    },
    solution: {
      js: `function correlation(xs, ys) {\n  const n = xs.length;\n  const mx = xs.reduce((a, b) => a + b, 0) / n;\n  const my = ys.reduce((a, b) => a + b, 0) / n;\n  let sxy = 0, sxx = 0, syy = 0;\n  for (let i = 0; i < n; i++) {\n    const dx = xs[i] - mx, dy = ys[i] - my;\n    sxy += dx * dy; sxx += dx * dx; syy += dy * dy;\n  }\n  return sxy / Math.sqrt(sxx * syy);\n}\n`,
      py: `import math\n\ndef correlation(xs, ys):\n    n = len(xs)\n    mx, my = sum(xs) / n, sum(ys) / n\n    sxy = sum((x - mx) * (y - my) for x, y in zip(xs, ys))\n    sxx = sum((x - mx) ** 2 for x in xs)\n    syy = sum((y - my) ** 2 for y in ys)\n    return sxy / math.sqrt(sxx * syy)\n`,
    },
    hints: ['Accumulate three sums: Σdx·dy, Σdx² and Σdy².'],
    tests: [
      { call: 'correlation([1, 2, 3], [2, 4, 6])', expect: 1 },
      { call: 'correlation([1, 2, 3], [3, 2, 1])', expect: -1 },
      { call: 'correlation([1, 2, 3, 4], [1, 3, 2, 4])', expect: 0.8 },
    ],
    viz: {
      calls: [`correlation(${JSON.stringify(STUDY_HOURS)}, ${JSON.stringify(EXAM_SCORES)})`],
      render: ([r]) => {
        const pts = STUDY_HOURS.map((h, i) => [h, EXAM_SCORES[i]]);
        const { ops } = scatter(pts);
        const strength = typeof r === 'number' ? Math.round(Math.abs(r) * 10) : 0;
        for (let y = 0; y < strength; y++) ops.push({ x: -11, y, z: -11, b: B.GOLD });
        return ops;
      },
      caption: 'Study hours vs exam score. The gold pillar in the corner is |r| × 10 blocks tall.',
    },
  },
];
