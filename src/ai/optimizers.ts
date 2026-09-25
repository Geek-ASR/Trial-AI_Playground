/**
 * Loss landscapes and optimisers for the Gradient Descent Valley. Pure maths —
 * no rendering — so every optimiser is unit-tested.
 */

export type LandscapeId = 'bowl' | 'rosenbrock' | 'himmelblau' | 'rastrigin' | 'saddle';
export type OptimizerId = 'sgd' | 'momentum' | 'rmsprop' | 'adam';

export interface Landscape {
  id: LandscapeId;
  name: string;
  blurb: string;
  /** [xmin, xmax, ymin, ymax] */
  domain: [number, number, number, number];
  f(x: number, y: number): number;
  grad(x: number, y: number): [number, number];
  minima: [number, number][];
  start: [number, number];
  /** Map a loss value to [0, 1] for terrain height. */
  display(f: number): number;
  /** Sensible default learning rate per optimiser. */
  lr: Record<OptimizerId, number>;
}

const logDisplay = (fmin: number, fmax: number) => (f: number) =>
  Math.max(0, Math.min(1, Math.log1p(Math.max(0, f - fmin)) / Math.log1p(fmax - fmin)));
const sqrtDisplay = (fmin: number, fmax: number) => (f: number) =>
  Math.max(0, Math.min(1, Math.sqrt(Math.max(0, f - fmin) / (fmax - fmin))));

export const LANDSCAPES: Landscape[] = [
  {
    id: 'himmelblau',
    name: 'Himmelblau (four valleys)',
    blurb: 'Four equally deep minima. Which one you land in depends on where you start — move the start point and watch the balls pick different valleys.',
    domain: [-5, 5, -5, 5],
    f: (x, y) => (x * x + y - 11) ** 2 + (x + y * y - 7) ** 2,
    grad: (x, y) => {
      const a = x * x + y - 11, b = x + y * y - 7;
      return [4 * x * a + 2 * b, 2 * a + 4 * y * b];
    },
    minima: [[3, 2], [-2.805118, 3.131312], [-3.77931, -3.283186], [3.584428, -1.848126]],
    start: [-0.3, 0.6],
    display: logDisplay(0, 890),
    lr: { sgd: 0.004, momentum: 0.002, rmsprop: 0.05, adam: 0.12 },
  },
  {
    id: 'bowl',
    name: 'Elongated bowl',
    blurb: 'A simple convex valley that is 10× steeper one way than the other. Plain SGD zig-zags across the narrow direction; momentum and Adam glide straight down.',
    domain: [-3, 3, -3, 3],
    f: (x, y) => 0.5 * x * x + 5 * y * y,
    grad: (x, y) => [x, 10 * y],
    minima: [[0, 0]],
    start: [-2.7, 1.7],
    display: sqrtDisplay(0, 49.5),
    lr: { sgd: 0.18, momentum: 0.03, rmsprop: 0.04, adam: 0.12 },
  },
  {
    id: 'rosenbrock',
    name: 'Rosenbrock banana',
    blurb: 'The classic optimiser torture test: finding the curved valley is easy, following it to the minimum at (1, 1) is hard.',
    domain: [-2, 2, -1, 3],
    f: (x, y) => (1 - x) ** 2 + 100 * (y - x * x) ** 2,
    grad: (x, y) => [-2 * (1 - x) - 400 * x * (y - x * x), 200 * (y - x * x)],
    minima: [[1, 1]],
    start: [-1.6, 2.4],
    display: logDisplay(0, 2509),
    lr: { sgd: 0.0012, momentum: 0.00025, rmsprop: 0.01, adam: 0.04 },
  },
  {
    id: 'rastrigin',
    name: 'Rastrigin egg crate',
    blurb: 'Dozens of local minima around one global minimum. Gradient descent gets stuck in the nearest dimple — real loss surfaces are rarely this bumpy, but it shows why initialisation matters.',
    domain: [-3.2, 3.2, -3.2, 3.2],
    f: (x, y) => 20 + x * x - 10 * Math.cos(2 * Math.PI * x) + y * y - 10 * Math.cos(2 * Math.PI * y),
    grad: (x, y) => [2 * x + 20 * Math.PI * Math.sin(2 * Math.PI * x), 2 * y + 20 * Math.PI * Math.sin(2 * Math.PI * y)],
    minima: [[0, 0]],
    start: [2.35, 2.6],
    display: sqrtDisplay(0, 61),
    lr: { sgd: 0.002, momentum: 0.0015, rmsprop: 0.02, adam: 0.06 },
  },
  {
    id: 'saddle',
    name: 'Saddle point',
    blurb: 'Balls start almost exactly on a saddle, where the slope is nearly zero. SGD dawdles there; momentum and adaptive methods escape to the valleys on either side.',
    domain: [-2.5, 2.5, -2.5, 2.5],
    f: (x, y) => x * x - y * y + 0.25 * y ** 4,
    grad: (x, y) => [2 * x, -2 * y + y ** 3],
    minima: [[0, Math.SQRT2], [0, -Math.SQRT2]],
    start: [2.2, 0.01],
    display: (f: number) => Math.max(0, Math.min(1, (f + 1) / 8.3)),
    lr: { sgd: 0.03, momentum: 0.01, rmsprop: 0.02, adam: 0.05 },
  },
];

export const LANDSCAPE_BY_ID = new Map(LANDSCAPES.map((l) => [l.id, l]));

export const OPTIMIZERS: { id: OptimizerId; name: string; color: string; formula: string }[] = [
  { id: 'sgd', name: 'SGD', color: '#f4f4f5', formula: 'θ ← θ − η·∇L' },
  { id: 'momentum', name: 'Momentum', color: '#f76b15', formula: 'v ← βv + ∇L ;  θ ← θ − η·v' },
  { id: 'rmsprop', name: 'RMSProp', color: '#3ddc97', formula: 's ← ρs + (1−ρ)∇L² ;  θ ← θ − η·∇L/√s' },
  { id: 'adam', name: 'Adam', color: '#ff5ce1', formula: 'm, v ← moving averages of ∇L, ∇L² ;  θ ← θ − η·m̂/√v̂' },
];

export class Optimizer {
  x: number;
  y: number;
  steps = 0;
  diverged = false;
  private vx = 0; private vy = 0; // momentum / Adam first moment
  private sx = 0; private sy = 0; // RMSProp / Adam second moment

  constructor(readonly id: OptimizerId, start: [number, number]) {
    [this.x, this.y] = start;
  }

  step(land: Landscape, lr: number) {
    if (this.diverged) return;
    const [gx, gy] = land.grad(this.x, this.y);
    const eps = 1e-8;
    this.steps++;
    switch (this.id) {
      case 'sgd':
        this.x -= lr * gx;
        this.y -= lr * gy;
        break;
      case 'momentum': {
        const beta = 0.9;
        this.vx = beta * this.vx + gx;
        this.vy = beta * this.vy + gy;
        this.x -= lr * this.vx;
        this.y -= lr * this.vy;
        break;
      }
      case 'rmsprop': {
        const rho = 0.9;
        this.sx = rho * this.sx + (1 - rho) * gx * gx;
        this.sy = rho * this.sy + (1 - rho) * gy * gy;
        this.x -= (lr * gx) / (Math.sqrt(this.sx) + eps);
        this.y -= (lr * gy) / (Math.sqrt(this.sy) + eps);
        break;
      }
      case 'adam': {
        const b1 = 0.9, b2 = 0.999;
        this.vx = b1 * this.vx + (1 - b1) * gx;
        this.vy = b1 * this.vy + (1 - b1) * gy;
        this.sx = b2 * this.sx + (1 - b2) * gx * gx;
        this.sy = b2 * this.sy + (1 - b2) * gy * gy;
        const c1 = 1 - b1 ** this.steps, c2 = 1 - b2 ** this.steps;
        this.x -= (lr * (this.vx / c1)) / (Math.sqrt(this.sx / c2) + eps);
        this.y -= (lr * (this.vy / c1)) / (Math.sqrt(this.sy / c2) + eps);
        break;
      }
    }
    const [x0, x1, y0, y1] = land.domain;
    const w = x1 - x0, h = y1 - y0;
    if (!Number.isFinite(this.x) || !Number.isFinite(this.y) || this.x < x0 - w || this.x > x1 + w || this.y < y0 - h || this.y > y1 + h) {
      this.diverged = true;
    }
    // Keep the ball on the map so it stays visible.
    this.x = Math.max(x0, Math.min(x1, Number.isFinite(this.x) ? this.x : x0));
    this.y = Math.max(y0, Math.min(y1, Number.isFinite(this.y) ? this.y : y0));
  }

  loss(land: Landscape): number {
    return land.f(this.x, this.y);
  }

  nearestMinimum(land: Landscape): number {
    return Math.min(...land.minima.map(([mx, my]) => Math.hypot(this.x - mx, this.y - my)));
  }
}
