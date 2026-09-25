/**
 * 2-D physics for the Galton board: balls bounce off a triangle of pegs and
 * pile up in bins. The pile heights approach a binomial distribution — the
 * central limit theorem, made of marbles. Tilting the board biases every bounce.
 */

export interface GaltonConfig {
  rows: number;
  pegDx: number;
  pegDy: number;
  pegTop: number;
  pegR: number;
  ballR: number;
  binTop: number;
  halfWidth: number;
  sepThickness: number;
  dropV: number;
  maxBalls: number;
}

export class GaltonSim {
  pegs: { x: number; y: number }[] = [];
  separators: number[] = [];
  x: Float32Array;
  y: Float32Array;
  vx: Float32Array;
  vy: Float32Array;
  count = 0;
  tilt = 0;
  gravity = 22;
  /** Sideways friction per second and the peg bounce (1 + restitution). */
  drag = 3;
  bounce = 1.4;
  maxVx = 4;
  private grid = new Map<number, number[]>();

  constructor(readonly cfg: GaltonConfig) {
    this.x = new Float32Array(cfg.maxBalls);
    this.y = new Float32Array(cfg.maxBalls);
    this.vx = new Float32Array(cfg.maxBalls);
    this.vy = new Float32Array(cfg.maxBalls);
    this.layout();
  }

  get bins() {
    return this.cfg.rows + 1;
  }

  layout() {
    const { rows, pegDx, pegDy, pegTop } = this.cfg;
    this.pegs = [];
    for (let r = 0; r < rows; r++)
      for (let j = 0; j <= r; j++) this.pegs.push({ x: (j - r / 2) * pegDx, y: pegTop - r * pegDy });
    this.separators = [];
    for (let j = 0; j <= rows + 1; j++) this.separators.push((j - (rows + 1) / 2) * pegDx);
  }

  setRows(rows: number) {
    this.cfg.rows = rows;
    this.layout();
    this.clear();
  }

  clear() {
    this.count = 0;
  }

  drop(): boolean {
    if (this.count >= this.cfg.maxBalls) return false;
    const i = this.count++;
    this.x[i] = (Math.random() - 0.5) * 0.3;
    this.y[i] = this.cfg.dropV;
    this.vx[i] = (Math.random() - 0.5) * 0.4;
    this.vy[i] = -1;
    return true;
  }

  binOf(x: number): number {
    const { rows, pegDx } = this.cfg;
    return Math.max(0, Math.min(rows, Math.floor((x + ((rows + 1) * pegDx) / 2) / pegDx)));
  }

  /** Balls that have settled into the bins. */
  counts(): number[] {
    const c = new Array(this.bins).fill(0);
    for (let i = 0; i < this.count; i++) if (this.y[i] < this.cfg.binTop - 0.2 && Math.abs(this.vy[i]) < 6) c[this.binOf(this.x[i])]++;
    return c;
  }

  step(dt: number, substeps = 4) {
    const h = dt / substeps;
    for (let s = 0; s < substeps; s++) this.substep(h);
  }

  private substep(h: number) {
    const { cfg } = this;
    const R = cfg.ballR, P = cfg.pegR;
    const n = this.count;
    const ax = this.tilt * this.gravity * 0.25, ay = -this.gravity;
    const drag = 1 - this.drag * h;
    for (let i = 0; i < n; i++) {
      this.vx[i] += ax * h;
      this.vy[i] += ay * h;
      // Rolling friction against the board keeps sideways speed modest.
      this.vx[i] = Math.max(-this.maxVx, Math.min(this.maxVx, this.vx[i] * drag));
      this.x[i] += this.vx[i] * h;
      this.y[i] += this.vy[i] * h;
    }
    // Ball–peg.
    for (let i = 0; i < n; i++) {
      if (this.y[i] < cfg.binTop - 1 || this.y[i] > cfg.pegTop + 1) continue;
      for (const p of this.pegs) {
        const dx = this.x[i] - p.x, dy = this.y[i] - p.y;
        const d2 = dx * dx + dy * dy, rr = R + P;
        if (d2 >= rr * rr || d2 < 1e-9) continue;
        const d = Math.sqrt(d2);
        const nx = dx / d, ny = dy / d;
        this.x[i] = p.x + nx * rr;
        this.y[i] = p.y + ny * rr;
        const vn = this.vx[i] * nx + this.vy[i] * ny;
        if (vn < 0) {
          // Soft bounce (restitution 0.2) that loses energy along the surface too.
          this.vx[i] -= this.bounce * vn * nx;
          this.vy[i] -= this.bounce * vn * ny;
          this.vx[i] *= 0.75;
          this.vy[i] *= 0.8;
          // A little randomness so identical drops don't take identical paths.
          this.vx[i] += (Math.random() - 0.5) * 0.35;
        }
      }
    }
    // Ball–ball, via a uniform grid.
    const cell = R * 2;
    const key = (x: number, y: number) => Math.floor(x / cell) * 100003 + Math.floor(y / cell);
    this.grid.clear();
    for (let i = 0; i < n; i++) {
      const k = key(this.x[i], this.y[i]);
      let l = this.grid.get(k);
      if (!l) this.grid.set(k, (l = []));
      l.push(i);
    }
    for (let i = 0; i < n; i++) {
      const cx = Math.floor(this.x[i] / cell), cy = Math.floor(this.y[i] / cell);
      for (let ox = -1; ox <= 1; ox++)
        for (let oy = -1; oy <= 1; oy++) {
          const l = this.grid.get((cx + ox) * 100003 + (cy + oy));
          if (!l) continue;
          for (const j of l) {
            if (j <= i) continue;
            const dx = this.x[j] - this.x[i], dy = this.y[j] - this.y[i];
            const d2 = dx * dx + dy * dy, rr = 2 * R;
            if (d2 >= rr * rr || d2 < 1e-9) continue;
            const d = Math.sqrt(d2);
            const nx = dx / d, ny = dy / d;
            const push = (rr - d) / 2;
            this.x[i] -= nx * push; this.y[i] -= ny * push;
            this.x[j] += nx * push; this.y[j] += ny * push;
            const rv = (this.vx[j] - this.vx[i]) * nx + (this.vy[j] - this.vy[i]) * ny;
            if (rv < 0) {
              const imp = -1.1 * rv / 2;
              this.vx[i] -= imp * nx; this.vy[i] -= imp * ny;
              this.vx[j] += imp * nx; this.vy[j] += imp * ny;
            }
          }
        }
    }
    // Walls, separators and floor.
    const W = cfg.halfWidth - 1 - R;
    const half = cfg.sepThickness / 2;
    for (let i = 0; i < n; i++) {
      if (this.x[i] < -W) { this.x[i] = -W; this.vx[i] = Math.abs(this.vx[i]) * 0.4; }
      if (this.x[i] > W) { this.x[i] = W; this.vx[i] = -Math.abs(this.vx[i]) * 0.4; }
      if (this.y[i] < cfg.binTop + R) {
        for (const sx of this.separators) {
          const dx = this.x[i] - sx;
          if (Math.abs(dx) < R + half) {
            this.x[i] = sx + Math.sign(dx || 1) * (R + half);
            this.vx[i] = -this.vx[i] * 0.3;
          }
        }
      }
      if (this.y[i] < R) {
        this.y[i] = R;
        if (this.vy[i] < 0) this.vy[i] = -this.vy[i] * 0.2;
        this.vx[i] *= 0.9;
      }
      // Balls in the bins: damp contact jitter so piles settle instead of fizzing.
      if (this.y[i] < cfg.binTop) {
        const sp = Math.hypot(this.vx[i], this.vy[i]);
        if (sp < 2.5) {
          this.vx[i] *= 0.85;
          this.vy[i] *= 0.9;
        }
      }
    }
  }
}

export function binomialPmf(n: number, p: number): number[] {
  const out: number[] = [];
  let c = 1;
  for (let k = 0; k <= n; k++) {
    out.push(c * p ** k * (1 - p) ** (n - k));
    c = (c * (n - k)) / (k + 1);
  }
  return out;
}

export function meanStd(counts: number[]): { mean: number; std: number; n: number } {
  const n = counts.reduce((a, b) => a + b, 0);
  if (!n) return { mean: 0, std: 0, n: 0 };
  const mean = counts.reduce((s, c, k) => s + c * k, 0) / n;
  const v = counts.reduce((s, c, k) => s + c * (k - mean) ** 2, 0) / n;
  return { mean, std: Math.sqrt(v), n };
}
