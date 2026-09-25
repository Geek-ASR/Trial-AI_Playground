/**
 * Handwritten-digit recogniser used by the Neural Cathedral.
 *
 * Dependency-free on purpose: the training script (scripts/train-digits.ts)
 * imports this exact file, so drawings in the browser are preprocessed exactly
 * like the MNIST images the network was trained on.
 */

export const DIGIT_SIZE = 16;
export const DIGIT_BOX = 12;

export interface DigitModel {
  arch: number[];
  /** weights[l] is row-major (out × in) for layer l. */
  weights: number[][];
  biases: number[][];
  testAccuracy: number;
  trainedOn: string;
}

function sample(src: ArrayLike<number>, w: number, h: number, x: number, y: number): number {
  // Bilinear sample with pixel centres at i + 0.5.
  const fx = x - 0.5, fy = y - 0.5;
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  const tx = fx - x0, ty = fy - y0;
  const at = (i: number, j: number) => (i < 0 || j < 0 || i >= w || j >= h ? 0 : src[j * w + i]);
  return (
    at(x0, y0) * (1 - tx) * (1 - ty) +
    at(x0 + 1, y0) * tx * (1 - ty) +
    at(x0, y0 + 1) * (1 - tx) * ty +
    at(x0 + 1, y0 + 1) * tx * ty
  );
}

/**
 * Crop the ink, scale its longest side to 12 px, and centre it by centre of
 * mass in a 16×16 image (the classic MNIST normalisation). Values in [0, 1].
 */
export function preprocess(src: ArrayLike<number>, w: number, h: number): Float32Array {
  let max = 0;
  for (let i = 0; i < w * h; i++) if (src[i] > max) max = src[i];
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (src[y * w + x] <= 0.1 * max || max <= 0) continue;
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    }
  const out = new Float32Array(DIGIT_SIZE * DIGIT_SIZE);
  if (x1 < 0) return out;
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
  const scale = DIGIT_BOX / Math.max(bw, bh);
  const tw = Math.max(1, Math.round(bw * scale)), th = Math.max(1, Math.round(bh * scale));
  const tmp = new Float32Array(tw * th);
  const ss = 4;
  let mass = 0, cx = 0, cy = 0;
  for (let ty = 0; ty < th; ty++)
    for (let tx = 0; tx < tw; tx++) {
      let acc = 0;
      for (let sy = 0; sy < ss; sy++)
        for (let sx = 0; sx < ss; sx++) {
          const u = x0 + (tx + (sx + 0.5) / ss) / scale;
          const v = y0 + (ty + (sy + 0.5) / ss) / scale;
          acc += sample(src, w, h, u, v);
        }
      const val = acc / (ss * ss) / (max || 1);
      tmp[ty * tw + tx] = val;
      mass += val;
      cx += (tx + 0.5) * val;
      cy += (ty + 0.5) * val;
    }
  if (mass <= 0) return out;
  cx /= mass;
  cy /= mass;
  const ox = Math.round(DIGIT_SIZE / 2 - cx), oy = Math.round(DIGIT_SIZE / 2 - cy);
  const px = Math.max(0, Math.min(DIGIT_SIZE - tw, ox)), py = Math.max(0, Math.min(DIGIT_SIZE - th, oy));
  let peak = 0;
  for (let ty = 0; ty < th; ty++)
    for (let tx = 0; tx < tw; tx++) {
      const X = px + tx, Y = py + ty;
      if (X < 0 || Y < 0 || X >= DIGIT_SIZE || Y >= DIGIT_SIZE) continue;
      const v = tmp[ty * tw + tx];
      out[Y * DIGIT_SIZE + X] = v;
      if (v > peak) peak = v;
    }
  if (peak > 0) for (let i = 0; i < out.length; i++) out[i] = Math.min(1, out[i] / peak);
  return out;
}

export interface Forward {
  /** Activations per layer: input, hidden…, output probabilities. */
  acts: Float32Array[];
  probs: Float32Array;
  prediction: number;
}

export function forward(model: DigitModel, input: Float32Array): Forward {
  const acts: Float32Array[] = [input];
  let a = input;
  const L = model.weights.length;
  for (let l = 0; l < L; l++) {
    const nIn = model.arch[l], nOut = model.arch[l + 1];
    const W = model.weights[l], b = model.biases[l];
    const z = new Float32Array(nOut);
    for (let j = 0; j < nOut; j++) {
      let s = b[j];
      const row = j * nIn;
      for (let i = 0; i < nIn; i++) s += W[row + i] * a[i];
      z[j] = s;
    }
    if (l < L - 1) {
      for (let j = 0; j < nOut; j++) z[j] = z[j] > 0 ? z[j] : 0;
    } else {
      let m = -Infinity;
      for (let j = 0; j < nOut; j++) m = Math.max(m, z[j]);
      let sum = 0;
      for (let j = 0; j < nOut; j++) { z[j] = Math.exp(z[j] - m); sum += z[j]; }
      for (let j = 0; j < nOut; j++) z[j] /= sum;
    }
    acts.push(z);
    a = z;
  }
  let prediction = 0;
  for (let j = 1; j < a.length; j++) if (a[j] > a[prediction]) prediction = j;
  return { acts, probs: a, prediction };
}

/** Decode a sample stored as 256 digits '0'–'9' (intensity tenths). */
export function decodeSample(s: string): Float32Array {
  const out = new Float32Array(DIGIT_SIZE * DIGIT_SIZE);
  for (let i = 0; i < out.length; i++) out[i] = (s.charCodeAt(i) - 48) / 9;
  return out;
}

export function encodeSample(img: ArrayLike<number>): string {
  let s = '';
  for (let i = 0; i < img.length; i++) s += String.fromCharCode(48 + Math.max(0, Math.min(9, Math.round(img[i] * 9))));
  return s;
}
