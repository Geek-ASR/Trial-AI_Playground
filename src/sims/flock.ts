import * as THREE from 'three';
import { DEFAULT_BOIDS, Flock, type BoidParams } from '../ai/boids';
import { h } from '../ui/dom';
import { HUB, SX, SZ } from '../world/layout';
import type { FrameInfo, SimContext, SimSystem } from './sim';

const SPECIES = [
  { name: 'gulls', body: 0xf2f4f7, wing: 0xd9dde5, n: 48 },
  { name: 'swifts', body: 0x2c2f3a, wing: 0x3b3f4d, n: 44 },
  { name: 'jays', body: 0x3e7bd8, wing: 0x2c5aa8, n: 40 },
];

/**
 * Flocks of birds that follow Craig Reynolds' boids rules. Tweak the rules at
 * the Flock Lab console in the hub, or become the hawk and scatter them.
 */
export class FlockSystem implements SimSystem {
  readonly id = 'flock';
  params: BoidParams = { ...DEFAULT_BOIDS };
  predator = false;
  private flocks: Flock[] = [];
  private bodies: THREE.InstancedMesh[] = [];
  private wingsL: THREE.InstancedMesh[] = [];
  private wingsR: THREE.InstancedMesh[] = [];
  private phase: Float32Array[] = [];
  private acc = 0;

  constructor(private ctx: SimContext) {
    const bodyGeo = new THREE.BoxGeometry(0.28, 0.22, 0.75);
    const wingGeo = new THREE.BoxGeometry(0.85, 0.05, 0.36).translate(0.42, 0, 0);
    SPECIES.forEach((sp, i) => {
      const a = (i / SPECIES.length) * Math.PI * 2;
      const f = new Flock(sp.n, HUB.x + Math.cos(a) * 60, 58, HUB.z + Math.sin(a) * 60);
      this.flocks.push(f);
      const body = new THREE.InstancedMesh(bodyGeo, new THREE.MeshLambertMaterial({ color: sp.body }), sp.n);
      const wl = new THREE.InstancedMesh(wingGeo, new THREE.MeshLambertMaterial({ color: sp.wing }), sp.n);
      const wr = new THREE.InstancedMesh(wingGeo, new THREE.MeshLambertMaterial({ color: sp.wing }), sp.n);
      for (const m of [body, wl, wr]) {
        m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        m.frustumCulled = false;
        m.castShadow = true;
        ctx.scene.add(m);
      }
      this.bodies.push(body);
      this.wingsL.push(wl);
      this.wingsR.push(wr);
      this.phase.push(Float32Array.from({ length: sp.n }, () => Math.random() * 10));
    });
  }

  update(f: FrameInfo) {
    const env = {
      ground: (x: number, z: number) => this.ctx.world.topCached(Math.floor(x), Math.floor(z)),
      minAlt: 34,
      maxAlt: 78,
      bounds: [0, SX, 0, SZ] as [number, number, number, number],
      predator: this.predator ? { x: f.player.pos.x, y: f.player.pos.y + 1.6, z: f.player.pos.z } : null,
      predatorRadius: 16,
    };
    // Boids run at a fixed 30 Hz; rendering interpolates nothing — birds are fast enough.
    this.acc += f.dt;
    const step = 1 / 30;
    let n = 0;
    while (this.acc >= step && n < 3) {
      this.acc -= step;
      n++;
      for (const fl of this.flocks) fl.step(step, this.params, env);
    }
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const qw = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const one = new THREE.Vector3(1, 1, 1);
    const fwd = new THREE.Vector3();
    const Z = new THREE.Vector3(0, 0, 1);
    const Zaxis = new THREE.Vector3(0, 0, 1);
    this.flocks.forEach((fl, k) => {
      const ph = this.phase[k];
      for (let i = 0; i < fl.n; i++) {
        pos.set(fl.pos[i * 3], fl.pos[i * 3 + 1], fl.pos[i * 3 + 2]);
        fwd.set(fl.vel[i * 3], fl.vel[i * 3 + 1], fl.vel[i * 3 + 2]).normalize();
        q.setFromUnitVectors(Z, fwd);
        m.compose(pos, q, one);
        this.bodies[k].setMatrixAt(i, m);
        ph[i] += f.dt * (9 + (fwd.y > 0 ? 6 : 0));
        const flap = Math.sin(ph[i]) * 0.7;
        qw.setFromAxisAngle(Zaxis, flap);
        m.compose(pos, q.clone().multiply(qw), one);
        this.wingsR[k].setMatrixAt(i, m);
        qw.setFromAxisAngle(Zaxis, Math.PI - flap);
        m.compose(pos, q.clone().multiply(qw), one);
        this.wingsL[k].setMatrixAt(i, m);
      }
      this.bodies[k].instanceMatrix.needsUpdate = true;
      this.wingsL[k].instanceMatrix.needsUpdate = true;
      this.wingsR[k].instanceMatrix.needsUpdate = true;
    });
  }

  order(): number {
    return this.flocks.reduce((s, f) => s + f.order(), 0) / this.flocks.length;
  }

  panel(): { el: HTMLElement; destroy(): void } {
    const orderEl = h('b');
    const timer = setInterval(() => { orderEl.textContent = `${Math.round(this.order() * 100)}%`; }, 400);
    const slider = (label: string, key: keyof BoidParams, min: number, max: number, step: number) => {
      const val = h('span', { class: 'muted small' }, String(this.params[key]));
      const input = h('input', { type: 'range', min: String(min), max: String(max), step: String(step), value: String(this.params[key]) });
      input.addEventListener('input', () => {
        (this.params[key] as number) = Number(input.value);
        val.textContent = input.value;
      });
      return h('label', { class: 'field' }, h('span', null, label, ' ', val), input);
    };
    const hawk = h('input', { type: 'checkbox', checked: this.predator });
    hawk.addEventListener('change', () => { this.predator = hawk.checked; });
    const el = h('div', { class: 'sim-panel' },
      h('header', { class: 'panel-title' },
        h('h2', null, '🐦 Flock Lab: boids'),
        h('p', { class: 'muted' }, 'Every bird follows just three local rules — no leader, no plan. The swirling flocks overhead emerge from them. This is "emergent behaviour", the same idea behind swarm robotics and multi-agent simulations.'),
      ),
      h('ol', null,
        h('li', null, h('b', null, 'Separation'), ': steer away from neighbours that are too close.'),
        h('li', null, h('b', null, 'Alignment'), ': match the average heading of nearby birds.'),
        h('li', null, h('b', null, 'Cohesion'), ': steer towards the average position of nearby birds.'),
      ),
      h('div', { class: 'forge-controls' },
        slider('Separation', 'separation', 0, 5, 0.1),
        slider('Alignment', 'alignment', 0, 4, 0.1),
        slider('Cohesion', 'cohesion', 0, 4, 0.1),
        slider('Vision radius', 'radius', 2, 20, 1),
        slider('Top speed', 'maxSpeed', 6, 30, 1),
      ),
      h('label', { class: 'check' }, hawk, '🦅 Be the hawk — birds flee from you (fly up with double-tap Space!)'),
      h('p', null, 'How aligned are the flocks right now? ', orderEl),
      h('p', { class: 'muted small' }, 'Try: alignment 0 (a swarm of gnats), cohesion 0 (birds drift apart), separation 0 (they clump into balls).'),
    );
    return { el, destroy: () => clearInterval(timer) };
  }
}
