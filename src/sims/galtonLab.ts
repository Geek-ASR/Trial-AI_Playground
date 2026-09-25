import * as THREE from 'three';
import { audio } from '../audio/audio';
import { binomialPmf, GaltonSim, meanStd } from '../ai/galton';
import { h } from '../ui/dom';
import { LAB_BY_KIND } from '../world/layout';
import { GALTON, labFrame } from './geometry';
import type { FrameInfo, SimContext, SimSystem } from './sim';

const MAX = 420;

/**
 * The Galton Board: a physical demo of the central limit theorem. Marbles bounce
 * through a triangle of pegs; each bounce is a coin flip, so the piles in the
 * bins grow into a binomial "bell curve". Tilting the board biases every flip.
 */
export class GaltonLab implements SimSystem {
  readonly id = 'galton';
  readonly sim = new GaltonSim({ ...GALTON, maxBalls: MAX });
  auto = false;
  rate = 6;
  private group = new THREE.Group();
  private balls: THREE.InstancedMesh;
  private pegs!: THREE.InstancedMesh;
  private seps!: THREE.InstancedMesh;
  private curve: THREE.Line;
  private acc = 0;
  private colorIndex = 0;
  private lab = LAB_BY_KIND.get('galton')!;
  private listeners = new Set<() => void>();
  private tickAt = 0;
  private statsTimer = 0;
  private pending = 0;
  private releaseAcc = 0;

  constructor(ctx: SimContext) {
    const fr = labFrame('galton');
    const origin = fr.world(0, 2, 0);
    // Centre the board on the lab (fr.world gives block corners; shift half a block).
    this.group.position.set(origin.x + 0.5, origin.y, origin.z + 0.5);
    this.group.rotation.y = fr.yaw;

    const W = GALTON.halfWidth, H = GALTON.height;
    const back = new THREE.Mesh(new THREE.BoxGeometry(W * 2, H, 0.3), new THREE.MeshLambertMaterial({ color: 0x14172b }));
    back.position.set(0, H / 2, -0.7);
    back.receiveShadow = true;
    const frameMat = new THREE.MeshLambertMaterial({ color: 0xece6dc });
    const side = new THREE.BoxGeometry(0.8, H + 0.8, 1.6);
    const left = new THREE.Mesh(side, frameMat);
    left.position.set(-W + 0.4, H / 2, 0);
    const right = left.clone();
    right.position.x = W - 0.4;
    const top = new THREE.Mesh(new THREE.BoxGeometry(W * 2, 0.8, 1.6), frameMat);
    top.position.set(0, H + 0.4, 0);
    const bottom = new THREE.Mesh(new THREE.BoxGeometry(W * 2, 0.4, 1.6), frameMat);
    bottom.position.set(0, -0.2, 0);
    for (const m of [left, right, top, bottom]) { m.castShadow = true; m.receiveShadow = true; }
    const glass = new THREE.Mesh(
      new THREE.PlaneGeometry(W * 2 - 1.6, H),
      new THREE.MeshPhongMaterial({ color: 0xcfeefe, transparent: true, opacity: 0.08, shininess: 120, specular: 0xffffff, depthWrite: false }),
    );
    glass.position.set(0, H / 2, 0.55);
    // Funnel above the pegs.
    const funnelMat = new THREE.MeshLambertMaterial({ color: 0xffc53d });
    for (const s of [-1, 1]) {
      const f = new THREE.Mesh(new THREE.BoxGeometry(7, 0.25, 1.2), funnelMat);
      f.position.set(s * 3.6, GALTON.dropV - 1.2, 0);
      f.rotation.z = s * 0.45;
      this.group.add(f);
    }
    this.group.add(back, left, right, top, bottom, glass);

    this.balls = new THREE.InstancedMesh(new THREE.SphereGeometry(GALTON.ballR, 12, 8), new THREE.MeshPhongMaterial({ shininess: 90, specular: 0x666666 }), MAX);
    this.balls.count = 0;
    this.balls.castShadow = true;
    this.balls.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.group.add(this.balls);

    const cg = new THREE.BufferGeometry();
    cg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(200 * 3), 3));
    this.curve = new THREE.Line(cg, new THREE.LineBasicMaterial({ color: new THREE.Color(3, 2.3, 0.6) }));
    this.curve.frustumCulled = false;
    this.group.add(this.curve);
    this.buildPegs();
    ctx.scene.add(this.group);
  }

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private buildPegs() {
    if (this.pegs) this.group.remove(this.pegs, this.seps);
    const s = this.sim;
    const m = new THREE.Matrix4();
    this.pegs = new THREE.InstancedMesh(new THREE.CylinderGeometry(GALTON.pegR, GALTON.pegR, 1.1, 10).rotateX(Math.PI / 2), new THREE.MeshPhongMaterial({ color: 0xd6dbe8, shininess: 100, specular: 0xffffff }), s.pegs.length);
    s.pegs.forEach((p, i) => this.pegs.setMatrixAt(i, m.makeTranslation(p.x, p.y, 0)));
    this.pegs.castShadow = true;
    this.seps = new THREE.InstancedMesh(new THREE.BoxGeometry(GALTON.sepThickness, GALTON.binTop, 1.1), new THREE.MeshLambertMaterial({ color: 0xece6dc }), s.separators.length);
    s.separators.forEach((x, i) => this.seps.setMatrixAt(i, m.makeTranslation(x, GALTON.binTop / 2, 0)));
    this.seps.castShadow = true;
    this.group.add(this.pegs, this.seps);
  }

  setRows(rows: number) {
    this.sim.setRows(rows);
    this.buildPegs();
    this.changed();
  }

  /** Queue marbles; they are released from the funnel in a steady stream. */
  drop(n: number) {
    this.pending = Math.min(MAX - this.sim.count, this.pending + n);
  }

  private release() {
    if (!this.sim.drop()) {
      this.pending = 0;
      return;
    }
    const c = new THREE.Color().setHSL((this.colorIndex++ * 0.0125) % 1, 0.75, 0.55);
    this.balls.setColorAt(this.sim.count - 1, c);
    if (this.balls.instanceColor) this.balls.instanceColor.needsUpdate = true;
  }

  clear() {
    this.sim.clear();
    this.pending = 0;
    this.balls.count = 0;
    this.changed();
  }

  private changed() {
    this.listeners.forEach((l) => l());
  }

  update(f: FrameInfo) {
    const p = f.focus;
    const near = Math.hypot(p.x - this.lab.x, p.z - this.lab.z) < 150;
    this.group.visible = near;
    if (!near) return;
    if (this.auto) {
      this.acc += f.dt * this.rate;
      while (this.acc >= 1) {
        this.acc -= 1;
        if (this.sim.count + this.pending < MAX) this.pending++;
        else this.auto = false;
      }
    }
    if (this.pending > 0) {
      this.releaseAcc += f.dt * 12;
      while (this.releaseAcc >= 1 && this.pending > 0) {
        this.releaseAcc -= 1;
        this.pending--;
        this.release();
      }
    }
    if (this.sim.count) this.sim.step(Math.min(f.dt, 1 / 30));
    const m = new THREE.Matrix4();
    for (let i = 0; i < this.sim.count; i++) this.balls.setMatrixAt(i, m.makeTranslation(this.sim.x[i], this.sim.y[i], 0));
    this.balls.count = this.sim.count;
    this.balls.instanceMatrix.needsUpdate = true;

    // A soft patter of marbles when you're close.
    const d = Math.hypot(p.x - this.lab.x, p.z - this.lab.z);
    if (d < 40 && this.sim.count && f.time > this.tickAt) {
      this.tickAt = f.time + 0.05 + Math.random() * 0.12;
      let moving = 0;
      for (let i = 0; i < this.sim.count; i++) if (this.sim.y[i] > GALTON.binTop && Math.abs(this.sim.vy[i]) > 1) moving++;
      if (moving && Math.random() < Math.min(1, moving / 12)) audio.tick((Math.random() - 0.5) * 0.4);
    }

    this.statsTimer -= f.dt;
    if (this.statsTimer <= 0) {
      this.statsTimer = 0.4;
      this.updateCurve();
      this.changed();
    }
  }

  /** Expected pile heights from a binomial fitted to the current sample. */
  private updateCurve() {
    const counts = this.sim.counts();
    const { mean, n } = meanStd(counts);
    const rows = this.sim.cfg.rows;
    const pos = this.curve.geometry.getAttribute('position') as THREE.BufferAttribute;
    if (n < 8) {
      this.curve.geometry.setDrawRange(0, 0);
      return;
    }
    const p = Math.min(0.98, Math.max(0.02, mean / rows));
    const pmf = binomialPmf(rows, p);
    const perBall = (Math.PI * GALTON.ballR ** 2) / ((GALTON.pegDx - GALTON.sepThickness) * 0.8);
    const pts: [number, number][] = [];
    const steps = 120;
    for (let s = 0; s <= steps; s++) {
      // Smoothly interpolate the pmf between bin centres (Catmull-Rom would be overkill).
      const t = (s / steps) * rows;
      const k = Math.floor(t), fr = t - k;
      const v = pmf[k] * (1 - fr) + (pmf[Math.min(rows, k + 1)] ?? 0) * fr;
      pts.push([(t - rows / 2) * GALTON.pegDx, v * n * perBall + 0.1]);
    }
    pts.forEach(([x, y], i) => pos.setXYZ(i, x, y, 0.35));
    pos.needsUpdate = true;
    this.curve.geometry.setDrawRange(0, pts.length);
  }

  panel(): { el: HTMLElement; destroy(): void } {
    const chart = h('canvas', { class: 'sim-chart', width: 460, height: 170 });
    const stats = h('p', { class: 'muted small' });
    const render = () => {
      const counts = this.sim.counts();
      const { mean, std, n } = meanStd(counts);
      const rows = this.sim.cfg.rows;
      const p = n ? mean / rows : 0.5;
      stats.textContent = n
        ? `${n} marbles settled · mean bin ${mean.toFixed(2)} (theory ${(rows * 0.5).toFixed(1)} untilted) · spread σ ${std.toFixed(2)} (binomial σ = √(n·p·(1−p)) = ${Math.sqrt(rows * p * (1 - p)).toFixed(2)})`
        : 'Drop some marbles!';
      drawChart(chart, counts, n ? binomialPmf(rows, p).map((q) => q * n) : []);
    };
    const unsub = this.onChange(render);
    const tilt = h('input', { type: 'range', min: '-1', max: '1', step: '0.05', value: String(this.sim.tilt) });
    tilt.addEventListener('input', () => { this.sim.tilt = Number(tilt.value); });
    const rows = h('select', { class: 'select' }, [10, 12, 14].map((r) => h('option', { value: String(r), selected: r === this.sim.cfg.rows }, `${r} rows`)));
    rows.addEventListener('change', () => this.setRows(Number(rows.value)));
    const auto = h('button', { class: 'btn', onclick: () => { this.auto = !this.auto; auto.textContent = this.auto ? '⏸ Stop pouring' : '🌧 Pour continuously'; } }, this.auto ? '⏸ Stop pouring' : '🌧 Pour continuously');
    render();
    const el = h('div', { class: 'sim-panel' },
      h('header', { class: 'panel-title' },
        h('h2', null, '🎯 The Galton Board'),
        h('p', { class: 'muted' }, 'Every marble makes a left-or-right coin flip at each row of pegs. One marble is unpredictable — hundreds of them always build the same bell curve. That is the central limit theorem, and it is why the normal distribution is everywhere in statistics and ML.'),
      ),
      h('div', { class: 'lesson-actions' },
        h('button', { class: 'btn btn-primary', onclick: () => this.drop(1) }, 'Drop 1'),
        h('button', { class: 'btn', onclick: () => this.drop(25) }, 'Drop 25'),
        h('button', { class: 'btn', onclick: () => this.drop(150) }, 'Drop 150'),
        auto,
        h('button', { class: 'btn btn-ghost', onclick: () => this.clear() }, 'Clear'),
      ),
      h('div', { class: 'forge-controls' },
        h('label', { class: 'field' }, h('span', null, 'Tilt the board (bias every bounce)'), tilt),
        h('label', { class: 'field' }, h('span', null, 'Rows of pegs'), rows),
      ),
      chart,
      stats,
      h('details', { class: 'sim-explain' },
        h('summary', null, 'Why a bell curve?'),
        h('p', null, 'To land in bin k a marble must go right exactly k times out of n rows. There are C(n, k) ways to do that, so the bins follow the binomial distribution. As n grows, the binomial approaches the normal distribution — and the same thing happens whenever many small random effects add up: measurement noise, heights, test scores, the gradients of a big mini-batch.'),
        h('p', null, 'The gold line in the world is the binomial curve fitted to your marbles. Tilt the board and watch the whole distribution shift — a biased coin.'),
      ),
    );
    return { el, destroy: unsub };
  }
}

function drawChart(c: HTMLCanvasElement, counts: number[], expected: number[]) {
  const ctx = c.getContext('2d')!;
  const W = c.width, H = c.height;
  ctx.clearRect(0, 0, W, H);
  const max = Math.max(1, ...counts, ...expected);
  const bw = W / counts.length;
  counts.forEach((v, i) => {
    const hgt = (v / max) * (H - 20);
    ctx.fillStyle = `hsl(${190 + i * 8}, 80%, 60%)`;
    ctx.fillRect(i * bw + 2, H - hgt, bw - 4, hgt);
  });
  if (expected.length) {
    ctx.strokeStyle = '#ffc53d';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    expected.forEach((v, i) => {
      const x = i * bw + bw / 2, y = H - (v / max) * (H - 20);
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    });
    ctx.stroke();
  }
}
