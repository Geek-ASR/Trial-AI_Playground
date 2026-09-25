import * as THREE from 'three';
import { audio } from '../audio/audio';
import { assign, elbow, inertia, initCentroids, makeBlobs, mulberry, update, type Vec3 } from '../ai/kmeans3d';
import { h } from '../ui/dom';
import { GROUND, LAB_BY_KIND } from '../world/layout';
import type { FrameInfo, SimContext, SimSystem } from './sim';

const COLORS = ['#ff6b8b', '#4fd1ff', '#ffd23f', '#6bff9b', '#c38bff', '#ff9f43', '#5c7cff', '#ff5ce1'].map((c) => new THREE.Color(c));
const GREY = new THREE.Color(0.55, 0.58, 0.68);
const MAXP = 520;

type Phase = 'idle' | 'assign' | 'update' | 'done';

/**
 * K-Means Nebula: a 3-D point cloud floating over a grove. Each iteration
 * animates the two k-means steps — colour every point by its nearest centroid,
 * then glide each centroid to the mean of its points.
 */
export class KMeansLab implements SimSystem {
  readonly id = 'kmeans';
  k = 4;
  blobs = 4;
  spread = 1.6;
  init: 'random' | 'kmeans++' = 'kmeans++';
  auto = true;
  iteration = 0;
  phase: Phase = 'idle';
  points: Vec3[] = [];
  centroids: Vec3[] = [];
  assignment: Int32Array = new Int32Array(0);
  elbowCurve: number[] = [];
  private seed = 3;
  private rnd = mulberry(99);
  private group = new THREE.Group();
  private dots: THREE.InstancedMesh;
  private gems: THREE.Mesh[] = [];
  private links: THREE.LineSegments;
  private phaseT = 0;
  private fromColors: THREE.Color[] = [];
  private toColors: THREE.Color[] = [];
  private fromCent: Vec3[] = [];
  private toCent: Vec3[] = [];
  private lab = LAB_BY_KIND.get('kmeans')!;
  private center: THREE.Vector3;
  private listeners = new Set<() => void>();

  constructor(ctx: SimContext) {
    this.center = new THREE.Vector3(this.lab.x + 0.5, GROUND + 15, this.lab.z + 0.5);
    this.group.position.copy(this.center);
    this.dots = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.24, 1), new THREE.MeshBasicMaterial(), MAXP);
    this.dots.count = 0;
    this.group.add(this.dots);
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAXP * 6), 3));
    lg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(MAXP * 6), 3));
    this.links = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.links.frustumCulled = false;
    this.group.add(this.links);
    ctx.scene.add(this.group);
    this.newData();
  }

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private changed() {
    this.listeners.forEach((l) => l());
  }

  newData() {
    const { points } = makeBlobs(this.blobs, Math.floor(360 / this.blobs), this.spread, 12, this.seed++);
    this.points = points;
    this.elbowCurve = elbow(points, 8, mulberry(4));
    this.reseed();
  }

  addPoint(p: Vec3) {
    if (this.points.length >= MAXP) return;
    this.points.push(p);
    this.reseed(false);
  }

  reseed(newCentroids = true) {
    if (newCentroids || this.centroids.length !== this.k) this.centroids = initCentroids(this.points, this.k, this.init, this.rnd);
    this.assignment = new Int32Array(this.points.length).fill(-1);
    this.iteration = 0;
    this.phase = 'idle';
    this.phaseT = 0;
    this.buildGems();
    this.fromColors = this.points.map(() => GREY.clone());
    this.toColors = this.fromColors.map((c) => c.clone());
    this.drawPoints(1);
    this.drawGems(1);
    this.changed();
  }

  private buildGems() {
    for (const g of this.gems) this.group.remove(g);
    this.gems = this.centroids.map((_, i) => {
      const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.85), new THREE.MeshBasicMaterial({ color: COLORS[i % COLORS.length].clone().multiplyScalar(2.6) }));
      this.group.add(m);
      return m;
    });
    this.fromCent = this.centroids.map((c) => [...c] as Vec3);
    this.toCent = this.fromCent;
  }

  get inertia(): number {
    return this.assignment[0] >= 0 ? inertia(this.points, this.assignment, this.centroids) : NaN;
  }

  /** Advance one half-step of the algorithm (assign, then update). */
  step() {
    if (this.phase === 'assign' || this.phase === 'update') return;
    if (this.phase === 'done') return;
    const next = assign(this.points, this.centroids);
    const changed = next.some((v, i) => v !== this.assignment[i]);
    this.fromColors = this.points.map((_, i) => this.colorOf(this.assignment[i]));
    this.assignment = next;
    this.toColors = this.points.map((_, i) => this.colorOf(next[i]));
    if (!changed && this.iteration > 0) {
      this.phase = 'done';
      audio.success();
      this.changed();
      return;
    }
    this.phase = 'assign';
    this.phaseT = 0;
    audio.tick();
  }

  private colorOf(c: number): THREE.Color {
    return c < 0 ? GREY.clone() : COLORS[c % COLORS.length].clone();
  }

  update(f: FrameInfo) {
    const p = f.focus;
    const near = Math.hypot(p.x - this.lab.x, p.z - this.lab.z) < 150;
    this.group.visible = near;
    if (!near) return;
    this.group.rotation.y += f.dt * 0.03;
    for (const g of this.gems) g.rotation.y += f.dt * 1.2;
    if (this.phase === 'assign') {
      this.phaseT += f.dt / 0.7;
      this.drawPoints(Math.min(1, this.phaseT));
      if (this.phaseT >= 1) {
        const u = update(this.points, this.assignment, this.centroids);
        this.fromCent = this.centroids.map((c) => [...c] as Vec3);
        this.toCent = u.centroids;
        this.centroids = u.centroids;
        this.phase = 'update';
        this.phaseT = 0;
      }
    } else if (this.phase === 'update') {
      this.phaseT += f.dt / 1.0;
      this.drawGems(Math.min(1, this.phaseT));
      if (this.phaseT >= 1) {
        this.iteration++;
        this.phase = 'idle';
        this.changed();
        if (this.auto) setTimeout(() => this.step(), 350);
      }
    } else if (this.phase === 'idle' && this.auto && this.iteration === 0 && this.assignment[0] === -1) {
      this.step();
    }
    this.drawLinks();
  }

  private drawPoints(t: number) {
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    this.points.forEach((p, i) => {
      this.dots.setMatrixAt(i, m.makeTranslation(p[0], p[1], p[2]));
      c.copy(this.fromColors[i] ?? GREY).lerp(this.toColors[i] ?? GREY, t).multiplyScalar(1.8);
      this.dots.setColorAt(i, c);
    });
    this.dots.count = this.points.length;
    this.dots.instanceMatrix.needsUpdate = true;
    if (this.dots.instanceColor) this.dots.instanceColor.needsUpdate = true;
  }

  private drawGems(t: number) {
    const e = t * t * (3 - 2 * t);
    this.gems.forEach((g, i) => {
      const a = this.fromCent[i] ?? this.centroids[i], b = this.toCent[i] ?? this.centroids[i];
      g.position.set(a[0] + (b[0] - a[0]) * e, a[1] + (b[1] - a[1]) * e, a[2] + (b[2] - a[2]) * e);
    });
  }

  private drawLinks() {
    const pos = this.links.geometry.getAttribute('position') as THREE.BufferAttribute;
    const col = this.links.geometry.getAttribute('color') as THREE.BufferAttribute;
    let n = 0;
    this.points.forEach((p, i) => {
      const a = this.assignment[i];
      if (a < 0 || !this.gems[a]) return;
      const g = this.gems[a].position;
      pos.setXYZ(n * 2, p[0], p[1], p[2]);
      pos.setXYZ(n * 2 + 1, g.x, g.y, g.z);
      const c = COLORS[a % COLORS.length];
      col.setXYZ(n * 2, c.r, c.g, c.b);
      col.setXYZ(n * 2 + 1, c.r * 0.2, c.g * 0.2, c.b * 0.2);
      n++;
    });
    pos.needsUpdate = true;
    col.needsUpdate = true;
    this.links.geometry.setDrawRange(0, n * 2);
  }

  /** Where the player is, in the nebula's (rotating) local space. */
  localOf(world: THREE.Vector3): Vec3 {
    const v = this.group.worldToLocal(world.clone());
    return [v.x, v.y, v.z];
  }

  panel(getPlayer: () => THREE.Vector3): { el: HTMLElement; destroy(): void } {
    const chart = h('canvas', { class: 'sim-chart', width: 460, height: 150 });
    const status = h('p', { class: 'muted small' });
    const render = () => {
      status.textContent =
        this.phase === 'done'
          ? `✓ Converged after ${this.iteration} iterations. Within-cluster spread (inertia): ${this.inertia.toFixed(1)}.`
          : `Iteration ${this.iteration} · ${this.points.length} points · k = ${this.k}${Number.isNaN(this.inertia) ? '' : ` · inertia ${this.inertia.toFixed(1)}`}`;
      drawElbow(chart, this.elbowCurve, this.k);
    };
    const unsub = this.onChange(render);
    const k = h('input', { type: 'range', min: '1', max: '8', step: '1', value: String(this.k) });
    const kLabel = h('b', null, String(this.k));
    k.addEventListener('input', () => { this.k = Number(k.value); kLabel.textContent = k.value; this.reseed(); });
    const blobs = h('input', { type: 'range', min: '2', max: '6', step: '1', value: String(this.blobs) });
    blobs.addEventListener('change', () => { this.blobs = Number(blobs.value); this.newData(); });
    const spread = h('input', { type: 'range', min: '0.8', max: '4', step: '0.2', value: String(this.spread) });
    spread.addEventListener('change', () => { this.spread = Number(spread.value); this.newData(); });
    const init = h('select', { class: 'select' }, h('option', { value: 'kmeans++', selected: this.init === 'kmeans++' }, 'k-means++ (smart)'), h('option', { value: 'random', selected: this.init === 'random' }, 'Random points'));
    init.addEventListener('change', () => { this.init = init.value as 'random' | 'kmeans++'; this.reseed(); });
    const auto = h('input', { type: 'checkbox', checked: this.auto });
    auto.addEventListener('change', () => { this.auto = auto.checked; if (this.auto) this.step(); });
    render();
    const el = h('div', { class: 'sim-panel' },
      h('header', { class: 'panel-title' },
        h('h2', null, '✨ K-Means Nebula'),
        h('p', { class: 'muted' }, 'No labels, no teacher: k-means finds groups on its own by repeating two steps — colour each point by its nearest crystal (assign), then move each crystal to the middle of its points (update) — until nothing changes.'),
      ),
      h('div', { class: 'forge-controls' },
        h('label', { class: 'field' }, h('span', null, 'Clusters to find (k) '), kLabel, k),
        h('label', { class: 'field' }, h('span', null, 'Initialisation'), init),
        h('label', { class: 'field' }, h('span', null, 'True blobs in the data'), blobs),
        h('label', { class: 'field' }, h('span', null, 'Blob spread'), spread),
      ),
      h('div', { class: 'lesson-actions' },
        h('button', { class: 'btn btn-primary', onclick: () => this.step() }, '⏭ Step'),
        h('label', { class: 'check' }, auto, 'Auto-run'),
        h('button', { class: 'btn', onclick: () => this.reseed() }, '🎲 New starting crystals'),
        h('button', { class: 'btn', onclick: () => this.newData() }, '🌌 New data'),
        h('button', { class: 'btn btn-ghost', onclick: () => this.addPoint(this.localOf(getPlayer())) }, '🙋 Add me as a data point'),
      ),
      status,
      h('p', { class: 'small' }, h('b', null, 'The elbow chart'), ': inertia (how tight the clusters are) for every k. The "elbow" — where adding clusters stops helping much — is usually the right k.'),
      chart,
      h('details', { class: 'sim-explain' },
        h('summary', null, 'Things to try'),
        h('ul', null,
          h('li', null, 'Set k lower or higher than the true number of blobs and watch clusters merge or split.'),
          h('li', null, 'Switch to random initialisation and re-seed a few times: sometimes two crystals get stuck in one blob — a local minimum. k-means++ spreads the starting crystals out to avoid that.'),
          h('li', null, 'Crank up the spread until the blobs overlap. Is there still a "right" answer?'),
        ),
      ),
    );
    return { el, destroy: unsub };
  }
}

function drawElbow(c: HTMLCanvasElement, curve: number[], k: number) {
  const ctx = c.getContext('2d')!;
  const W = c.width, H = c.height;
  ctx.clearRect(0, 0, W, H);
  if (!curve.length) return;
  const max = curve[0];
  const x = (i: number) => 30 + (i / (curve.length - 1)) * (W - 50);
  const y = (v: number) => H - 20 - (v / max) * (H - 40);
  ctx.strokeStyle = '#7ef9ff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  curve.forEach((v, i) => (i ? ctx.lineTo(x(i), y(v)) : ctx.moveTo(x(i), y(v))));
  ctx.stroke();
  ctx.fillStyle = '#c9cdf0';
  ctx.font = '11px Inter, sans-serif';
  curve.forEach((v, i) => {
    ctx.beginPath();
    ctx.arc(x(i), y(v), i + 1 === k ? 6 : 3.5, 0, Math.PI * 2);
    ctx.fillStyle = i + 1 === k ? '#ffc53d' : '#7ef9ff';
    ctx.fill();
    ctx.fillStyle = '#c9cdf0';
    ctx.fillText(`k=${i + 1}`, x(i) - 10, H - 4);
  });
}
