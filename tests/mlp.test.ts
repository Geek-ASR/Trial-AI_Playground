import { describe, expect, it } from 'vitest';
import { makeDataset, featurize, split } from '../src/ml/datasets';
import { MLP, bce } from '../src/ml/mlp';

describe('MLP', () => {
  it('matches numerical gradients', () => {
    const net = new MLP(2, [3], 'tanh', 5);
    const X = [[0.3, -0.7], [-0.2, 0.9]];
    const Y = [1, 0];
    // Analytical step with tiny lr: Δw ≈ −lr·∂L/∂w.
    const w = net.layers[0].W[1][0];
    const eps = 1e-5;
    net.layers[0].W[1][0] = w + eps;
    const lp = net.loss(X, Y);
    net.layers[0].W[1][0] = w - eps;
    const lm = net.loss(X, Y);
    net.layers[0].W[1][0] = w;
    const numeric = (lp - lm) / (2 * eps);
    const lr = 1e-3;
    net.trainBatch(X, Y, lr);
    const analytic = (w - net.layers[0].W[1][0]) / lr;
    expect(analytic).toBeCloseTo(numeric, 4);
  });

  it('learns XOR with one hidden layer', () => {
    const data = makeDataset('xor', 200, 0.05);
    const { train, test } = split(data);
    const feats = ['x', 'y'] as const;
    const net = new MLP(2, [8], 'tanh', 2);
    const X = train.map((p) => featurize(p.x, p.y, [...feats]));
    const Y = train.map((p) => p.label);
    for (let epoch = 0; epoch < 300; epoch++) {
      for (let i = 0; i < X.length; i += 10) net.trainBatch(X.slice(i, i + 10), Y.slice(i, i + 10), 0.3);
    }
    const acc = net.accuracy(test.map((p) => featurize(p.x, p.y, [...feats])), test.map((p) => p.label));
    expect(acc).toBeGreaterThan(0.9);
  });

  it('bce is finite at the extremes', () => {
    expect(Number.isFinite(bce(0, 1))).toBe(true);
    expect(bce(1, 1)).toBeLessThan(1e-6);
  });

  it('datasets are balanced and bounded', () => {
    for (const id of ['circle', 'xor', 'blobs', 'moons', 'spiral'] as const) {
      const d = makeDataset(id, 200, 0.1);
      const ones = d.filter((p) => p.label === 1).length;
      expect(ones).toBeGreaterThan(60);
      expect(ones).toBeLessThan(140);
      for (const p of d) expect(Math.abs(p.x) + Math.abs(p.y)).toBeLessThan(4);
    }
  });
});
