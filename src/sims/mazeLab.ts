import * as THREE from 'three';
import { audio } from '../audio/audio';
import { ACTIONS, Cell, GridWorld, QTable } from '../ai/qlearning';
import { h } from '../ui/dom';
import { B, isSolid } from '../world/blocks';
import { GROUND, LAB_BY_KIND } from '../world/layout';
import { MAZE_CELL, MAZE_MAP, MAZE_N, mazeCellOrigin } from './geometry';
import type { FrameInfo, SimContext, SimSystem } from './sim';

type Speed = 'watch' | 'fast' | 'turbo';

interface Agent {
  group: THREE.Group;
  state: number;
  from: THREE.Vector3;
  to: THREE.Vector3;
  t: number;
  steps: number;
  facing: number;
}

/**
 * Q-Learning Maze: robots learn the arena by trial and error. The floor glows
 * with the learned value of each cell and arrows show the current policy.
 * The maze is read from real blocks — rebuild it and watch them adapt.
 */
export class MazeLab implements SimSystem {
  readonly id = 'maze';
  env = GridWorld.fromMap(MAZE_MAP);
  q = new QTable(MAZE_N * MAZE_N);
  alpha = 0.5;
  gamma = 0.97;
  epsilon = 1;
  speed: Speed = 'watch';
  running = true;
  showValues = true;
  showPolicy = true;
  episodes = 0;
  history: boolean[] = [];
  lastSteps: number[] = [];
  private agents: Agent[] = [];
  private tiles: THREE.InstancedMesh;
  private arrows: THREE.InstancedMesh;
  private group = new THREE.Group();
  private envDirty = true;
  private lab = LAB_BY_KIND.get('maze')!;
  private listeners = new Set<() => void>();
  private overlayTimer = 0;

  constructor(private ctx: SimContext) {
    const n = MAZE_N * MAZE_N;
    this.tiles = new THREE.InstancedMesh(new THREE.PlaneGeometry(MAZE_CELL * 0.96, MAZE_CELL * 0.96).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.6, depthWrite: false }), n);
    this.arrows = new THREE.InstancedMesh(arrowGeometry(), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.2, 2.2), side: THREE.DoubleSide }), n);
    const m = new THREE.Matrix4();
    for (let s = 0; s < n; s++) this.tiles.setMatrixAt(s, m.makeTranslation(...this.cellCenter(s, 1.03)));
    this.tiles.renderOrder = 3;
    this.group.add(this.tiles, this.arrows);
    for (let i = 0; i < 4; i++) {
      const g = robot(new THREE.Color().setHSL(0.55 + i * 0.1, 0.8, 0.6));
      this.group.add(g);
      const a: Agent = { group: g, state: this.env.start, from: new THREE.Vector3(), to: new THREE.Vector3(), t: 1, steps: 0, facing: 0 };
      this.placeAgent(a, a.state);
      this.agents.push(a);
    }
    ctx.scene.add(this.group);
    this.readEnv();
    this.drawOverlay();
  }

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private changed() {
    this.listeners.forEach((l) => l());
  }

  private cellCenter(s: number, lift: number): [number, number, number] {
    const r = Math.floor(s / MAZE_N), c = s % MAZE_N;
    const o = mazeCellOrigin(r, c);
    return [o.x + MAZE_CELL / 2, GROUND + lift, o.z + MAZE_CELL / 2];
  }

  /** Rebuild the grid world from the actual blocks in the arena. */
  readEnv() {
    const w = this.ctx.world;
    let start = this.env.start;
    for (let r = 0; r < MAZE_N; r++)
      for (let c = 0; c < MAZE_N; c++) {
        const o = mazeCellOrigin(r, c);
        let wall = false, lava = false, goal = false, spawn = false;
        for (let dx = 0; dx < MAZE_CELL; dx++)
          for (let dz = 0; dz < MAZE_CELL; dz++) {
            const floor = w.get(o.x + dx, GROUND, o.z + dz);
            if (isSolid(w.get(o.x + dx, GROUND + 1, o.z + dz)) && w.get(o.x + dx, GROUND + 1, o.z + dz) !== B.GOLD) wall = true;
            if (floor === B.MAGMA) lava = true;
            if (floor === B.GOLD || w.get(o.x + dx, GROUND + 1, o.z + dz) === B.GOLD) goal = true;
            if (floor === B.CYAN) spawn = true;
          }
        const s = r * MAZE_N + c;
        this.env.cells[s] = wall ? Cell.Wall : lava ? Cell.Lava : goal ? Cell.Goal : Cell.Floor;
        if (spawn) start = s;
      }
    this.env.start = start;
    this.envDirty = false;
  }

  onEdit(x: number, y: number, z: number) {
    const o = mazeCellOrigin(0, 0);
    if (x >= o.x - 1 && z >= o.z - 1 && x <= o.x + MAZE_N * MAZE_CELL && z <= o.z + MAZE_N * MAZE_CELL && y >= GROUND && y <= GROUND + 3) {
      this.envDirty = true;
    }
  }

  resetBrain() {
    this.q.reset();
    this.epsilon = 1;
    this.episodes = 0;
    this.history = [];
    this.lastSteps = [];
    for (const a of this.agents) this.respawn(a);
    this.drawOverlay();
    this.changed();
  }

  resetMaze() {
    const ops: { x: number; y: number; z: number; b: number }[] = [];
    for (let r = 0; r < MAZE_N; r++)
      for (let c = 0; c < MAZE_N; c++) {
        const o = mazeCellOrigin(r, c);
        const ch = MAZE_MAP[r][c];
        for (let dx = 0; dx < MAZE_CELL; dx++)
          for (let dz = 0; dz < MAZE_CELL; dz++) {
            for (let v = 1; v <= 3; v++) ops.push({ x: o.x + dx, y: GROUND + v, z: o.z + dz, b: ch === '#' && v === 1 ? B.BRICK : B.AIR });
            if (ch !== '#') {
              const floor = ch === '~' ? B.MAGMA : ch === 'G' ? B.GOLD : ch === 'S' ? B.CYAN : (r + c) % 2 ? B.QUARTZ : B.WHITE;
              ops.push({ x: o.x + dx, y: GROUND, z: o.z + dz, b: floor });
            }
          }
      }
    this.ctx.setBlocks(ops);
    this.envDirty = true;
  }

  private placeAgent(a: Agent, s: number) {
    const [x, y, z] = this.cellCenter(s, 1);
    a.from.set(x, y, z);
    a.to.set(x, y, z);
    a.group.position.set(x, y, z);
    a.t = 1;
  }

  private respawn(a: Agent) {
    a.state = this.env.start;
    a.steps = 0;
    this.placeAgent(a, a.state);
  }

  /** One learning step for one agent. Returns true if the episode ended. */
  private learnStep(a: Agent, animate: boolean): boolean {
    const s = a.state;
    const act = this.q.choose(s, this.epsilon);
    const { next, reward, done } = this.env.step(s, act);
    this.q.update(s, act, reward, next, done, this.alpha, this.gamma);
    a.steps++;
    a.facing = act;
    if (animate) {
      a.from.copy(a.group.position);
      const [x, y, z] = this.cellCenter(next, 1);
      a.to.set(x, y, z);
      a.t = 0;
    }
    a.state = next;
    if (done || a.steps >= 300) {
      const success = done && this.env.cells[next] === Cell.Goal;
      this.episodes++;
      this.history.push(success);
      if (this.history.length > 200) this.history.shift();
      if (success) {
        this.lastSteps.push(a.steps);
        if (this.lastSteps.length > 50) this.lastSteps.shift();
      }
      this.epsilon = Math.max(0.05, this.epsilon * 0.992);
      if (animate) {
        const [x, y, z] = this.cellCenter(next, 1.4);
        const n = success ? 24 : 14;
        for (let i = 0; i < n; i++) {
          this.ctx.glow.spawn({
            x, y, z, vx: (Math.random() - 0.5) * 5, vy: 2 + Math.random() * 4, vz: (Math.random() - 0.5) * 5,
            r: success ? 3 : 1, g: success ? 2.4 : 0.9, b: success ? 0.5 : 0.8, size: 0.12, life: 0.9, gravity: 6, drag: 1,
          });
        }
        if (success) audio.beep(true);
        setTimeout(() => this.respawn(a), 350);
        a.steps = 0;
        a.state = this.env.start;
        return true;
      }
      a.steps = 0;
      a.state = this.env.start;
      return true;
    }
    return false;
  }

  update(f: FrameInfo) {
    const p = f.focus;
    const d = Math.hypot(p.x - this.lab.x, p.z - this.lab.z);
    this.group.visible = d < 150;
    if (d > 150) return;
    if (this.envDirty) this.readEnv();
    if (this.running) {
      if (this.speed === 'watch') {
        for (const a of this.agents) {
          if (a.t < 1) continue;
          this.learnStep(a, true);
        }
      } else {
        const n = this.speed === 'fast' ? 25 : 500;
        for (let i = 0; i < n; i++) for (const a of this.agents) this.learnStep(a, false);
        for (const a of this.agents) this.placeAgent(a, a.state);
      }
    }
    for (const a of this.agents) {
      if (a.t < 1) {
        a.t = Math.min(1, a.t + f.dt * 3.5);
        a.group.position.lerpVectors(a.from, a.to, a.t);
        a.group.position.y += Math.sin(a.t * Math.PI) * 0.45;
      }
      const [dr, dc] = ACTIONS[a.facing];
      a.group.rotation.y = Math.atan2(dc, dr);
      (a.group.userData.tip as THREE.Mesh).visible = Math.sin(f.time * 8) > 0;
    }
    this.overlayTimer -= f.dt;
    if (this.overlayTimer <= 0) {
      this.overlayTimer = 0.25;
      this.drawOverlay();
      this.changed();
    }
  }

  private drawOverlay() {
    const c = new THREE.Color();
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const n = MAZE_N * MAZE_N;
    let maxAbs = 1e-6;
    for (let s = 0; s < n; s++) if (this.env.cells[s] === Cell.Floor) maxAbs = Math.max(maxAbs, Math.abs(this.q.value(s)));
    for (let s = 0; s < n; s++) {
      const cell = this.env.cells[s];
      const v = this.q.value(s) / maxAbs;
      if (cell !== Cell.Floor || !this.showValues) c.setRGB(0, 0, 0);
      else if (v >= 0) c.setRGB(0.2 * v, 1.6 * v, 0.6 * v);
      else c.setRGB(-1.6 * v, 0.15 * -v, 0.2 * -v);
      this.tiles.setColorAt(s, c);
      const [x, y, z] = this.cellCenter(s, 1.08);
      const best = this.q.best(s);
      const o = s * 4;
      const qs = [this.q.q[o], this.q.q[o + 1], this.q.q[o + 2], this.q.q[o + 3]];
      const spread = Math.max(...qs) - Math.min(...qs);
      const show = this.showPolicy && cell === Cell.Floor && spread > 1e-4;
      const [dr, dc] = ACTIONS[best];
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(dc, dr));
      const sc = show ? 0.5 + Math.min(1, spread / (maxAbs * 0.5)) * 0.6 : 0.0001;
      m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(sc, 1, sc));
      this.arrows.setMatrixAt(s, m);
    }
    if (this.tiles.instanceColor) this.tiles.instanceColor.needsUpdate = true;
    this.arrows.instanceMatrix.needsUpdate = true;
  }

  successRate(): number {
    const last = this.history.slice(-50);
    return last.length ? last.filter(Boolean).length / last.length : 0;
  }

  panel(): { el: HTMLElement; destroy(): void } {
    const chart = h('canvas', { class: 'sim-chart', width: 460, height: 120 });
    const stats = h('p', { class: 'muted small' });
    const render = () => {
      const avg = this.lastSteps.length ? this.lastSteps.reduce((a, b) => a + b, 0) / this.lastSteps.length : 0;
      const best = this.env.shortestPath();
      stats.textContent = `${this.episodes} episodes · success rate (last 50): ${Math.round(this.successRate() * 100)}% · average route ${avg ? avg.toFixed(1) : '—'} steps (shortest possible: ${best > 0 ? best : 'no route!'}) · exploration ε = ${this.epsilon.toFixed(2)}`;
      drawHistory(chart, this.history);
    };
    const unsub = this.onChange(render);
    const speed = h('select', { class: 'select' },
      h('option', { value: 'watch', selected: this.speed === 'watch' }, '🐢 Watch each step'),
      h('option', { value: 'fast', selected: this.speed === 'fast' }, '🐇 Fast'),
      h('option', { value: 'turbo', selected: this.speed === 'turbo' }, '🚀 Turbo'),
    );
    speed.addEventListener('change', () => { this.speed = speed.value as Speed; for (const a of this.agents) this.placeAgent(a, a.state); });
    const alpha = h('input', { type: 'range', min: '0.05', max: '1', step: '0.05', value: String(this.alpha) });
    alpha.addEventListener('input', () => { this.alpha = Number(alpha.value); });
    const gamma = h('input', { type: 'range', min: '0.5', max: '0.99', step: '0.01', value: String(this.gamma) });
    gamma.addEventListener('input', () => { this.gamma = Number(gamma.value); });
    const vals = h('input', { type: 'checkbox', checked: this.showValues });
    vals.addEventListener('change', () => { this.showValues = vals.checked; this.drawOverlay(); });
    const pol = h('input', { type: 'checkbox', checked: this.showPolicy });
    pol.addEventListener('change', () => { this.showPolicy = pol.checked; this.drawOverlay(); });
    const run = h('button', { class: 'btn btn-primary', onclick: () => { this.running = !this.running; run.textContent = this.running ? '⏸ Pause' : '▶ Run'; } }, this.running ? '⏸ Pause' : '▶ Run');
    render();
    const el = h('div', { class: 'sim-panel' },
      h('header', { class: 'panel-title' },
        h('h2', null, '🤖 Q-Learning Maze'),
        h('p', { class: 'muted' }, 'Four robots share one brain: a table Q(cell, move) of how good each move is. Every step they nudge it towards "reward now + discounted value of where I landed". Green floor = cells they now know lead to the gold; red = danger; arrows = what they would do.'),
      ),
      h('div', { class: 'lesson-actions' }, run,
        h('button', { class: 'btn', onclick: () => this.resetBrain() }, '🧽 Wipe their memory'),
        h('button', { class: 'btn btn-ghost', onclick: () => this.resetMaze() }, '↺ Restore the maze'),
      ),
      h('div', { class: 'forge-controls' },
        h('label', { class: 'field' }, h('span', null, 'Speed'), speed),
        h('label', { class: 'field' }, h('span', null, 'Learning rate α'), alpha),
        h('label', { class: 'field' }, h('span', null, 'Patience γ'), gamma),
      ),
      h('div', { class: 'feature-boxes' }, h('label', { class: 'check' }, vals, 'Value heat-map'), h('label', { class: 'check' }, pol, 'Policy arrows')),
      stats,
      chart,
      h('details', { class: 'sim-explain', open: true },
        h('summary', null, 'Be the environment designer'),
        h('ul', null,
          h('li', null, 'Break a brick wall to open a shortcut — the green "value" flows through the gap within a few hundred episodes.'),
          h('li', null, 'Place bricks to block their favourite route, then switch to Turbo and watch them find another.'),
          h('li', null, 'Pick up magma (middle-click it) and pour a new lava pit, or place a gold block to add a second goal.'),
          h('li', null, 'Set γ low and the robots become short-sighted: value only glows right next to the goal.'),
        ),
      ),
    );
    return { el, destroy: unsub };
  }
}

function arrowGeometry(): THREE.BufferGeometry {
  // A flat arrow pointing along +Z (row direction), sitting just above the floor.
  const shape = new THREE.Shape();
  shape.moveTo(-0.12, -0.45);
  shape.lineTo(0.12, -0.45);
  shape.lineTo(0.12, 0.05);
  shape.lineTo(0.32, 0.05);
  shape.lineTo(0, 0.5);
  shape.lineTo(-0.32, 0.05);
  shape.lineTo(-0.12, 0.05);
  shape.closePath();
  const g = new THREE.ShapeGeometry(shape);
  g.rotateX(Math.PI / 2);
  return g;
}

function robot(color: THREE.Color): THREE.Group {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.6, 0.8), bodyMat);
  body.position.y = 0.35;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.45, 0.6), new THREE.MeshLambertMaterial({ color: 0xe8ecf4 }));
  head.position.y = 0.88;
  const eyeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 3, 3.2) });
  for (const x of [-0.14, 0.14]) {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.05), eyeMat);
    eye.position.set(x, 0.92, 0.31);
    g.add(eye);
  }
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.3), bodyMat);
  antenna.position.y = 1.25;
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.07), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.6, 0.6) }));
  tip.position.y = 1.42;
  g.add(body, head, antenna, tip);
  g.userData.tip = tip;
  g.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
  return g;
}

function drawHistory(c: HTMLCanvasElement, hist: boolean[]) {
  const ctx = c.getContext('2d')!;
  const W = c.width, H = c.height;
  ctx.clearRect(0, 0, W, H);
  if (hist.length < 2) return;
  const rate: number[] = [];
  for (let i = 0; i < hist.length; i++) {
    const win = hist.slice(Math.max(0, i - 19), i + 1);
    rate.push(win.filter(Boolean).length / win.length);
  }
  ctx.strokeStyle = '#3ddc97';
  ctx.lineWidth = 2;
  ctx.beginPath();
  rate.forEach((r, i) => {
    const x = (i / (rate.length - 1)) * W, y = H - 6 - r * (H - 12);
    if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
  });
  ctx.stroke();
  ctx.fillStyle = '#9ba2cf';
  ctx.font = '11px Inter, sans-serif';
  ctx.fillText('success rate over recent episodes', 8, 14);
}
