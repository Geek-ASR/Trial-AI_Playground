import * as THREE from 'three';
import { audio } from '../audio/audio';
import { analogy, ANALOGY_PRESETS, CLUSTERS, nearest, WORDS, WORD_BY_NAME } from '../ai/embeddings';
import type { Vec3 } from '../ai/kmeans3d';
import { h } from '../ui/dom';
import { makeLabel } from '../world/labels';
import { GROUND, LAB_BY_KIND } from '../world/layout';
import { GALAXY } from './geometry';
import type { FrameInfo, SimContext, SimSystem } from './sim';

const SCALE = 1.35;

function glowTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

/**
 * The Embedding Galaxy: words as stars, meaning as direction. Analogies are
 * drawn as arrows: the same vector that takes "man" to "king" takes "woman" to "queen".
 */
export class GalaxyLab implements SimSystem {
  readonly id = 'galaxy';
  selected: string | null = null;
  lastAnalogy: { a: string; b: string; c: string; answer: string; distance: number } | null = null;
  private group = new THREE.Group();
  private stars: THREE.Sprite[] = [];
  private labels: THREE.Sprite[] = [];
  private arrows = new THREE.Group();
  private pulseWord: THREE.Sprite | null = null;
  private pulseT = 0;
  private lab = LAB_BY_KIND.get('galaxy')!;
  private listeners = new Set<() => void>();

  constructor(ctx: SimContext) {
    this.group.position.set(this.lab.x + 0.5, GROUND + GALAXY.centerV, this.lab.z + 0.5);
    const tex = glowTexture();
    for (const cl of CLUSTERS) {
      const color = new THREE.Color(cl.color);
      for (let i = 0; i < 5; i++) {
        const neb = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: color.clone().multiplyScalar(0.35), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.55 }));
        neb.position.set(...(cl.center.map((v, k) => v * SCALE + Math.sin(i * 2.1 + k) * 2.4) as Vec3));
        neb.scale.setScalar(9 + i * 1.6);
        this.group.add(neb);
      }
      const title = makeLabel([cl.name], { accent: cl.color, scale: 1.1 });
      title.position.set(cl.center[0] * SCALE, cl.center[1] * SCALE + 5, cl.center[2] * SCALE);
      this.group.add(title);
    }
    for (const w of WORDS) {
      const color = new THREE.Color(CLUSTERS.find((c) => c.id === w.cluster)!.color);
      const star = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: color.clone().multiplyScalar(3), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      star.position.set(w.pos[0] * SCALE, w.pos[1] * SCALE, w.pos[2] * SCALE);
      star.scale.setScalar(0.9);
      star.userData.word = w.word;
      this.stars.push(star);
      const label = makeLabel([w.word], { accent: CLUSTERS.find((c) => c.id === w.cluster)!.color, scale: 0.45 });
      label.position.copy(star.position).add(new THREE.Vector3(0, 0.75, 0));
      this.labels.push(label);
      this.group.add(star, label);
    }
    this.group.add(this.arrows);
    ctx.scene.add(this.group);
  }

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private changed() {
    this.listeners.forEach((l) => l());
  }

  private starOf(word: string) {
    return this.stars.find((s) => s.userData.word === word) ?? null;
  }

  private arrow(from: THREE.Vector3, to: THREE.Vector3, color: THREE.Color, dashed = false) {
    const dir = to.clone().sub(from);
    const len = dir.length();
    if (len < 0.01) return;
    const mat = new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(2.2), transparent: dashed, opacity: dashed ? 0.6 : 1 });
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, len - 0.6, 6), mat);
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.6, 10), mat);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    shaft.quaternion.copy(q);
    head.quaternion.copy(q);
    shaft.position.copy(from).addScaledVector(dir, (len - 0.6) / 2 / len);
    head.position.copy(from).addScaledVector(dir, (len - 0.3) / len);
    this.arrows.add(shaft, head);
  }

  private clearArrows() {
    for (const c of [...this.arrows.children]) {
      this.arrows.remove(c);
      (c as THREE.Mesh).geometry.dispose();
    }
  }

  showAnalogy(a: string, b: string, c: string) {
    const r = analogy(a, b, c);
    if (!r) return;
    this.clearArrows();
    const P = (w: string) => this.starOf(w)!.position.clone();
    const orange = new THREE.Color(1, 0.6, 0.2);
    this.arrow(P(b), P(a), orange);
    const target = new THREE.Vector3(r.target[0] * SCALE, r.target[1] * SCALE, r.target[2] * SCALE);
    this.arrow(P(c), target, orange, true);
    this.pulseWord = this.starOf(r.answer.word);
    this.pulseT = 0;
    this.selected = null;
    this.lastAnalogy = { a, b, c, answer: r.answer.word, distance: r.distance };
    audio.success();
    this.changed();
  }

  showNeighbours(word: string) {
    const w = WORD_BY_NAME.get(word);
    if (!w) return;
    this.clearArrows();
    const from = this.starOf(word)!.position;
    for (const n of nearest(word, 5)) this.arrow(from.clone(), this.starOf(n.word.word)!.position.clone(), new THREE.Color(0.5, 0.9, 1));
    this.selected = word;
    this.pulseWord = this.starOf(word);
    this.pulseT = 0;
    this.changed();
  }

  update(f: FrameInfo) {
    const p = f.focus;
    const d = Math.hypot(p.x - this.lab.x, p.z - this.lab.z);
    this.group.visible = d < 170;
    if (!this.group.visible) return;
    this.group.rotation.y += f.dt * 0.012;
    const cam = f.camera.position;
    const tmp = new THREE.Vector3();
    this.labels.forEach((l) => {
      l.getWorldPosition(tmp);
      const dd = tmp.distanceTo(cam);
      (l.material as THREE.SpriteMaterial).opacity = Math.max(0, Math.min(1, (60 - dd) / 25));
      l.visible = dd < 60;
    });
    if (this.pulseWord) {
      this.pulseT += f.dt;
      this.pulseWord.scale.setScalar(0.9 + Math.abs(Math.sin(this.pulseT * 4)) * 1.6);
    }
  }

  /** Click a star to see its nearest neighbours. */
  pointer(kind: 'down' | 'up' | 'move', button: number, ray: THREE.Ray): boolean {
    if (kind !== 'down' || button !== 0 || !this.group.visible) return false;
    let best: THREE.Sprite | null = null, bd = 0.9;
    const tmp = new THREE.Vector3();
    for (const s of this.stars) {
      s.getWorldPosition(tmp);
      if (tmp.distanceTo(ray.origin) > 80) continue;
      const d = ray.distanceToPoint(tmp);
      if (d < bd) { bd = d; best = s; }
    }
    if (!best) return false;
    this.showNeighbours(best.userData.word);
    return true;
  }

  panel(): { el: HTMLElement; destroy(): void } {
    const words = [...WORDS].sort((x, y) => x.word.localeCompare(y.word)).map((w) => w.word);
    const sel = (value: string) => h('select', { class: 'select' }, words.map((w) => h('option', { value: w, selected: w === value }, w)));
    const [A, Bs, C] = [sel('king'), sel('man'), sel('woman')];
    const result = h('div', { class: 'analogy-result' });
    const render = () => {
      const r = this.lastAnalogy;
      if (this.selected) {
        result.replaceChildren(h('p', null, h('b', null, this.selected), ' — nearest neighbours: ', nearest(this.selected, 5).map((n) => `${n.word.word} (${n.distance.toFixed(1)})`).join(', ')));
      } else if (r) {
        result.replaceChildren(h('p', { class: 'big' }, `${r.a} − ${r.b} + ${r.c} ≈ `, h('b', null, r.answer)), h('p', { class: 'muted small' }, `Distance from the exact point: ${r.distance.toFixed(2)}. Look up: the arrows show the same "direction of meaning" applied twice.`));
      } else {
        result.replaceChildren(h('p', { class: 'muted' }, 'Pick a preset or build your own analogy.'));
      }
    };
    const unsub = this.onChange(render);
    render();
    const el = h('div', { class: 'sim-panel' },
      h('header', { class: 'panel-title' },
        h('h2', null, '🌌 Embedding Galaxy'),
        h('p', { class: 'muted' }, 'Language models turn every word into a vector — a point in space — so that similar meanings sit close together and relationships become directions. Climb the lighthouse (or fly) into the galaxy above. Click any star to see its nearest neighbours.'),
      ),
      h('div', { class: 'chips' }, ANALOGY_PRESETS.map(([a, b, c]) => h('button', { class: 'chip-btn', onclick: () => this.showAnalogy(a, b, c) }, `${a} − ${b} + ${c}`))),
      h('div', { class: 'analogy-builder' }, A, h('span', null, '−'), Bs, h('span', null, '+'), C,
        h('button', { class: 'btn btn-primary', onclick: () => this.showAnalogy(A.value, Bs.value, C.value) }, '= ?')),
      result,
      h('details', { class: 'sim-explain' },
        h('summary', null, 'Honest footnote'),
        h('p', null, 'Real embeddings (word2vec, GloVe, the input layer of every LLM) have hundreds or thousands of dimensions and are learned from billions of words. This galaxy is hand-built in 3-D so you can walk through it, but the geometry is the same idea: "royalty", "female", "past tense" and "capital city" are consistent directions, so vector arithmetic lands on the right word.'),
      ),
    );
    return { el, destroy: unsub };
  }
}
