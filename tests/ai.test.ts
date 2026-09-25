import { describe, expect, it } from 'vitest';
import { astar } from '../src/ai/astar';
import { Flock, DEFAULT_BOIDS } from '../src/ai/boids';
import { decodeSample, DIGIT_SIZE, forward, preprocess, type DigitModel } from '../src/ai/digits';
import { analogy, ANALOGY_PRESETS, nearest, WORDS } from '../src/ai/embeddings';
import { binomialPmf, GaltonSim, meanStd } from '../src/ai/galton';
import { elbow, kmeans, makeBlobs, mulberry } from '../src/ai/kmeans3d';
import { LANDSCAPES, LANDSCAPE_BY_ID, Optimizer, type OptimizerId } from '../src/ai/optimizers';
import { Cell, GridWorld, greedyPathLength, QTable, runEpisode } from '../src/ai/qlearning';
import { GALTON, MAZE_MAP } from '../src/sims/geometry';
import model from '../src/sims/data/digits-model.json';
import samples from '../src/sims/data/digits-samples.json';

describe('optimisers', () => {
  const ids: OptimizerId[] = ['sgd', 'momentum', 'rmsprop', 'adam'];

  it('every optimiser finds the bottom of the bowl', () => {
    const land = LANDSCAPE_BY_ID.get('bowl')!;
    for (const id of ids) {
      const o = new Optimizer(id, land.start);
      for (let i = 0; i < 1500; i++) o.step(land, land.lr[id]);
      expect(o.nearestMinimum(land), id).toBeLessThan(0.05);
    }
  });

  it('too large a learning rate makes plain SGD blow up', () => {
    const land = LANDSCAPE_BY_ID.get('bowl')!;
    const o = new Optimizer('sgd', land.start);
    for (let i = 0; i < 200; i++) o.step(land, 0.25);
    expect(o.diverged || o.loss(land) > land.f(...land.start)).toBe(true);
  });

  it('Adam follows the Rosenbrock banana to (1, 1)', () => {
    const land = LANDSCAPE_BY_ID.get('rosenbrock')!;
    const o = new Optimizer('adam', land.start);
    for (let i = 0; i < 6000; i++) o.step(land, land.lr.adam);
    expect(o.nearestMinimum(land)).toBeLessThan(0.15);
  });

  it('on Himmelblau every optimiser settles in one of the four valleys', () => {
    const land = LANDSCAPE_BY_ID.get('himmelblau')!;
    for (const id of ids) {
      const o = new Optimizer(id, land.start);
      for (let i = 0; i < 4000; i++) o.step(land, land.lr[id]);
      expect(o.nearestMinimum(land), id).toBeLessThan(0.1);
    }
  });

  it('analytic gradients match finite differences on every landscape', () => {
    for (const land of LANDSCAPES) {
      const [x0, x1, y0, y1] = land.domain;
      for (let t = 0; t < 5; t++) {
        const x = x0 + ((t + 0.37) / 5) * (x1 - x0), y = y0 + ((t + 0.61) / 5) * (y1 - y0);
        const h = 1e-5;
        const [gx, gy] = land.grad(x, y);
        const nx = (land.f(x + h, y) - land.f(x - h, y)) / (2 * h);
        const ny = (land.f(x, y + h) - land.f(x, y - h)) / (2 * h);
        expect(gx).toBeCloseTo(nx, 2);
        expect(gy).toBeCloseTo(ny, 2);
      }
    }
  });
});

describe('A* search', () => {
  const open = (w: number, h: number, blocked: (x: number, z: number) => boolean = () => false) => ({
    w, h, height: (x: number, z: number) => (blocked(x, z) ? -1 : 0),
  });

  it('finds the straight-line optimum on an open grid', () => {
    const r = astar(open(30, 30), [2, 2], [20, 2]);
    expect(r.found).toBe(true);
    expect(r.cost).toBeCloseTo(18);
  });

  it('goes around a wall through the gap', () => {
    const grid = open(30, 30, (x, z) => x === 10 && z !== 25);
    const r = astar(grid, [2, 5], [20, 5]);
    expect(r.found).toBe(true);
    expect(r.path.some(([x, z]) => x === 10 && z === 25)).toBe(true);
  });

  it('reports unreachable goals', () => {
    const r = astar(open(20, 20, (x) => x === 10), [2, 2], [15, 2]);
    expect(r.found).toBe(false);
  });

  it('explores fewer cells than Dijkstra', () => {
    const g = open(60, 60);
    const a = astar(g, [5, 5], [50, 40]);
    const d = astar(g, [5, 5], [50, 40], { weight: 0 });
    expect(a.cost).toBeCloseTo(d.cost, 5);
    expect(a.expanded.length).toBeLessThan(d.expanded.length / 3);
  });

  it('refuses steps more than one block high', () => {
    const grid = { w: 10, h: 3, height: (x: number) => (x < 5 ? 0 : 3) };
    expect(astar(grid, [1, 1], [8, 1]).found).toBe(false);
  });
});

describe('Q-learning', () => {
  it('the maze has a safe route from S to G', () => {
    const env = GridWorld.fromMap(MAZE_MAP);
    expect(env.cells[env.start]).toBe(Cell.Floor);
    expect(env.shortestPath()).toBeGreaterThan(10);
  });

  it('learns a near-shortest greedy path through the maze', () => {
    const env = GridWorld.fromMap(MAZE_MAP);
    const q = new QTable(env.size);
    const r = mulberry(7);
    let eps = 1;
    for (let ep = 0; ep < 1500; ep++) {
      runEpisode(env, q, eps, 0.5, 0.97, 400, r);
      eps = Math.max(0.05, eps * 0.995);
    }
    const len = greedyPathLength(env, q);
    expect(len).toBeGreaterThan(0);
    expect(len).toBeLessThanOrEqual(env.shortestPath() + 4);
  });

  it('bumping into walls keeps you in place', () => {
    const env = GridWorld.fromMap(['S#', '.G']);
    expect(env.step(env.start, 1).next).toBe(env.start);
    expect(env.step(env.start, 2)).toMatchObject({ next: 2, done: false });
  });
});

describe('boids', () => {
  it('a scattered flock lines up and keeps its distance', () => {
    const f = new Flock(60, 100, 50, 100, mulberry(3));
    const before = f.order();
    const env = { ground: () => 20, minAlt: 30, maxAlt: 70, bounds: [0, 200, 0, 200] as [number, number, number, number] };
    for (let i = 0; i < 400; i++) f.step(1 / 30, DEFAULT_BOIDS, env);
    expect(f.order()).toBeGreaterThan(Math.max(0.6, before));
    let minD = Infinity;
    for (let i = 0; i < f.n; i++)
      for (let j = i + 1; j < f.n; j++)
        minD = Math.min(minD, Math.hypot(f.pos[i * 3] - f.pos[j * 3], f.pos[i * 3 + 1] - f.pos[j * 3 + 1], f.pos[i * 3 + 2] - f.pos[j * 3 + 2]));
    expect(minD).toBeGreaterThan(0.2);
  });
});

describe('Galton board', () => {
  it('piles balls into a bell curve centred on the middle bin', () => {
    const sim = new GaltonSim({ ...GALTON, maxBalls: 400 });
    let t = 0;
    for (let frame = 0; frame < 60 * 50; frame++) {
      if (frame % 6 === 0 && sim.count < 360) sim.drop();
      sim.step(1 / 60);
      t++;
    }
    const counts = sim.counts();
    const { mean, std, n } = meanStd(counts);
    expect(n).toBeGreaterThan(300);
    expect(Math.abs(mean - GALTON.rows / 2)).toBeLessThan(0.8);
    // Theory: sqrt(14 · ½ · ½) ≈ 1.87 bins.
    expect(std).toBeGreaterThan(1.4);
    expect(std).toBeLessThan(2.6);
    const expected = binomialPmf(GALTON.rows, 0.5).map((p) => p * n);
    const l1 = counts.reduce((s, c, k) => s + Math.abs(c - expected[k]), 0) / n;
    expect(l1).toBeLessThan(0.35);
    for (let i = 0; i < sim.count; i++)
      for (const p of sim.pegs) expect(Math.hypot(sim.x[i] - p.x, sim.y[i] - p.y)).toBeGreaterThan(GALTON.ballR + GALTON.pegR - 0.05);
    expect(t).toBeGreaterThan(0);
  });

  it('binomial pmf sums to one and peaks in the middle', () => {
    const p = binomialPmf(14, 0.5);
    expect(p.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
    expect(p.indexOf(Math.max(...p))).toBe(7);
  });
});

describe('k-means', () => {
  it('recovers well-separated blobs with k-means++', () => {
    const { points, labels } = makeBlobs(4, 60, 1.4, 14, 11);
    const res = kmeans(points, 4, 'kmeans++', mulberry(5));
    // Purity: each found cluster is dominated by one true blob.
    let pure = 0;
    for (let c = 0; c < 4; c++) {
      const members = labels.filter((_, i) => res.assignment[i] === c);
      const counts = [0, 0, 0, 0];
      for (const l of members) counts[l]++;
      pure += Math.max(...counts);
    }
    expect(pure / points.length).toBeGreaterThan(0.95);
  });

  it('inertia drops as k grows (the elbow chart)', () => {
    const { points } = makeBlobs(3, 40, 1.2, 12, 4);
    const e = elbow(points, 6, mulberry(9));
    for (let k = 1; k < e.length; k++) expect(e[k]).toBeLessThanOrEqual(e[k - 1] + 1e-6);
    expect(e[2] / e[0]).toBeLessThan(0.2);
  });
});

describe('digit recogniser', () => {
  const m = model as unknown as DigitModel;

  it('has the documented architecture and accuracy', () => {
    expect(m.arch).toEqual([256, 32, 16, 10]);
    expect(m.testAccuracy).toBeGreaterThan(0.94);
  });

  it('classifies held-out MNIST digits', () => {
    let ok = 0;
    for (const s of samples as { label: number; img: string }[]) if (forward(m, decodeSample(s.img)).prediction === s.label) ok++;
    expect(ok / samples.length).toBeGreaterThan(0.9);
  });

  it('is invariant to where and how big you draw', () => {
    const s = (samples as { label: number; img: string }[])[3];
    const img = decodeSample(s.img);
    // Paste the digit, shrunk, into a corner of a big canvas.
    const W = 40;
    const big = new Float32Array(W * W);
    for (let y = 0; y < DIGIT_SIZE; y++) for (let x = 0; x < DIGIT_SIZE; x++) big[(y + 20) * W + x + 3] = img[y * DIGIT_SIZE + x];
    const moved = preprocess(big, W, W);
    expect(forward(m, moved).prediction).toBe(forward(m, img).prediction);
    expect(preprocess(new Float32Array(256), 16, 16).every((v) => v === 0)).toBe(true);
  });
});

describe('embedding galaxy', () => {
  it('solves every preset analogy', () => {
    const expected = ['queen', 'Tokyo', 'swam', 'puppy', 'faster', 'Delhi', 'queen', 'happiest'];
    ANALOGY_PRESETS.forEach(([a, b, c], i) => {
      expect(analogy(a, b, c)?.answer.word, `${a} − ${b} + ${c}`).toBe(expected[i]);
    });
  });

  it('keeps words of a cluster near each other', () => {
    const nn = nearest('mango', 3);
    expect(nn.every((n) => n.word.cluster === 'food')).toBe(true);
    expect(new Set(WORDS.map((w) => w.word)).size).toBe(WORDS.length);
  });
});
