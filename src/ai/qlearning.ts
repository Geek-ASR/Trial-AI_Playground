/**
 * Tabular Q-learning on a grid world. The Q-Learning Maze reads walls, lava
 * and goals straight out of the voxel world, so players can rebuild the maze
 * and watch the agents re-learn.
 */

export const Cell = { Floor: 0, Wall: 1, Lava: 2, Goal: 3 } as const;

export const ACTIONS: [number, number][] = [[-1, 0], [0, 1], [1, 0], [0, -1]]; // up (−row), right, down, left

export interface Rewards {
  step: number;
  bump: number;
  lava: number;
  goal: number;
}

export const DEFAULT_REWARDS: Rewards = { step: -0.04, bump: -0.1, lava: -1, goal: 1 };

export class GridWorld {
  cells: Uint8Array;
  start = 0;

  constructor(readonly rows: number, readonly cols: number) {
    this.cells = new Uint8Array(rows * cols);
  }

  static fromMap(map: string[]): GridWorld {
    const g = new GridWorld(map.length, map[0].length);
    map.forEach((row, r) =>
      [...row].forEach((ch, c) => {
        const i = r * g.cols + c;
        g.cells[i] = ch === '#' ? Cell.Wall : ch === '~' ? Cell.Lava : ch === 'G' ? Cell.Goal : Cell.Floor;
        if (ch === 'S') g.start = i;
      }),
    );
    return g;
  }

  get size() {
    return this.rows * this.cols;
  }

  step(state: number, action: number, rewards: Rewards = DEFAULT_REWARDS): { next: number; reward: number; done: boolean } {
    const r = Math.floor(state / this.cols), c = state % this.cols;
    const [dr, dc] = ACTIONS[action];
    const nr = r + dr, nc = c + dc;
    if (nr < 0 || nc < 0 || nr >= this.rows || nc >= this.cols || this.cells[nr * this.cols + nc] === Cell.Wall) {
      return { next: state, reward: rewards.bump, done: false };
    }
    const next = nr * this.cols + nc;
    const t = this.cells[next];
    if (t === Cell.Lava) return { next, reward: rewards.lava, done: true };
    if (t === Cell.Goal) return { next, reward: rewards.goal, done: true };
    return { next, reward: rewards.step, done: false };
  }

  /** Breadth-first shortest path length from start to any goal (−1 if unreachable), avoiding lava. */
  shortestPath(): number {
    const dist = new Int32Array(this.size).fill(-1);
    dist[this.start] = 0;
    const q = [this.start];
    while (q.length) {
      const s = q.shift()!;
      if (this.cells[s] === Cell.Goal) return dist[s];
      const r = Math.floor(s / this.cols), c = s % this.cols;
      for (const [dr, dc] of ACTIONS) {
        const nr = r + dr, nc = c + dc;
        if (nr < 0 || nc < 0 || nr >= this.rows || nc >= this.cols) continue;
        const n = nr * this.cols + nc;
        if (dist[n] >= 0 || this.cells[n] === Cell.Wall || this.cells[n] === Cell.Lava) continue;
        dist[n] = dist[s] + 1;
        q.push(n);
      }
    }
    return -1;
  }
}

export class QTable {
  q: Float32Array;

  constructor(readonly states: number) {
    this.q = new Float32Array(states * 4);
  }

  reset() {
    this.q.fill(0);
  }

  best(s: number): number {
    let b = 0;
    const o = s * 4;
    for (let a = 1; a < 4; a++) if (this.q[o + a] > this.q[o + b]) b = a;
    return b;
  }

  value(s: number): number {
    return this.q[s * 4 + this.best(s)];
  }

  choose(s: number, epsilon: number, rnd: () => number = Math.random): number {
    if (rnd() < epsilon) return Math.floor(rnd() * 4);
    // Break ties randomly so an untrained agent explores instead of always going "up".
    const o = s * 4;
    const m = Math.max(this.q[o], this.q[o + 1], this.q[o + 2], this.q[o + 3]);
    const ties: number[] = [];
    for (let a = 0; a < 4; a++) if (this.q[o + a] === m) ties.push(a);
    return ties[Math.floor(rnd() * ties.length)];
  }

  update(s: number, a: number, r: number, s2: number, done: boolean, alpha: number, gamma: number) {
    const target = done ? r : r + gamma * this.value(s2);
    const i = s * 4 + a;
    this.q[i] += alpha * (target - this.q[i]);
  }
}

/** Run one full episode (used by tests and the "turbo" mode). Returns steps taken and whether the goal was reached. */
export function runEpisode(env: GridWorld, q: QTable, epsilon: number, alpha: number, gamma: number, maxSteps = 400, rnd: () => number = Math.random) {
  let s = env.start;
  let total = 0;
  for (let t = 0; t < maxSteps; t++) {
    const a = q.choose(s, epsilon, rnd);
    const { next, reward, done } = env.step(s, a);
    q.update(s, a, reward, next, done, alpha, gamma);
    total += reward;
    s = next;
    if (done) return { steps: t + 1, reward: total, success: env.cells[s] === Cell.Goal };
  }
  return { steps: maxSteps, reward: total, success: false };
}

/** Follow the greedy policy; returns the path length to the goal or −1. */
export function greedyPathLength(env: GridWorld, q: QTable, maxSteps = 400): number {
  let s = env.start;
  for (let t = 0; t < maxSteps; t++) {
    const { next, done } = env.step(s, q.best(s));
    s = next;
    if (done) return env.cells[s] === Cell.Goal ? t + 1 : -1;
  }
  return -1;
}
