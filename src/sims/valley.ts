import * as THREE from 'three';
import { LANDSCAPES, LANDSCAPE_BY_ID, OPTIMIZERS, Optimizer, type LandscapeId, type OptimizerId } from '../ai/optimizers';
import { toast } from '../ui/components/toast';
import { h } from '../ui/dom';
import { GROUND, LAB_BY_KIND } from '../world/layout';
import { VALLEY } from './geometry';
import type { FrameInfo, SimContext, SimSystem } from './sim';
import { buildValley, domainToValley, valleyToDomain } from './structures';

const TRAIL = 900;

interface Ball {
  opt: Optimizer;
  mesh: THREE.Mesh;
  trail: THREE.Line;
  trailPos: Float32Array;
  trailN: number;
}

/**
 * Gradient Descent Valley: a walkable voxel loss landscape with SGD, Momentum,
 * RMSProp and Adam racing down it as glowing balls that leave trails.
 */
export class ValleySim implements SimSystem {
  readonly id = 'valley';
  land = LANDSCAPE_BY_ID.get('himmelblau')!;
  lrScale = 1;
  enabled = new Set<OptimizerId>(['sgd', 'momentum', 'rmsprop', 'adam']);
  running = true;
  stepsPerSec = 40;
  start: [number, number];
  private balls: Ball[] = [];
  private group = new THREE.Group();
  private minima = new THREE.Group();
  private startMarker: THREE.Mesh;
  private acc = 0;
  private lab = LAB_BY_KIND.get('valley')!;
  private listeners = new Set<() => void>();
  private inside = false;

  constructor(private ctx: SimContext) {
    this.start = [...this.land.start] as [number, number];
    for (const o of OPTIMIZERS) {
      const color = new THREE.Color(o.color);
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.46, 20, 14), new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(2.2) }));
      mesh.castShadow = true;
      const trailPos = new Float32Array(TRAIL * 3);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(trailPos, 3).setUsage(THREE.DynamicDrawUsage));
      g.setDrawRange(0, 0);
      const trail = new THREE.Line(g, new THREE.LineBasicMaterial({ color: color.clone().multiplyScalar(1.6) }));
      trail.frustumCulled = false;
      this.group.add(mesh, trail);
      this.balls.push({ opt: new Optimizer(o.id, this.start), mesh, trail, trailPos, trailN: 0 });
    }
    this.startMarker = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.08, 8, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.5, 2.5, 2.5) }));
    this.startMarker.rotation.x = Math.PI / 2;
    this.group.add(this.startMarker, this.minima);
    ctx.scene.add(this.group);
    this.placeMinima();
    this.reset();
  }

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private changed() {
    this.listeners.forEach((l) => l());
  }

  /** World position of a point in landscape coordinates, sitting on the surface. */
  worldPos(x: number, y: number, lift = 0.46): THREE.Vector3 {
    const [i, j] = domainToValley(this.land, x, y);
    const top = VALLEY.floor + 2 + this.land.display(this.land.f(x, y)) * VALLEY.maxH;
    return new THREE.Vector3(this.lab.x + i + 0.5, top + lift, this.lab.z + j + 0.5);
  }

  setLandscape(id: LandscapeId) {
    this.land = LANDSCAPE_BY_ID.get(id)!;
    buildValley(this.ctx.world, this.land);
    this.start = [...this.land.start] as [number, number];
    this.placeMinima();
    this.reset();
  }

  private placeMinima() {
    this.minima.clear();
    for (const [mx, my] of this.land.minima) {
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.45), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.4, 0.6) }));
      gem.position.copy(this.worldPos(mx, my, 2.4));
      this.minima.add(gem);
    }
  }

  reset() {
    for (const b of this.balls) {
      b.opt = new Optimizer(b.opt.id, this.start);
      b.trailN = 0;
      b.trail.geometry.setDrawRange(0, 0);
      this.placeBall(b);
    }
    this.startMarker.position.copy(this.worldPos(this.start[0], this.start[1], 0.1));
    this.changed();
  }

  randomStart() {
    const [x0, x1, y0, y1] = this.land.domain;
    this.start = [x0 + Math.random() * (x1 - x0), y0 + Math.random() * (y1 - y0)];
    this.reset();
  }

  private placeBall(b: Ball) {
    const p = this.worldPos(b.opt.x, b.opt.y);
    b.mesh.position.copy(p);
    b.mesh.visible = this.enabled.has(b.opt.id);
    b.trail.visible = b.mesh.visible;
    if (b.trailN < TRAIL) {
      b.trailPos.set([p.x, p.y - 0.2, p.z], b.trailN * 3);
      b.trailN++;
      b.trail.geometry.setDrawRange(0, b.trailN);
      (b.trail.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    }
  }

  stats() {
    return this.balls.map((b) => ({
      id: b.opt.id,
      loss: b.opt.loss(this.land),
      steps: b.opt.steps,
      dist: b.opt.nearestMinimum(this.land),
      diverged: b.opt.diverged,
      enabled: this.enabled.has(b.opt.id),
    }));
  }

  update(f: FrameInfo) {
    const p = f.focus;
    const near = Math.hypot(p.x - this.lab.x, p.z - this.lab.z) < 140;
    this.group.visible = near;
    if (!near) return;
    for (const m of this.minima.children) m.rotation.y += f.dt * 1.5;
    const pl = f.player.pos;
    const inPit = pl.y < GROUND - 0.5 && Math.abs(pl.x - this.lab.x - 0.5) < VALLEY.half + 1 && Math.abs(pl.z - this.lab.z - 0.5) < VALLEY.half + 1;
    if (inPit && !this.inside) toast('You are standing on the loss surface', 'Low ground = low loss. Double-tap Space to fly back out, or press H for the hub.');
    this.inside = inPit;
    this.startMarker.rotation.z += f.dt;
    if (!this.running) return;
    this.acc += f.dt * this.stepsPerSec;
    let n = Math.floor(this.acc);
    this.acc -= n;
    n = Math.min(n, 60);
    if (!n) return;
    for (const b of this.balls) {
      if (!this.enabled.has(b.opt.id) || b.opt.steps > 5000) continue;
      for (let i = 0; i < n; i++) b.opt.step(this.land, this.land.lr[b.opt.id] * this.lrScale);
      this.placeBall(b);
    }
    this.changed();
  }

  pointer(kind: 'down' | 'up' | 'move', button: number, ray: THREE.Ray): boolean {
    if (kind !== 'down' || button !== 0) return false;
    const o = ray.origin, d = ray.direction;
    const hit = this.ctx.world.raycast(o.x, o.y, o.z, d.x, d.y, d.z, 64);
    if (!hit) return false;
    const i = hit.x - this.lab.x, j = hit.z - this.lab.z;
    if (Math.abs(i) > VALLEY.half || Math.abs(j) > VALLEY.half) return false;
    this.start = valleyToDomain(this.land, i, j);
    this.reset();
    this.running = true;
    return true;
  }

  panel(): { el: HTMLElement; destroy(): void } {
    const stats = h('table', { class: 'sim-table' });
    const lrLabel = h('span', { class: 'muted small' });
    const blurb = h('p', { class: 'muted' }, this.land.blurb);
    const render = () => {
      lrLabel.textContent = `× ${this.lrScale.toFixed(2)}`;
      blurb.textContent = this.land.blurb;
      stats.replaceChildren(
        h('tr', null, h('th', null, 'Optimiser'), h('th', null, 'Loss'), h('th', null, 'Steps'), h('th', null, 'To nearest minimum')),
        ...this.stats().map((s) => {
          const o = OPTIMIZERS.find((x) => x.id === s.id)!;
          return h('tr', { class: s.enabled ? '' : 'dim' },
            h('td', null, h('span', { class: 'swatch', style: { background: o.color } }), o.name),
            h('td', null, s.diverged ? 'diverged 💥' : s.loss.toPrecision(3)),
            h('td', null, String(s.steps)),
            h('td', null, s.dist < 0.05 ? '✓ found it' : s.dist.toFixed(2)));
        }),
      );
    };
    const unsub = this.onChange(render);

    const land = h('select', { class: 'select' }, LANDSCAPES.map((l) => h('option', { value: l.id, selected: l.id === this.land.id }, l.name)));
    land.addEventListener('change', () => this.setLandscape(land.value as LandscapeId));
    const lr = h('input', { type: 'range', min: '-1', max: '1', step: '0.05', value: String(Math.log10(this.lrScale)) });
    lr.addEventListener('input', () => { this.lrScale = 10 ** Number(lr.value); render(); });
    const speed = h('input', { type: 'range', min: '5', max: '200', step: '5', value: String(this.stepsPerSec) });
    speed.addEventListener('input', () => { this.stepsPerSec = Number(speed.value); });
    const run = h('button', { class: 'btn btn-primary', onclick: () => { this.running = !this.running; run.textContent = this.running ? '⏸ Pause' : '▶ Run'; } }, this.running ? '⏸ Pause' : '▶ Run');

    render();
    const el = h('div', { class: 'sim-panel' },
      h('header', { class: 'panel-title' },
        h('h2', null, '⛰ Gradient Descent Valley'),
        h('p', { class: 'muted' }, 'The terrain is a loss function: height = loss. Four optimisers start at the white ring and race downhill. Walk on the valley, or left-click the terrain to move the start point.'),
      ),
      h('div', { class: 'forge-controls' },
        h('label', { class: 'field' }, h('span', null, 'Landscape'), land),
        h('label', { class: 'field' }, h('span', null, 'Learning rate '), lrLabel, lr),
        h('label', { class: 'field' }, h('span', null, 'Speed (steps/s)'), speed),
      ),
      blurb,
      h('div', { class: 'feature-boxes' }, OPTIMIZERS.map((o) => {
        const cb = h('input', { type: 'checkbox', checked: this.enabled.has(o.id) });
        cb.addEventListener('change', () => {
          if (cb.checked) this.enabled.add(o.id); else this.enabled.delete(o.id);
          this.reset();
        });
        return h('label', { class: 'check' }, cb, h('span', { class: 'swatch', style: { background: o.color } }), o.name);
      })),
      h('div', { class: 'lesson-actions' }, run,
        h('button', { class: 'btn', onclick: () => this.reset() }, '↺ Restart'),
        h('button', { class: 'btn', onclick: () => this.randomStart() }, '🎲 Random start'),
      ),
      stats,
      h('details', { class: 'sim-explain' },
        h('summary', null, 'How the optimisers differ'),
        h('ul', null, OPTIMIZERS.map((o) => h('li', null, h('b', null, o.name), ': ', h('code', null, o.formula)))),
        h('p', null, 'Try the elongated bowl with plain SGD, then crank the learning rate up until it explodes — that is exactly what "loss went to NaN" means in real training.'),
      ),
    );
    return { el, destroy: unsub };
  }
}
