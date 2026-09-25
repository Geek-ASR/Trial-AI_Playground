import { gaussian, mulberry32 } from './rng';

export type DatasetId = 'circle' | 'xor' | 'blobs' | 'moons' | 'spiral';

export interface Point {
  x: number;
  y: number;
  label: 0 | 1;
}

export const DATASETS: { id: DatasetId; name: string; hint: string }[] = [
  { id: 'blobs', name: 'Two blobs', hint: 'Linearly separable — even a single neuron can do it.' },
  { id: 'circle', name: 'Circle', hint: 'Needs a curved boundary. Try x² and y² features, or a hidden layer.' },
  { id: 'xor', name: 'XOR', hint: 'The problem that stumped single-layer perceptrons in 1969.' },
  { id: 'moons', name: 'Moons', hint: 'Two interleaving half-circles.' },
  { id: 'spiral', name: 'Spiral', hint: 'The boss level. Go deep, add sin features, be patient.' },
];

/** Generate n points in roughly [-1, 1]². */
export function makeDataset(id: DatasetId, n = 200, noise = 0.1, seed = 7): Point[] {
  const r = mulberry32(seed);
  const pts: Point[] = [];
  const jitter = () => gaussian(r) * noise;
  for (let i = 0; i < n; i++) {
    const label = (i % 2) as 0 | 1;
    let x = 0, y = 0;
    switch (id) {
      case 'blobs': {
        const c = label ? 0.45 : -0.45;
        x = c + gaussian(r) * (0.2 + noise);
        y = c + gaussian(r) * (0.2 + noise);
        break;
      }
      case 'circle': {
        const rad = label ? r() * 0.4 : 0.65 + r() * 0.3;
        const a = r() * Math.PI * 2;
        x = Math.cos(a) * rad + jitter();
        y = Math.sin(a) * rad + jitter();
        break;
      }
      case 'xor': {
        x = r() * 2 - 1;
        y = r() * 2 - 1;
        const gap = 0.06;
        x += x > 0 ? gap : -gap;
        y += y > 0 ? gap : -gap;
        pts.push({ x: x + jitter() * 0.5, y: y + jitter() * 0.5, label: (x * y > 0 ? 1 : 0) });
        continue;
      }
      case 'moons': {
        const a = r() * Math.PI;
        if (label) {
          x = Math.cos(a) * 0.6 - 0.3;
          y = Math.sin(a) * 0.6 - 0.15;
        } else {
          x = 0.3 - Math.cos(a) * 0.6;
          y = 0.15 - Math.sin(a) * 0.6;
        }
        x += jitter();
        y += jitter();
        break;
      }
      case 'spiral': {
        const t = (Math.floor(i / 2) / (n / 2)) * 1.75 * Math.PI;
        const rad = (t / (1.75 * Math.PI)) * 0.9 + 0.05;
        const a = t + (label ? Math.PI : 0);
        x = Math.cos(a) * rad + jitter() * 0.5;
        y = Math.sin(a) * rad + jitter() * 0.5;
        break;
      }
    }
    pts.push({ x, y, label });
  }
  return pts;
}

export type FeatureId = 'x' | 'y' | 'x2' | 'y2' | 'xy' | 'sinx' | 'siny';

export const FEATURES: { id: FeatureId; label: string; fn: (x: number, y: number) => number }[] = [
  { id: 'x', label: 'x', fn: (x) => x },
  { id: 'y', label: 'y', fn: (_, y) => y },
  { id: 'x2', label: 'x²', fn: (x) => x * x },
  { id: 'y2', label: 'y²', fn: (_, y) => y * y },
  { id: 'xy', label: 'x·y', fn: (x, y) => x * y },
  { id: 'sinx', label: 'sin(x)', fn: (x) => Math.sin(3 * x) },
  { id: 'siny', label: 'sin(y)', fn: (_, y) => Math.sin(3 * y) },
];

export function featurize(x: number, y: number, feats: FeatureId[]): number[] {
  return feats.map((f) => FEATURES.find((d) => d.id === f)!.fn(x, y));
}

/** Deterministic train/test split. */
export function split(points: Point[], testFraction = 0.3, seed = 3): { train: Point[]; test: Point[] } {
  const r = mulberry32(seed);
  const train: Point[] = [], test: Point[] = [];
  for (const p of points) (r() < testFraction ? test : train).push(p);
  return { train, test };
}
