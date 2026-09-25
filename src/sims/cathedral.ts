import * as THREE from 'three';
import { audio } from '../audio/audio';
import { decodeSample, DIGIT_SIZE, forward, preprocess, type DigitModel, type Forward } from '../ai/digits';
import { h } from '../ui/dom';
import { makeLabel, updateLabel } from '../world/labels';
import { LAB_BY_KIND } from '../world/layout';
import { CATHEDRAL, labFrame } from './geometry';
import type { FrameInfo, SimContext, SimSystem } from './sim';

const N = DIGIT_SIZE;
const LINKS_IN = 700;

interface LayerView {
  mesh: THREE.InstancedMesh;
  positions: THREE.Vector3[];
  shown: Float32Array;
  target: Float32Array;
  delay: number;
}

/**
 * The Neural Cathedral: paint a digit on a giant canvas and watch a real
 * MNIST-trained network (256 → 32 → 16 → 10) light up, layer by layer.
 */
export class Cathedral implements SimSystem {
  readonly id = 'cathedral';
  ink: Float32Array = new Float32Array(N * N);
  model: DigitModel | null = null;
  samples: { label: number; img: string }[] = [];
  result: Forward | null = null;
  personal = { right: 0, wrong: 0 };
  private group = new THREE.Group();
  private canvas: THREE.InstancedMesh;
  private canvasPlane = new THREE.Plane();
  private toLocal = new THREE.Matrix4();
  private layers: LayerView[] = [];
  private links: THREE.LineSegments[] = [];
  private label: THREE.Sprite;
  private bars: THREE.InstancedMesh;
  private pulse = 0;
  private idle = 0;
  private dirty = false;
  private lab = LAB_BY_KIND.get('cathedral')!;
  private listeners = new Set<() => void>();
  private loading: Promise<void> | null = null;

  constructor(ctx: SimContext) {
    const fr = labFrame('cathedral');
    const o = fr.world(0, 0, 0);
    this.group.position.set(o.x + 0.5, o.y, o.z + 0.5);
    // Local +Z points at the viewer; local −Z runs into the hall.
    this.group.rotation.y = fr.yaw;

    const cell = CATHEDRAL.cell;
    const backing = new THREE.Mesh(new THREE.BoxGeometry(N * cell + 0.6, N * cell + 0.6, 0.2), new THREE.MeshLambertMaterial({ color: 0x1a1e38 }));
    backing.position.set(0, CATHEDRAL.canvasV + (N * cell) / 2, -CATHEDRAL.canvasW - 0.15);
    backing.castShadow = true;
    this.canvas = new THREE.InstancedMesh(new THREE.BoxGeometry(cell * 0.94, cell * 0.94, 0.12), new THREE.MeshBasicMaterial(), N * N);
    const m = new THREE.Matrix4();
    for (let j = 0; j < N; j++)
      for (let i = 0; i < N; i++) {
        const x = (i - N / 2 + 0.5) * cell;
        const y = CATHEDRAL.canvasV + (N - j - 0.5) * cell;
        this.canvas.setMatrixAt(j * N + i, m.makeTranslation(x, y, -CATHEDRAL.canvasW));
      }
    this.group.add(backing, this.canvas);

    // Neuron layers float up and back from the canvas.
    CATHEDRAL.layers.forEach((L, li) => {
      const geo = li === 2 ? new THREE.BoxGeometry(0.9, 0.9, 0.9) : new THREE.IcosahedronGeometry(0.42, 1);
      const mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial(), L.n);
      const rows = Math.ceil(L.n / L.cols);
      const positions: THREE.Vector3[] = [];
      for (let k = 0; k < L.n; k++) {
        const c = k % L.cols, r = Math.floor(k / L.cols);
        const p = new THREE.Vector3((c - (L.cols - 1) / 2) * L.gap, L.v + ((rows - 1) / 2 - r) * L.gap, -L.w);
        positions.push(p);
        mesh.setMatrixAt(k, m.makeTranslation(p.x, p.y, p.z));
      }
      this.group.add(mesh);
      this.layers.push({ mesh, positions, shown: new Float32Array(L.n), target: new Float32Array(L.n), delay: 0.18 * (li + 1) });
    });

    // Synapses between layers.
    const sizes = [LINKS_IN, 32 * 16, 16 * 10];
    for (const s of sizes) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(s * 6), 3));
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(s * 6), 3));
      g.setDrawRange(0, 0);
      const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.9 }));
      l.frustumCulled = false;
      this.links.push(l);
      this.group.add(l);
    }

    // Probability bars under the output neurons, and digit labels.
    const out = this.layers[2];
    this.bars = new THREE.InstancedMesh(new THREE.BoxGeometry(0.7, 1, 0.7), new THREE.MeshBasicMaterial(), 10);
    this.group.add(this.bars);
    out.positions.forEach((p, d) => {
      const s = makeLabel([String(d)], { accent: '#7ef9ff', scale: 0.9 });
      s.position.set(p.x, p.y + 1.2, p.z);
      this.group.add(s);
    });
    this.label = makeLabel(['Draw a digit ✍', 'on the canvas below'], { accent: '#ffc53d', scale: 2.2 });
    this.label.position.set(0, 21, -CATHEDRAL.layers[2].w);
    this.group.add(this.label);
    ctx.scene.add(this.group);
    this.group.updateMatrixWorld(true);
    const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(this.group.quaternion);
    const point = new THREE.Vector3(0, 0, -CATHEDRAL.canvasW + 0.07).applyMatrix4(this.group.matrixWorld);
    this.canvasPlane.setFromNormalAndCoplanarPoint(normal, point);
    this.toLocal.copy(this.group.matrixWorld).invert();
    this.drawCanvas();
  }

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private changed() {
    this.listeners.forEach((l) => l());
  }

  /** The 62 KB model is only fetched when someone comes to the cathedral. */
  private ensureModel() {
    this.loading ??= Promise.all([import('./data/digits-model.json'), import('./data/digits-samples.json')]).then(([m, s]) => {
      this.model = m.default as unknown as DigitModel;
      this.samples = s.default as { label: number; img: string }[];
      this.changed();
      if (this.ink.some((v) => v > 0)) this.infer();
    });
  }

  clear() {
    this.ink.fill(0);
    this.result = null;
    this.drawCanvas();
    for (const L of this.layers) L.target.fill(0);
    for (const l of this.links) l.geometry.setDrawRange(0, 0);
    updateLabel(this.label, ['Draw a digit ✍', 'on the canvas below'], { accent: '#ffc53d', scale: 2.2 });
    this.changed();
  }

  /** Paint (value > 0) or erase at cell (i, j) with a soft brush. */
  paint(i: number, j: number, erase = false) {
    for (let dj = -1; dj <= 1; dj++)
      for (let di = -1; di <= 1; di++) {
        const x = i + di, y = j + dj;
        if (x < 0 || y < 0 || x >= N || y >= N) continue;
        const k = y * N + x;
        const w = di === 0 && dj === 0 ? 1 : di === 0 || dj === 0 ? 0.45 : 0.15;
        this.ink[k] = erase ? Math.max(0, this.ink[k] - w) : Math.max(this.ink[k], w);
      }
    this.drawCanvas();
    this.dirty = true;
  }

  showSample() {
    if (!this.samples.length) return;
    const s = this.samples[Math.floor(Math.random() * this.samples.length)];
    this.ink = decodeSample(s.img);
    this.drawCanvas();
    this.infer();
  }

  private drawCanvas() {
    const c = new THREE.Color();
    for (let k = 0; k < N * N; k++) {
      const v = this.ink[k];
      c.setRGB(0.12 + v * 1.9, 0.14 + v * 2.3, 0.26 + v * 2.6);
      this.canvas.setColorAt(k, c);
    }
    if (this.canvas.instanceColor) this.canvas.instanceColor.needsUpdate = true;
  }

  infer() {
    if (!this.model) {
      this.ensureModel();
      return;
    }
    this.dirty = false;
    const input = preprocess(this.ink, N, N);
    if (!input.some((v) => v > 0)) {
      this.clear();
      return;
    }
    const r = forward(this.model, input);
    this.result = r;
    const norm = (a: Float32Array) => {
      const max = Math.max(1e-6, ...a);
      return a.map((v) => v / max);
    };
    this.layers[0].target.set(norm(r.acts[1]));
    this.layers[1].target.set(norm(r.acts[2]));
    this.layers[2].target.set(r.probs);
    this.pulse = 0;
    this.buildLinks(r);
    const conf = r.probs[r.prediction];
    updateLabel(this.label, [`I think it's a ${r.prediction}`, `${Math.round(conf * 100)}% sure`], { accent: conf > 0.8 ? '#3ddc97' : '#ffc53d', scale: 2.2 });
    audio.beep(conf > 0.8);
    this.changed();
  }

  /** Light the strongest connections: brightness = |weight × activation|. */
  private buildLinks(r: Forward) {
    const model = this.model!;
    const inputPos = (k: number) => {
      const i = k % N, j = Math.floor(k / N);
      return new THREE.Vector3((i - N / 2 + 0.5) * CATHEDRAL.cell, CATHEDRAL.canvasV + (N - j - 0.5) * CATHEDRAL.cell, -CATHEDRAL.canvasW);
    };
    const layerFrom = [(k: number) => inputPos(k), (k: number) => this.layers[0].positions[k], (k: number) => this.layers[1].positions[k]];
    const layerTo = [this.layers[0].positions, this.layers[1].positions, this.layers[2].positions];
    for (let l = 0; l < 3; l++) {
      const nIn = model.arch[l], nOut = model.arch[l + 1];
      const W = model.weights[l];
      const a = r.acts[l];
      const cand: { i: number; j: number; v: number }[] = [];
      for (let j = 0; j < nOut; j++)
        for (let i = 0; i < nIn; i++) {
          const v = W[j * nIn + i] * a[i];
          if (v !== 0) cand.push({ i, j, v });
        }
      cand.sort((x, y) => Math.abs(y.v) - Math.abs(x.v));
      const keep = cand.slice(0, l === 0 ? LINKS_IN : nIn * nOut);
      const max = Math.abs(keep[0]?.v ?? 1) || 1;
      const g = this.links[l].geometry;
      const pos = g.getAttribute('position') as THREE.BufferAttribute;
      const col = g.getAttribute('color') as THREE.BufferAttribute;
      keep.forEach((c, n) => {
        const A = layerFrom[l](c.i), B = layerTo[l][c.j];
        pos.setXYZ(n * 2, A.x, A.y, A.z);
        pos.setXYZ(n * 2 + 1, B.x, B.y, B.z);
        const k = Math.min(1, Math.abs(c.v) / max) ** 0.8 * 1.6;
        const [cr, cg, cb] = c.v > 0 ? [1.0, 0.55, 0.15] : [0.2, 0.45, 1.0];
        col.setXYZ(n * 2, cr * k * 0.4, cg * k * 0.4, cb * k * 0.4);
        col.setXYZ(n * 2 + 1, cr * k, cg * k, cb * k);
      });
      pos.needsUpdate = true;
      col.needsUpdate = true;
      g.setDrawRange(0, keep.length * 2);
    }
  }

  update(f: FrameInfo) {
    const p = f.focus;
    const d = Math.hypot(p.x - this.lab.x, p.z - this.lab.z);
    this.group.visible = d < 150;
    if (d < 70) this.ensureModel();
    if (d > 150) return;
    this.idle += f.dt;
    if (this.dirty && this.idle > 0.12) this.infer();
    this.pulse += f.dt;
    const c = new THREE.Color();
    const m = new THREE.Matrix4();
    this.layers.forEach((L, li) => {
      const t = Math.max(0, Math.min(1, (this.pulse - L.delay) / 0.25));
      for (let k = 0; k < L.shown.length; k++) {
        L.shown[k] += (L.target[k] * (t > 0 ? 1 : 0) - L.shown[k]) * Math.min(1, f.dt * 8);
        const v = L.shown[k];
        const win = li === 2 && this.result && k === this.result.prediction;
        if (win) c.setRGB(2.5 + v * 2, 1.9 + v * 1.4, 0.4);
        else c.setRGB(0.1 + v * 0.8, 0.16 + v * 2.2, 0.35 + v * 2.8);
        L.mesh.setColorAt(k, c);
      }
      if (L.mesh.instanceColor) L.mesh.instanceColor.needsUpdate = true;
    });
    // Output bars grow with probability.
    const out = this.layers[2];
    out.positions.forEach((pos, k) => {
      const v = out.shown[k];
      const hgt = 0.05 + v * 5;
      m.compose(new THREE.Vector3(pos.x, pos.y - 1 - hgt / 2 - 0.3, pos.z), new THREE.Quaternion(), new THREE.Vector3(1, hgt, 1));
      this.bars.setMatrixAt(k, m);
      const win = this.result && k === this.result.prediction;
      this.bars.setColorAt(k, c.setRGB(win ? 3 : 0.4, win ? 2.2 : 1.2, win ? 0.5 : 1.8));
    });
    this.bars.instanceMatrix.needsUpdate = true;
    if (this.bars.instanceColor) this.bars.instanceColor.needsUpdate = true;
    // Synapses pulse in as the signal arrives.
    this.links.forEach((l, i) => {
      (l.material as THREE.LineBasicMaterial).opacity = Math.max(0, Math.min(0.9, (this.pulse - 0.1 * i) * 3));
    });
  }

  pointer(kind: 'down' | 'up' | 'move', button: number, ray: THREE.Ray): boolean {
    if (kind === 'up') return false;
    const hit = ray.intersectPlane(this.canvasPlane, new THREE.Vector3());
    if (!hit || hit.distanceTo(ray.origin) > 14) return false;
    const local = hit.applyMatrix4(this.toLocal);
    const i = Math.floor(local.x / CATHEDRAL.cell + N / 2);
    const j = N - 1 - Math.floor((local.y - CATHEDRAL.canvasV) / CATHEDRAL.cell);
    if (i < 0 || j < 0 || i >= N || j >= N) return false;
    this.idle = 0;
    this.paint(i, j, button === 2);
    return true;
  }

  panel(): { el: HTMLElement; destroy(): void } {
    this.ensureModel();
    const pad = h('canvas', { class: 'draw-pad', width: 256, height: 256, 'aria-label': 'Drawing pad' });
    const seen = h('canvas', { class: 'seen-pad', width: 96, height: 96, title: 'What the network sees after centring and scaling' });
    const probs = h('div', { class: 'prob-bars' });
    const verdict = h('div', { class: 'lesson-actions' });
    const info = h('p', { class: 'muted small' });
    const renderPad = () => {
      const ctx = pad.getContext('2d')!;
      const s = pad.width / N;
      for (let j = 0; j < N; j++)
        for (let i = 0; i < N; i++) {
          const v = this.ink[j * N + i];
          ctx.fillStyle = `rgb(${20 + v * 200}, ${24 + v * 225}, ${45 + v * 210})`;
          ctx.fillRect(i * s, j * s, s - 1, s - 1);
        }
      const sctx = seen.getContext('2d')!;
      const inp = preprocess(this.ink, N, N);
      const ss = seen.width / N;
      for (let j = 0; j < N; j++)
        for (let i = 0; i < N; i++) {
          const v = inp[j * N + i];
          sctx.fillStyle = `rgb(${v * 255}, ${v * 255}, ${v * 255})`;
          sctx.fillRect(i * ss, j * ss, ss, ss);
        }
    };
    const render = () => {
      renderPad();
      const r = this.result;
      probs.replaceChildren(...Array.from({ length: 10 }, (_, d) => {
        const v = r ? r.probs[d] : 0;
        return h('div', { class: `prob ${r && r.prediction === d ? 'win' : ''}` },
          h('span', null, String(d)),
          h('i', { style: { width: `${Math.round(v * 100)}%` } }),
          h('small', null, `${Math.round(v * 100)}%`));
      }));
      const acc = this.model ? `Trained on ${this.model.trainedOn}; ${(this.model.testAccuracy * 100).toFixed(1)}% accurate on 10,000 test digits it never saw.` : 'Loading the trained network…';
      const mine = this.personal.right + this.personal.wrong;
      info.textContent = `${acc}${mine ? ` On your handwriting so far: ${this.personal.right}/${mine}.` : ''}`;
      verdict.replaceChildren(
        ...(r
          ? [
              h('span', { class: 'small' }, `Was ${r.prediction} right?`),
              h('button', { class: 'btn small', onclick: () => { this.personal.right++; this.clear(); } }, '✓ Yes'),
              h('button', { class: 'btn small', onclick: () => { this.personal.wrong++; this.clear(); } }, '✗ No'),
            ]
          : []),
      );
    };
    const unsub = this.onChange(render);
    let drawing = -1;
    const at = (e: PointerEvent) => {
      const r = pad.getBoundingClientRect();
      return [Math.floor(((e.clientX - r.left) / r.width) * N), Math.floor(((e.clientY - r.top) / r.height) * N)];
    };
    pad.addEventListener('pointerdown', (e) => {
      drawing = e.button;
      pad.setPointerCapture(e.pointerId);
      const [i, j] = at(e);
      this.paint(i, j, e.button === 2);
      renderPad();
    });
    pad.addEventListener('pointermove', (e) => {
      if (drawing < 0) return;
      const [i, j] = at(e);
      this.paint(i, j, drawing === 2);
      renderPad();
    });
    pad.addEventListener('pointerup', () => { drawing = -1; this.infer(); });
    pad.addEventListener('contextmenu', (e) => e.preventDefault());
    render();
    const el = h('div', { class: 'sim-panel' },
      h('header', { class: 'panel-title' },
        h('h2', null, '🧠 The Neural Cathedral'),
        h('p', { class: 'muted' }, 'A real neural network — 256 inputs, two hidden layers of 32 and 16 neurons, 10 outputs — trained on 60,000 handwritten digits. Draw here or paint straight onto the giant canvas in the hall (left click paints, right click erases), and watch the signal flow up through the network.'),
      ),
      h('div', { class: 'cathedral-row' },
        h('div', null, pad, h('div', { class: 'lesson-actions' },
          h('button', { class: 'btn', onclick: () => this.clear() }, 'Clear'),
          h('button', { class: 'btn', onclick: () => this.showSample() }, '🎲 Show a real MNIST digit'),
        )),
        h('div', null, h('p', { class: 'small muted' }, 'What the network sees:'), seen, probs),
      ),
      verdict,
      info,
      h('details', { class: 'sim-explain' },
        h('summary', null, 'What am I looking at?'),
        h('ul', null,
          h('li', null, 'Your drawing is cropped, scaled and centred (small grey square) — the same preprocessing the training images got.'),
          h('li', null, 'Each glowing sphere is a neuron. Brightness is its activation: a dot product of the layer below with that neuron\'s weights, then ReLU.'),
          h('li', null, 'Beams are connections. Orange ones push a neuron up (positive weight × activation), blue ones push it down.'),
          h('li', null, 'The last layer is a softmax: ten probabilities that add up to 100%. The gold cube is the network\'s answer.'),
          h('li', null, 'Try drawing a 7 with and without a crossbar, or a 4 that looks like a 9. Mistakes are the most interesting part!'),
        ),
      ),
    );
    return { el, destroy: unsub };
  }
}
