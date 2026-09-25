import { gaussian, mulberry32 } from './rng';

export type Activation = 'tanh' | 'relu' | 'sigmoid' | 'linear';

interface Layer {
  /** W[j][i]: weight from input i to neuron j. */
  W: number[][];
  b: number[];
}

const act: Record<Activation, (z: number) => number> = {
  tanh: Math.tanh,
  relu: (z) => (z > 0 ? z : 0),
  sigmoid: (z) => 1 / (1 + Math.exp(-z)),
  linear: (z) => z,
};

/** Derivative expressed in terms of the activation's output a. */
const dact: Record<Activation, (a: number) => number> = {
  tanh: (a) => 1 - a * a,
  relu: (a) => (a > 0 ? 1 : 0),
  sigmoid: (a) => a * (1 - a),
  linear: () => 1,
};

const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));

/**
 * A small multilayer perceptron for binary classification: hidden layers with a
 * chosen activation and a single sigmoid output trained with binary cross-entropy.
 */
export class MLP {
  layers: Layer[] = [];
  readonly sizes: number[];
  activation: Activation;

  constructor(inputs: number, hidden: number[], activation: Activation = 'tanh', seed = 1) {
    this.sizes = [inputs, ...hidden, 1];
    this.activation = activation;
    const r = mulberry32(seed);
    for (let l = 1; l < this.sizes.length; l++) {
      const nIn = this.sizes[l - 1], nOut = this.sizes[l];
      const scale = activation === 'relu' ? Math.sqrt(2 / nIn) : Math.sqrt(1 / nIn);
      this.layers.push({
        W: Array.from({ length: nOut }, () => Array.from({ length: nIn }, () => gaussian(r) * scale)),
        b: Array.from({ length: nOut }, () => (activation === 'relu' ? 0.01 : 0)),
      });
    }
  }

  /** Returns the activations of every layer, input first, output (probability) last. */
  forward(x: number[]): number[][] {
    const acts: number[][] = [x];
    let a = x;
    this.layers.forEach((layer, li) => {
      const last = li === this.layers.length - 1;
      const f = last ? sigmoid : act[this.activation];
      a = layer.W.map((row, j) => {
        let z = layer.b[j];
        for (let i = 0; i < row.length; i++) z += row[i] * a[i];
        return f(z);
      });
      acts.push(a);
    });
    return acts;
  }

  predict(x: number[]): number {
    const acts = this.forward(x);
    return acts[acts.length - 1][0];
  }

  /** One step of mini-batch gradient descent. Returns the mean BCE loss before the update. */
  trainBatch(X: number[][], Y: number[], lr: number, l2 = 0): number {
    const gW = this.layers.map((l) => l.W.map((row) => row.map(() => 0)));
    const gB = this.layers.map((l) => l.b.map(() => 0));
    let loss = 0;

    for (let n = 0; n < X.length; n++) {
      const acts = this.forward(X[n]);
      const p = acts[acts.length - 1][0];
      const y = Y[n];
      loss += bce(p, y);

      // Output delta for sigmoid + BCE simplifies to (p − y).
      let delta = [p - y];
      for (let l = this.layers.length - 1; l >= 0; l--) {
        const aIn = acts[l];
        const layer = this.layers[l];
        for (let j = 0; j < layer.W.length; j++) {
          gB[l][j] += delta[j];
          for (let i = 0; i < aIn.length; i++) gW[l][j][i] += delta[j] * aIn[i];
        }
        if (l > 0) {
          const next = new Array(aIn.length).fill(0);
          for (let i = 0; i < aIn.length; i++) {
            let s = 0;
            for (let j = 0; j < layer.W.length; j++) s += layer.W[j][i] * delta[j];
            next[i] = s * dact[this.activation](aIn[i]);
          }
          delta = next;
        }
      }
    }

    const m = X.length;
    this.layers.forEach((layer, l) => {
      layer.W.forEach((row, j) =>
        row.forEach((w, i) => {
          row[i] = w - lr * (gW[l][j][i] / m + l2 * w);
        }),
      );
      layer.b.forEach((b, j) => {
        layer.b[j] = b - lr * (gB[l][j] / m);
      });
    });
    return loss / m;
  }

  loss(X: number[][], Y: number[]): number {
    if (!X.length) return 0;
    return X.reduce((s, x, i) => s + bce(this.predict(x), Y[i]), 0) / X.length;
  }

  accuracy(X: number[][], Y: number[]): number {
    if (!X.length) return 0;
    return X.reduce((s, x, i) => s + ((this.predict(x) >= 0.5 ? 1 : 0) === Y[i] ? 1 : 0), 0) / X.length;
  }
}

export function bce(p: number, y: number): number {
  const e = 1e-7;
  const q = Math.min(1 - e, Math.max(e, p));
  return -(y * Math.log(q) + (1 - y) * Math.log(1 - q));
}
