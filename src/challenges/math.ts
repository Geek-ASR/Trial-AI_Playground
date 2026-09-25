/** Generated maths questions that come up again and again in ML. Each has a numeric answer. */

export interface MathQuestion {
  kind: string;
  prompt: string;
  answer: number;
  /** Accepted absolute error. */
  tol: number;
  explain: string;
  reward: number;
}

type Rand = () => number;
const int = (r: Rand, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
const pick = <T>(r: Rand, xs: T[]) => xs[Math.floor(r() * xs.length)];
const vec = (r: Rand, n: number, lo = -4, hi = 5) => Array.from({ length: n }, () => int(r, lo, hi));
const fmtVec = (v: number[]) => `[${v.join(', ')}]`;

const GENERATORS: ((r: Rand) => MathQuestion)[] = [
  (r) => {
    const a = vec(r, 3), b = vec(r, 3);
    const ans = a.reduce((s, x, i) => s + x * b[i], 0);
    return { kind: 'Dot product', prompt: `a = ${fmtVec(a)}, b = ${fmtVec(b)}. What is a · b?`, answer: ans, tol: 0, reward: 6,
      explain: `Multiply matching entries and add: ${a.map((x, i) => `${x}×${b[i]}`).join(' + ')} = ${ans}. A neuron computes exactly this before its activation.` };
  },
  (r) => {
    const xs = vec(r, 5, 1, 20);
    const m = xs.reduce((s, x) => s + x, 0) / xs.length;
    return { kind: 'Mean', prompt: `What is the mean of ${fmtVec(xs)}?`, answer: m, tol: 0.01, reward: 5,
      explain: `Sum ${xs.reduce((s, x) => s + x, 0)} ÷ ${xs.length} = ${+m.toFixed(2)}.` };
  },
  (r) => {
    const xs = vec(r, 5, 1, 30).sort((p, q) => p - q);
    const shuffled = [...xs].sort(() => r() - 0.5);
    return { kind: 'Median', prompt: `What is the median of ${fmtVec(shuffled)}?`, answer: xs[2], tol: 0, reward: 5,
      explain: `Sort: ${fmtVec(xs)}. The middle value is ${xs[2]}.` };
  },
  (r) => {
    const n = int(r, 2, 5), x = int(r, 1, 4);
    const ans = n * x ** (n - 1);
    return { kind: 'Derivative', prompt: `f(x) = x^${n}. What is the slope f′(x) at x = ${x}?`, answer: ans, tol: 0, reward: 7,
      explain: `Power rule: f′(x) = ${n}·x^${n - 1}, so f′(${x}) = ${n}·${x}^${n - 1} = ${ans}. Gradient descent runs on derivatives like this.` };
  },
  (r) => {
    const w = int(r, -3, 3) || 2, x = int(r, -3, 3), b = int(r, -4, 4);
    const z = w * x + b;
    return { kind: 'ReLU neuron', prompt: `A neuron has weight w = ${w} and bias b = ${b}. For input x = ${x}, what is ReLU(w·x + b)?`, answer: Math.max(0, z), tol: 0, reward: 6,
      explain: `w·x + b = ${w}×${x} + ${b} = ${z}; ReLU keeps positives and zeroes negatives → ${Math.max(0, z)}.` };
  },
  (r) => {
    const w = +(int(r, 2, 8) / 10).toFixed(1), g = int(r, -6, 6) || 3, lr = pick(r, [0.1, 0.5, 0.01]);
    const ans = +(w - lr * g).toFixed(4);
    return { kind: 'Gradient step', prompt: `Weight w = ${w}, gradient ∂L/∂w = ${g}, learning rate η = ${lr}. What is w after one gradient-descent step?`, answer: ans, tol: 1e-6, reward: 7,
      explain: `w ← w − η·gradient = ${w} − ${lr}×${g} = ${ans}.` };
  },
  (r) => {
    const a = vec(r, 4, -5, 5), b = vec(r, 4, -5, 5);
    const ans = a.reduce((s, x, i) => s + (x - b[i]) ** 2, 0) / a.length;
    return { kind: 'Mean squared error', prompt: `Predictions ${fmtVec(a)}, targets ${fmtVec(b)}. What is the mean squared error?`, answer: ans, tol: 0.01, reward: 8,
      explain: `Squared errors: ${a.map((x, i) => (x - b[i]) ** 2).join(', ')}; their mean is ${+ans.toFixed(2)}.` };
  },
  (r) => {
    const k = int(r, 1, 6);
    return { kind: 'Logarithms', prompt: `What is log₂(${2 ** k})?`, answer: k, tol: 0, reward: 4,
      explain: `2^${k} = ${2 ** k}, so log₂(${2 ** k}) = ${k}. Information is measured in bits — log₂ of the number of outcomes.` };
  },
  (r) => {
    const n = int(r, 2, 4);
    return { kind: 'Probability', prompt: `A fair coin is flipped ${n} times. What is the probability that every flip is heads?`, answer: 1 / 2 ** n, tol: 0.001, reward: 6,
      explain: `Independent events multiply: (1/2)^${n} = 1/${2 ** n} = ${1 / 2 ** n}.` };
  },
  (r) => {
    const tp = int(r, 5, 20), fp = int(r, 1, 10);
    const p = tp / (tp + fp);
    return { kind: 'Precision', prompt: `A model flags ${tp + fp} items as positive; ${tp} are correct. What is its precision? (0–1)`, answer: p, tol: 0.01, reward: 6,
      explain: `Precision = TP / (TP + FP) = ${tp} / ${tp + fp} ≈ ${p.toFixed(3)}.` };
  },
  (r) => {
    const m = [[int(r, -2, 3), int(r, -2, 3)], [int(r, -2, 3), int(r, -2, 3)]], v = vec(r, 2, -3, 3), row = int(r, 0, 1);
    const ans = m[row][0] * v[0] + m[row][1] * v[1];
    return { kind: 'Matrix × vector', prompt: `W = [[${m[0].join(', ')}], [${m[1].join(', ')}]], x = ${fmtVec(v)}. What is entry ${row + 1} of W·x?`, answer: ans, tol: 0, reward: 7,
      explain: `Row ${row + 1} of W dotted with x: ${m[row][0]}×${v[0]} + ${m[row][1]}×${v[1]} = ${ans}. A dense layer is exactly this.` };
  },
  (r) => {
    const k = int(r, 1, 4);
    const ans = k / (k + 1);
    return { kind: 'Sigmoid', prompt: `What is sigmoid(ln ${k}) = 1 / (1 + e^(−ln ${k}))? (0–1)`, answer: ans, tol: 0.005, reward: 7,
      explain: `e^(−ln ${k}) = 1/${k}, so sigmoid = 1 / (1 + 1/${k}) = ${k}/${k + 1} ≈ ${ans.toFixed(3)}. With k = 1 you get 0.5 — an undecided neuron.` };
  },
  (r) => {
    const lo = int(r, 0, 10), hi = lo + int(r, 10, 40), x = int(r, lo, hi);
    const ans = (x - lo) / (hi - lo);
    return { kind: 'Min-max scaling', prompt: `A feature ranges from ${lo} to ${hi}. What is ${x} after min-max scaling to [0, 1]?`, answer: ans, tol: 0.01, reward: 6,
      explain: `(x − min) / (max − min) = (${x} − ${lo}) / ${hi - lo} ≈ ${ans.toFixed(3)}.` };
  },
];

export function mathQuestion(r: Rand = Math.random): MathQuestion {
  return GENERATORS[Math.floor(r() * GENERATORS.length)](r);
}

export const MATH_KINDS = GENERATORS.length;

/** Generate the i-th kind deterministically (for tests). */
export function mathQuestionOfKind(i: number, r: Rand): MathQuestion {
  return GENERATORS[i % GENERATORS.length](r);
}

/** Accept "0.5", "1/2", "50%" and the like. */
export function parseAnswer(s: string): number {
  const t = s.trim().replace(/,/g, '').replace(/\s+/g, '');
  if (!t) return NaN;
  if (/^-?\d*\.?\d+%$/.test(t)) return Number(t.slice(0, -1)) / 100;
  const frac = /^(-?\d*\.?\d+)\/(-?\d*\.?\d+)$/.exec(t);
  if (frac) return Number(frac[1]) / Number(frac[2]);
  return /^[-+]?\d*\.?\d+(e[-+]?\d+)?$/i.test(t) ? Number(t) : NaN;
}

export function isCorrect(q: MathQuestion, input: string): boolean {
  const v = parseAnswer(input);
  return Number.isFinite(v) && Math.abs(v - q.answer) <= q.tol + 1e-9;
}
