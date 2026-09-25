/**
 * Train the Neural Cathedral's digit recogniser on MNIST.
 *
 *   npm i --no-save mnist-data
 *   node --experimental-strip-types scripts/train-digits.ts
 *
 * Writes src/sims/data/digits-model.json (weights) and digits-samples.json
 * (a few preprocessed test digits for the "show me an example" button and tests).
 * MNIST: Y. LeCun, C. Cortes, C. J. C. Burges — http://yann.lecun.com/exdb/mnist/
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { DIGIT_SIZE, encodeSample, forward, preprocess, type DigitModel } from '../src/ai/digits.ts';

const require = createRequire(import.meta.url);
let dataDir: string;
try {
  dataDir = join(dirname(require.resolve('mnist-data/package.json')), 'data');
} catch {
  dataDir = process.env.MNIST_DIR ?? '';
  if (!dataDir) throw new Error('Install the dataset first: npm i --no-save mnist-data (or set MNIST_DIR)');
}

function readImages(file: string): { n: number; data: Uint8Array } {
  const buf = readFileSync(join(dataDir, file));
  const n = buf.readUInt32BE(4);
  return { n, data: new Uint8Array(buf.buffer, buf.byteOffset + 16, n * 784) };
}
function readLabels(file: string): Uint8Array {
  const buf = readFileSync(join(dataDir, file));
  return new Uint8Array(buf.buffer, buf.byteOffset + 8, buf.readUInt32BE(4));
}

// Seeded RNG so training is reproducible.
let seed = 1234567;
const rnd = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296);
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());

/** Rotate / thicken a 28×28 image a little so the network copes with mouse drawings. */
function augment(img: Float32Array): Float32Array {
  const out = new Float32Array(784);
  const a = (rnd() - 0.5) * 0.4; // ±11°
  const sx = 1 + (rnd() - 0.5) * 0.25; // stretch
  const cos = Math.cos(a), sin = Math.sin(a);
  for (let y = 0; y < 28; y++)
    for (let x = 0; x < 28; x++) {
      const u = ((x - 13.5) * cos + (y - 13.5) * sin) / sx + 13.5;
      const v = (-(x - 13.5) * sin + (y - 13.5) * cos) + 13.5;
      const i = Math.round(u), j = Math.round(v);
      out[y * 28 + x] = i >= 0 && j >= 0 && i < 28 && j < 28 ? img[j * 28 + i] : 0;
    }
  if (rnd() < 0.35) {
    // Dilate: thicker strokes, like a chunky brush.
    const d = new Float32Array(784);
    for (let y = 0; y < 28; y++)
      for (let x = 0; x < 28; x++) {
        let m = out[y * 28 + x];
        if (x > 0) m = Math.max(m, out[y * 28 + x - 1]);
        if (y > 0) m = Math.max(m, out[(y - 1) * 28 + x]);
        d[y * 28 + x] = m;
      }
    return d;
  }
  return out;
}

function toFloat(data: Uint8Array, i: number): Float32Array {
  const img = new Float32Array(784);
  for (let k = 0; k < 784; k++) img[k] = data[i * 784 + k] / 255;
  return img;
}

const train = readImages('train-images-idx3-ubyte');
const trainY = readLabels('train-labels-idx1-ubyte');
const test = readImages('t10k-images-idx3-ubyte');
const testY = readLabels('t10k-labels-idx1-ubyte');
console.log(`MNIST: ${train.n} train, ${test.n} test`);

const ARCH = [DIGIT_SIZE * DIGIT_SIZE, 32, 16, 10];
const L = ARCH.length - 1;
const W = ARCH.slice(1).map((n, l) => {
  const w = new Float32Array(n * ARCH[l]);
  const s = Math.sqrt(2 / ARCH[l]);
  for (let i = 0; i < w.length; i++) w[i] = gauss() * s;
  return w;
});
const Bs = ARCH.slice(1).map((n) => new Float32Array(n));
const mW = W.map((w) => new Float32Array(w.length)), vW = W.map((w) => new Float32Array(w.length));
const mB = Bs.map((b) => new Float32Array(b.length)), vB = Bs.map((b) => new Float32Array(b.length));
const gW = W.map((w) => new Float32Array(w.length)), gB = Bs.map((b) => new Float32Array(b.length));

const testX = Array.from({ length: test.n }, (_, i) => preprocess(toFloat(test.data, i), 28, 28));
const model = (): DigitModel => ({
  arch: ARCH,
  weights: W.map((w) => Array.from(w, (v) => Math.round(v * 1e4) / 1e4)),
  biases: Bs.map((b) => Array.from(b, (v) => Math.round(v * 1e4) / 1e4)),
  testAccuracy: 0,
  trainedOn: 'MNIST (60,000 handwritten digits), downsampled to 16×16',
});
const evaluate = (m: DigitModel) => {
  let ok = 0;
  for (let i = 0; i < test.n; i++) if (forward(m, testX[i]).prediction === testY[i]) ok++;
  return ok / test.n;
};

const EPOCHS = 10, BATCH = 32;
let step = 0;
const order = Array.from({ length: train.n }, (_, i) => i);
for (let epoch = 0; epoch < EPOCHS; epoch++) {
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const lr = 0.002 * Math.pow(0.7, epoch);
  let loss = 0;
  for (let start = 0; start < order.length; start += BATCH) {
    for (const g of gW) g.fill(0);
    for (const g of gB) g.fill(0);
    const bs = Math.min(BATCH, order.length - start);
    for (let k = 0; k < bs; k++) {
      const idx = order[start + k];
      const x = preprocess(augment(toFloat(train.data, idx)), 28, 28);
      // Forward.
      const acts: Float32Array[] = [x];
      for (let l = 0; l < L; l++) {
        const nIn = ARCH[l], nOut = ARCH[l + 1], a = acts[l];
        const z = new Float32Array(nOut);
        for (let j = 0; j < nOut; j++) {
          let s = Bs[l][j];
          const row = j * nIn;
          for (let i = 0; i < nIn; i++) s += W[l][row + i] * a[i];
          z[j] = l < L - 1 ? Math.max(0, s) : s;
        }
        if (l === L - 1) {
          let m = -Infinity;
          for (const v of z) m = Math.max(m, v);
          let sum = 0;
          for (let j = 0; j < nOut; j++) { z[j] = Math.exp(z[j] - m); sum += z[j]; }
          for (let j = 0; j < nOut; j++) z[j] /= sum;
        }
        acts.push(z);
      }
      const y = trainY[idx];
      loss -= Math.log(acts[L][y] + 1e-9);
      // Backward: softmax + cross-entropy gradient is (p − onehot).
      let delta = Float32Array.from(acts[L]);
      delta[y] -= 1;
      for (let l = L - 1; l >= 0; l--) {
        const nIn = ARCH[l], nOut = ARCH[l + 1], a = acts[l];
        for (let j = 0; j < nOut; j++) {
          const d = delta[j];
          if (d === 0) continue;
          gB[l][j] += d;
          const row = j * nIn;
          for (let i = 0; i < nIn; i++) gW[l][row + i] += d * a[i];
        }
        if (l > 0) {
          const next = new Float32Array(nIn);
          for (let i = 0; i < nIn; i++) {
            if (a[i] <= 0) continue;
            let s = 0;
            for (let j = 0; j < nOut; j++) s += W[l][j * nIn + i] * delta[j];
            next[i] = s;
          }
          delta = next;
        }
      }
    }
    // Adam.
    step++;
    const b1 = 0.9, b2 = 0.999, eps = 1e-8;
    const c1 = 1 - b1 ** step, c2 = 1 - b2 ** step;
    for (let l = 0; l < L; l++) {
      for (let i = 0; i < W[l].length; i++) {
        const g = gW[l][i] / bs + 1e-5 * W[l][i];
        mW[l][i] = b1 * mW[l][i] + (1 - b1) * g;
        vW[l][i] = b2 * vW[l][i] + (1 - b2) * g * g;
        W[l][i] -= (lr * (mW[l][i] / c1)) / (Math.sqrt(vW[l][i] / c2) + eps);
      }
      for (let i = 0; i < Bs[l].length; i++) {
        const g = gB[l][i] / bs;
        mB[l][i] = b1 * mB[l][i] + (1 - b1) * g;
        vB[l][i] = b2 * vB[l][i] + (1 - b2) * g * g;
        Bs[l][i] -= (lr * (mB[l][i] / c1)) / (Math.sqrt(vB[l][i] / c2) + eps);
      }
    }
  }
  const acc = evaluate(model());
  console.log(`epoch ${epoch + 1}/${EPOCHS}  loss ${(loss / order.length).toFixed(4)}  test accuracy ${(acc * 100).toFixed(2)}%`);
}

const final = model();
final.testAccuracy = Math.round(evaluate(final) * 10000) / 10000;
writeFileSync('src/sims/data/digits-model.json', JSON.stringify(final));
console.log(`Saved model: ${(final.testAccuracy * 100).toFixed(2)}% on the 10,000 MNIST test digits.`);

// A few test digits per class for examples and unit tests.
const samples: { label: number; img: string }[] = [];
const perClass = new Array(10).fill(0);
for (let i = 0; i < test.n && samples.length < 100; i++) {
  const y = testY[i];
  if (perClass[y] >= 10) continue;
  perClass[y]++;
  samples.push({ label: y, img: encodeSample(testX[i]) });
}
writeFileSync('src/sims/data/digits-samples.json', JSON.stringify(samples));
console.log(`Saved ${samples.length} example digits.`);
