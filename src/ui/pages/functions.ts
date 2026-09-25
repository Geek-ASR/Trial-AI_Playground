import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { Page } from '../../main';
import { compile, ExprError, gradient, type Vars } from '../../ml/expr';
import { makeLabel, updateLabel } from '../../world/labels';
import { h } from '../dom';

/**
 * 3D Function Lab: type any function of x and y and walk around its surface.
 * Sliders drive the parameters a, b, c; arrows show the gradient; balls roll
 * downhill with gradient descent. Functions of x alone are drawn as a curve
 * together with their derivative.
 */

interface Preset { label: string; expr: string; domain: number; params?: Partial<Record<'a' | 'b' | 'c', number>>; note: string }

const GROUPS: { title: string; presets: Preset[] }[] = [
  {
    title: 'Activation functions',
    presets: [
      { label: 'sigmoid', expr: 'sigmoid(x)', domain: 6, note: 'Squashes any number into (0, 1). Its slope (pink) is at most 0.25 — one reason deep sigmoid nets learn slowly.' },
      { label: 'tanh', expr: 'tanh(x)', domain: 4, note: 'Like sigmoid but centred on zero, range (−1, 1). Slope 1 at the origin.' },
      { label: 'ReLU', expr: 'relu(x)', domain: 4, note: 'max(0, x): cheap and does not saturate for positive inputs. Its slope is 0 or 1.' },
      { label: 'GELU', expr: 'gelu(x)', domain: 4, note: 'The smooth ReLU used in transformers such as GPT and BERT.' },
      { label: 'softplus', expr: 'softplus(x)', domain: 5, note: 'log(1 + eˣ): a smooth ReLU whose slope is exactly the sigmoid.' },
      { label: 'swish', expr: 'swish(x)', domain: 5, note: 'x · sigmoid(x): dips slightly below zero before rising.' },
    ],
  },
  {
    title: 'A single neuron',
    presets: [
      { label: 'sigmoid neuron', expr: 'sigmoid(a*x + b*y + c)', domain: 4, params: { a: 2, b: 1, c: 0 }, note: 'Output of one neuron with weights a, b and bias c. The cliff is the neuron’s decision line a·x + b·y + c = 0 — drag the sliders to rotate and shift it.' },
      { label: 'ReLU neuron', expr: 'relu(a*x + b*y + c)', domain: 4, params: { a: 1, b: 1, c: 0 }, note: 'A ReLU neuron is a folded plane: flat on one side of its line, a ramp on the other.' },
      { label: 'two neurons', expr: 'sigmoid(3*(sigmoid(a*x + 2) + sigmoid(-a*x + 2) + sigmoid(b*y + 2) + sigmoid(-b*y + 2)) - 10)', domain: 5, params: { a: 3, b: 3 }, note: 'Four sigmoid neurons combined by a fifth carve out a square “bump” — the idea behind universal approximation.' },
    ],
  },
  {
    title: 'Loss landscapes',
    presets: [
      { label: 'bowl', expr: 'x^2 + a*y^2', domain: 3, params: { a: 1 }, note: 'A convex bowl: gradient descent always finds the bottom. Make a large to stretch it into a narrow valley and watch plain descent zig-zag.' },
      { label: 'saddle', expr: 'x^2 - y^2', domain: 2, note: 'A saddle point: the gradient is zero in the middle but it is not a minimum. High-dimensional losses are full of these.' },
      { label: 'Himmelblau', expr: 'log(1 + (x^2 + y - 11)^2 + (x + y^2 - 7)^2)', domain: 5, note: 'Four equally good minima. Where a ball ends up depends on where it starts. (Height is log-scaled.)' },
      { label: 'Rosenbrock', expr: 'log(1 + (1 - x)^2 + 100(y - x^2)^2)', domain: 2, note: 'A curved banana valley: finding it is easy, following it to the minimum at (1, 1) is hard.' },
      { label: 'Rastrigin', expr: '20 + x^2 + y^2 - 10(cos(2pi x) + cos(2pi y))', domain: 4, note: 'Hundreds of local minima around one global minimum at the origin.' },
    ],
  },
  {
    title: 'Waves & shapes',
    presets: [
      { label: 'ripple', expr: 'sin(a * sqrt(x^2 + y^2)) / (1 + sqrt(x^2 + y^2))', domain: 10, params: { a: 1.5 }, note: 'A pebble dropped in a pond.' },
      { label: 'egg crate', expr: 'sin(a*x) * cos(b*y)', domain: 6, params: { a: 1, b: 1 }, note: 'A product of waves; a and b set the frequencies.' },
      { label: 'Gaussian', expr: 'exp(-(x^2 + y^2) / (2 * a^2))', domain: 4, params: { a: 1 }, note: 'The bell curve in 2D; a is the standard deviation.' },
      { label: 'peaks', expr: '3(1-x)^2 exp(-x^2 - (y+1)^2) - 10(x/5 - x^3 - y^5) exp(-x^2 - y^2) - exp(-(x+1)^2 - y^2)/3', domain: 3, note: 'The classic MATLAB “peaks”: hills, pits and a saddle, handy for testing optimisers.' },
    ],
  },
];

const RES = 96;
const SIZE = 10;
const HEIGHT = 4;
const RAMP = [0x1b1f5e, 0x2b50c8, 0x1fa6b8, 0x3ed598, 0xf1e05a, 0xf99a3e, 0xf2545b].map((c) => new THREE.Color(c));

function ramp(t: number, out: THREE.Color) {
  const k = Math.max(0, Math.min(1, t)) * (RAMP.length - 1);
  const i = Math.min(RAMP.length - 2, Math.floor(k));
  return out.copy(RAMP[i]).lerp(RAMP[i + 1], k - i);
}

export function functionsPage(): Page {
  let preset = GROUPS[2].presets[2];
  let exprSrc = preset.expr;
  let domain = preset.domain;
  const params: Record<'a' | 'b' | 'c', number> = { a: 1, b: 1, c: 0 };
  let compiled = compile(exprSrc);
  let showArrows = true;
  let bands = true;
  let lr = 0.05;

  // ---------------------------------------------------------------- DOM
  const input = h('input', { class: 'fn-input', value: exprSrc, spellcheck: false, 'aria-label': 'Function of x and y' });
  const err = h('p', { class: 'fn-error' });
  const note = h('p', { class: 'muted small fn-note' });
  const readout = h('div', { class: 'net3d-readout' });
  const canvas = h('canvas', { class: 'net3d-canvas fn-canvas', 'aria-label': '3D plot of the function' });
  const sliders = h('div', { class: 'fn-sliders' });
  const domainOut = h('span', { class: 'muted small' });

  const chips = GROUPS.map((g) =>
    h('div', { class: 'fn-group' },
      h('span', { class: 'fn-group-title' }, g.title),
      h('div', { class: 'fn-chips' }, g.presets.map((p) => h('button', { class: 'chip', onclick: () => choose(p) }, p.label))),
    ),
  );

  const domainRange = h('input', { type: 'range', min: '1', max: '12', step: '0.5', value: String(domain) });
  domainRange.addEventListener('input', () => { domain = Number(domainRange.value); rebuild(); });
  const lrRange = h('input', { type: 'range', min: '-3', max: '0', step: '0.1', value: String(Math.log10(lr)) });
  const lrOut = h('span', { class: 'muted small' }, lr.toFixed(3));
  lrRange.addEventListener('input', () => { lr = 10 ** Number(lrRange.value); lrOut.textContent = lr.toPrecision(2); });
  const toggle = (label: string, value: boolean, on: (v: boolean) => void) => {
    const cb = h('input', { type: 'checkbox', checked: value });
    cb.addEventListener('change', () => on(cb.checked));
    return h('label', { class: 'check' }, cb, label);
  };

  const el = h('div', { class: 'page fn-page' },
    h('header', { class: 'panel-title' },
      h('h1', null, '🧊 3D Function Lab'),
      h('p', { class: 'muted' }, 'Type any function of x and y — or pick one below — and explore it in 3D. The same shapes are hiding inside every neural network: activations, neurons and the loss landscapes gradient descent has to cross.'),
    ),
    h('div', { class: 'fn-bar' },
      h('label', { class: 'fn-label', for: 'fn' }, 'f(x, y) ='),
      input,
    ),
    err,
    h('div', { class: 'fn-presets' }, chips),
    h('div', { class: 'fn-stage' },
      h('div', { class: 'net3d' }, canvas, readout, h('p', { class: 'net3d-help muted small' }, 'Drag to orbit · scroll to zoom · hover to measure · click to drop a ball')),
      h('aside', { class: 'fn-side' },
        note,
        sliders,
        h('label', { class: 'field' }, h('span', null, 'Domain ', domainOut), domainRange),
        h('label', { class: 'field' }, h('span', null, 'Learning rate ', lrOut), lrRange),
        toggle('Gradient arrows', showArrows, (v) => { showArrows = v; arrows.visible = v; }),
        toggle('Contour bands', bands, (v) => { bands = v; paint(); }),
        h('div', { class: 'lesson-actions' },
          h('button', { class: 'btn btn-primary', onclick: () => dropRain() }, '🟠 Drop 12 balls'),
          h('button', { class: 'btn btn-ghost', onclick: () => clearBalls() }, 'Clear'),
        ),
        h('p', { class: 'muted small' }, 'Balls follow −∇f: each step moves them downhill by learning-rate × gradient. Too large a rate and they overshoot; too small and they crawl.'),
        h('details', { class: 'fn-help' },
          h('summary', null, 'What can I type?'),
          h('p', { class: 'small' }, 'Operators + − × / ^ and brackets; implicit multiplication like 2x or 3(x+1). Variables x, y and sliders a, b, c. Constants pi, e. Functions: sin cos tan exp log sqrt abs min max pow tanh sigmoid relu leaky softplus gelu swish step gauss floor round sign atan2 hypot.'),
        ),
      ),
    ),
  );
  input.id = 'fn';

  // ---------------------------------------------------------------- 3D scene
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0d1c);
  scene.fog = new THREE.Fog(0x0b0d1c, 30, 60);
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
  camera.position.set(10, 9, 12);
  const controls = new OrbitControls(camera, canvas);
  controls.target.set(0, 1.4, 0);
  controls.enableDamping = true;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.5;
  controls.minDistance = 4;
  controls.maxDistance = 45;
  controls.addEventListener('start', () => { controls.autoRotate = false; });
  scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x1a1428, 1.1));
  const sun = new THREE.DirectionalLight(0xffffff, 1.8);
  sun.position.set(6, 14, 4);
  scene.add(sun);
  const grid = new THREE.GridHelper(SIZE, 10, 0x3a4180, 0x1e2246);
  scene.add(grid);

  // Axes with labels.
  const axisMat = (c: number) => new THREE.LineBasicMaterial({ color: c });
  const axis = (to: THREE.Vector3, c: number) => new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), to]), axisMat(c));
  scene.add(axis(new THREE.Vector3(SIZE / 2 + 0.6, 0, 0), 0xff6b6b), axis(new THREE.Vector3(0, 0, -(SIZE / 2 + 0.6)), 0x4fe39a), axis(new THREE.Vector3(0, HEIGHT + 0.8, 0), 0x7ef9ff));
  const xLabel = makeLabel(['x'], { accent: '#ff6b6b', scale: 0.5 });
  const yLabel = makeLabel(['y'], { accent: '#4fe39a', scale: 0.5 });
  const zLabel = makeLabel(['f'], { accent: '#7ef9ff', scale: 0.5 });
  xLabel.position.set(SIZE / 2 + 1.1, 0, 0);
  yLabel.position.set(0, 0, -(SIZE / 2 + 1.1));
  zLabel.position.set(0, HEIGHT + 1.2, 0);
  const rangeLabel = makeLabel(['f: …'], { accent: '#7ef9ff', scale: 0.75 });
  rangeLabel.position.set(-SIZE / 2 - 1, HEIGHT + 0.9, -SIZE / 2);
  scene.add(xLabel, yLabel, zLabel, rangeLabel);

  const geo = new THREE.PlaneGeometry(SIZE, SIZE, RES - 1, RES - 1).rotateX(-Math.PI / 2);
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(RES * RES * 3), 3));
  const surf = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.05, side: THREE.DoubleSide }));
  scene.add(surf);

  // 1D mode: the curve and its derivative as tubes.
  const curveGroup = new THREE.Group();
  scene.add(curveGroup);

  const ARROWS = 11;
  const arrowGeo = new THREE.ConeGeometry(0.07, 0.3, 8).translate(0, 0.15, 0);
  const shaftGeo = new THREE.CylinderGeometry(0.018, 0.018, 1, 5).translate(0, 0.5, 0);
  const arrows = new THREE.Group();
  const heads = new THREE.InstancedMesh(arrowGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }), ARROWS * ARROWS);
  const shafts = new THREE.InstancedMesh(shaftGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }), ARROWS * ARROWS);
  arrows.add(heads, shafts);
  scene.add(arrows);

  // Probe with tangent plane.
  const probe = new THREE.Group();
  const probeBall = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  const tangent = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), new THREE.MeshBasicMaterial({ color: 0x7ef9ff, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }));
  probe.add(probeBall, tangent);
  probe.visible = false;
  scene.add(probe);

  // Gradient-descent balls.
  interface Ball { x: number; y: number; mesh: THREE.Mesh; trail: THREE.Line; pts: number[]; steps: number; done: boolean }
  let balls: Ball[] = [];
  const ballGeo = new THREE.SphereGeometry(0.16, 16, 12);

  let fmin = 0, fmax = 1;
  let is1D = false;
  const vars = (x: number, y: number): Vars => ({ ...params, x, y });
  const F = (x: number, y: number) => {
    const v = compiled.f(vars(x, y));
    return Number.isFinite(v) ? v : NaN;
  };
  const toWorld = (x: number, y: number) => new THREE.Vector3((x / domain) * (SIZE / 2), 0, (-y / domain) * (SIZE / 2));
  const heightOf = (f: number) => (Number.isFinite(f) ? ((Math.max(fmin, Math.min(fmax, f)) - fmin) / (fmax - fmin || 1)) * HEIGHT : 0);

  function paint() {
    is1D = !compiled.vars.has('y');
    surf.visible = !is1D;
    arrows.visible = showArrows && !is1D;
    grid.visible = true;
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    const col = geo.getAttribute('color') as THREE.BufferAttribute;
    const vals = new Float64Array(pos.count);
    const finite: number[] = [];
    for (let k = 0; k < pos.count; k++) {
      const x = (pos.getX(k) / (SIZE / 2)) * domain, y = (-pos.getZ(k) / (SIZE / 2)) * domain;
      vals[k] = is1D ? F(x, 0) : F(x, y);
      if (Number.isFinite(vals[k])) finite.push(vals[k]);
    }
    // Robust range: ignore the most extreme 0.5% so one spike can't flatten the plot.
    finite.sort((p, q) => p - q);
    fmin = finite.length ? finite[Math.floor(finite.length * 0.005)] : 0;
    fmax = finite.length ? finite[Math.ceil(finite.length * 0.995) - 1] : 1;
    if (fmax - fmin < 1e-9) { fmin -= 0.5; fmax += 0.5; }
    const c = new THREE.Color();
    for (let k = 0; k < pos.count; k++) {
      const t = Number.isFinite(vals[k]) ? (Math.max(fmin, Math.min(fmax, vals[k])) - fmin) / (fmax - fmin) : 0;
      pos.setY(k, t * HEIGHT);
      ramp(t, c);
      if (bands) {
        const f = (t * 12) % 1;
        if (f < 0.07) c.multiplyScalar(0.55);
      }
      col.setXYZ(k, c.r, c.g, c.b);
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    updateLabel(rangeLabel, [`f from ${fmt(fmin)}`, `to ${fmt(fmax)}`], { accent: '#7ef9ff', scale: 0.75 });
    if (is1D) paintCurve(); else curveGroup.clear();
    paintArrows();
  }

  function paintCurve() {
    curveGroup.children.forEach((o) => (o as THREE.Mesh).geometry.dispose());
    curveGroup.clear();
    const n = 240;
    const pts: THREE.Vector3[] = [], dpts: THREE.Vector3[] = [];
    const ds: number[] = [];
    for (let i = 0; i < n; i++) {
      const x = -domain + (2 * domain * i) / (n - 1);
      ds.push(gradient(compiled.f, vars(x, 0))[0]);
    }
    const dmax = Math.max(1e-6, ...ds.map((d) => (Number.isFinite(d) ? Math.abs(d) : 0)));
    for (let i = 0; i < n; i++) {
      const x = -domain + (2 * domain * i) / (n - 1);
      const w = toWorld(x, 0);
      pts.push(new THREE.Vector3(w.x, heightOf(F(x, 0)), 0));
      // Derivative on its own scale, drawn behind the curve.
      dpts.push(new THREE.Vector3(w.x, HEIGHT / 2 + (ds[i] / dmax) * (HEIGHT / 2) * 0.9, -1.2));
    }
    const tube = (p: THREE.Vector3[], r: number, color: number) =>
      new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(p), 400, r, 8), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.35, roughness: 0.4 }));
    curveGroup.add(tube(pts, 0.08, 0x7ef9ff), tube(dpts, 0.045, 0xff5fa2));
    const zero = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-SIZE / 2, HEIGHT / 2, -1.2), new THREE.Vector3(SIZE / 2, HEIGHT / 2, -1.2)]), new THREE.LineDashedMaterial({ color: 0xff5fa2, dashSize: 0.2, gapSize: 0.15, transparent: true, opacity: 0.5 }));
    zero.computeLineDistances();
    curveGroup.add(zero);
    const l1 = makeLabel(['f(x)'], { accent: '#7ef9ff', scale: 0.5 });
    l1.position.copy(pts[pts.length - 1]).add(new THREE.Vector3(0.6, 0.3, 0));
    const l2 = makeLabel(['slope f′(x)', 'dashed line = 0'], { accent: '#ff5fa2', scale: 0.45 });
    l2.position.copy(dpts[dpts.length - 1]).add(new THREE.Vector3(0.9, 0.4, 0));
    curveGroup.add(l1, l2);
  }

  function paintArrows() {
    if (is1D) return;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), dir = new THREE.Vector3();
    const c = new THREE.Color();
    const gs: { x: number; y: number; gx: number; gy: number }[] = [];
    for (let i = 0; i < ARROWS; i++)
      for (let j = 0; j < ARROWS; j++) {
        const x = -domain + ((i + 0.5) / ARROWS) * 2 * domain, y = -domain + ((j + 0.5) / ARROWS) * 2 * domain;
        const [gx, gy] = gradient(compiled.f, vars(x, y), domain * 1e-4);
        gs.push({ x, y, gx: Number.isFinite(gx) ? gx : 0, gy: Number.isFinite(gy) ? gy : 0 });
      }
    const mags = gs.map((g) => Math.hypot(g.gx, g.gy)).sort((p, q2) => p - q2);
    const ref = mags[Math.floor(mags.length * 0.9)] || 1;
    gs.forEach((g, k) => {
      const mag = Math.hypot(g.gx, g.gy);
      const len = Math.min(1, mag / ref) * 0.75;
      const base = toWorld(g.x, g.y);
      base.y = heightOf(F(g.x, g.y)) + 0.12;
      // Point downhill (−∇f), in world axes (y maps to −z).
      dir.set(-g.gx, 0, g.gy).normalize();
      if (!Number.isFinite(dir.x) || len < 0.02) {
        m.makeScale(0, 0, 0);
        heads.setMatrixAt(k, m);
        shafts.setMatrixAt(k, m);
        return;
      }
      q.setFromUnitVectors(up, dir);
      m.compose(base, q, new THREE.Vector3(1, len, 1));
      shafts.setMatrixAt(k, m);
      m.compose(base.clone().addScaledVector(dir, len), q, new THREE.Vector3(1, 1, 1));
      heads.setMatrixAt(k, m);
      c.setHSL(0.52 - Math.min(1, mag / ref) * 0.5, 0.9, 0.62);
      heads.setColorAt(k, c);
      shafts.setColorAt(k, c);
    });
    for (const im of [heads, shafts]) {
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }
  }

  // ---------------------------------------------------------------- balls
  function addBall(x: number, y: number) {
    const color = new THREE.Color().setHSL(Math.random(), 0.85, 0.6);
    const mesh = new THREE.Mesh(ballGeo, new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.5, roughness: 0.3 }));
    const trail = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color }));
    trail.frustumCulled = false;
    scene.add(mesh, trail);
    balls.push({ x, y, mesh, trail, pts: [], steps: 0, done: false });
    if (balls.length > 40) removeBall(balls[0]);
  }
  function removeBall(b: Ball) {
    scene.remove(b.mesh, b.trail);
    (b.mesh.material as THREE.Material).dispose();
    b.trail.geometry.dispose();
    (b.trail.material as THREE.Material).dispose();
    balls = balls.filter((x) => x !== b);
  }
  function clearBalls() {
    [...balls].forEach(removeBall);
  }
  function dropRain() {
    for (let i = 0; i < 12; i++) addBall((Math.random() * 2 - 1) * domain * 0.9, is1D ? 0 : (Math.random() * 2 - 1) * domain * 0.9);
  }
  function stepBalls() {
    for (const b of balls) {
      if (b.done) continue;
      const [gx, gy] = gradient(compiled.f, vars(b.x, is1D ? 0 : b.y), domain * 1e-4);
      if (!Number.isFinite(gx) || !Number.isFinite(gy)) { b.done = true; continue; }
      // Cap each step so a steep cliff can't fling the ball off the map.
      let sx = -lr * gx, sy = is1D ? 0 : -lr * gy;
      const s = Math.hypot(sx, sy), cap = domain * 0.08;
      if (s > cap) { sx *= cap / s; sy *= cap / s; }
      b.x = Math.max(-domain, Math.min(domain, b.x + sx));
      b.y = Math.max(-domain, Math.min(domain, b.y + sy));
      b.steps++;
      if (s < domain * 1e-5 || b.steps > 1500) b.done = true;
      const w = toWorld(b.x, b.y);
      w.y = heightOf(F(b.x, b.y)) + 0.16;
      if (is1D) w.z = 0;
      b.mesh.position.copy(w);
      b.pts.push(w.x, w.y - 0.08, w.z);
      if (b.pts.length > 3 * 1500) b.pts.splice(0, 3);
      b.trail.geometry.setAttribute('position', new THREE.Float32BufferAttribute(b.pts, 3));
    }
  }

  // ---------------------------------------------------------------- interaction
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let downAt = { x: 0, y: 0 };
  const pick = (e: PointerEvent): [number, number] | null => {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    if (is1D) {
      const hit = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), new THREE.Vector3());
      if (!hit || Math.abs(hit.x) > SIZE / 2) return null;
      return [(hit.x / (SIZE / 2)) * domain, 0];
    }
    const hit = ray.intersectObject(surf)[0];
    return hit ? [(hit.point.x / (SIZE / 2)) * domain, (-hit.point.z / (SIZE / 2)) * domain] : null;
  };
  canvas.addEventListener('pointermove', (e) => {
    const p = pick(e);
    probe.visible = !!p;
    if (!p) { readout.replaceChildren(h('span', { class: 'muted' }, 'Hover the surface to measure it')); return; }
    const [x, y] = p;
    const f = F(x, y);
    const [gx, gy] = gradient(compiled.f, vars(x, y), domain * 1e-4);
    const w = toWorld(x, y);
    w.y = heightOf(f);
    probe.position.copy(w);
    // Tangent plane: slope in world units along x and z.
    const k = (HEIGHT / (fmax - fmin || 1)) / ((SIZE / 2) / domain);
    const n = new THREE.Vector3(-gx * k, 1, is1D ? 0 : gy * k).normalize();
    tangent.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    tangent.visible = !is1D;
    readout.replaceChildren(
      h('span', null, is1D ? `x = ${fmt(x)}` : `(${fmt(x)}, ${fmt(y)})`),
      h('strong', null, `f = ${fmt(f)}`),
      h('span', { class: 'muted' }, is1D ? `slope = ${fmt(gx)}` : `∇f = (${fmt(gx)}, ${fmt(gy)})  |∇f| = ${fmt(Math.hypot(gx, gy))}`),
    );
  });
  canvas.addEventListener('pointerleave', () => { probe.visible = false; });
  canvas.addEventListener('pointerdown', (e) => { downAt = { x: e.clientX, y: e.clientY }; });
  canvas.addEventListener('pointerup', (e) => {
    if (Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 5) return; // it was a drag
    const p = pick(e);
    if (p) addBall(p[0], p[1]);
  });

  // ---------------------------------------------------------------- controls
  function renderSliders() {
    const used = (['a', 'b', 'c'] as const).filter((k) => compiled.vars.has(k));
    sliders.replaceChildren(...used.map((k) => {
      const out = h('span', { class: 'muted small' }, params[k].toFixed(2));
      const r = h('input', { type: 'range', min: '-4', max: '4', step: '0.05', value: String(params[k]) });
      r.addEventListener('input', () => {
        params[k] = Number(r.value);
        out.textContent = params[k].toFixed(2);
        paint();
        for (const b of balls) b.done = false;
      });
      return h('label', { class: 'field' }, h('span', null, `${k} `, out), r);
    }));
  }

  function rebuild() {
    domainOut.textContent = `±${domain}`;
    domainRange.value = String(domain);
    clearBalls();
    paint();
  }

  function choose(p: Preset) {
    preset = p;
    exprSrc = p.expr;
    input.value = p.expr;
    domain = p.domain;
    Object.assign(params, { a: 1, b: 1, c: 0 }, p.params);
    compiled = compile(p.expr);
    err.textContent = '';
    note.textContent = p.note;
    renderSliders();
    rebuild();
    if (!compiled.vars.has('y')) {
      camera.position.set(0, 3, 13);
      controls.autoRotate = false;
    }
    controls.target.set(0, compiled.vars.has('y') ? 1.4 : 2, 0);
  }

  let typing = 0;
  input.addEventListener('input', () => {
    clearTimeout(typing);
    typing = window.setTimeout(() => {
      try {
        const c = compile(input.value);
        const bad = [...c.vars].filter((v) => !['x', 'y', 'a', 'b', 'c'].includes(v));
        if (bad.length) throw new ExprError(`Unknown variable ${bad[0]} — use x, y, a, b or c`, 0);
        compiled = c;
        exprSrc = input.value;
        err.textContent = '';
        note.textContent = 'Your own function. Hover to measure it, click to drop a ball.';
        renderSliders();
        rebuild();
      } catch (e) {
        err.textContent = e instanceof Error ? `⚠ ${e.message}` : '⚠ Could not read that';
      }
    }, 250);
  });

  // ---------------------------------------------------------------- loop
  let raf = 0, last = performance.now(), acc = 0;
  const ro = new ResizeObserver(() => {
    const w = canvas.clientWidth, hgt = canvas.clientHeight;
    if (!w || !hgt) return;
    renderer.setSize(w, hgt, false);
    camera.aspect = w / hgt;
    camera.updateProjectionMatrix();
  });
  ro.observe(canvas);
  function frame(now: number) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!el.isConnected) return;
    const box = canvas.getBoundingClientRect();
    if (box.bottom < 0 || box.top > window.innerHeight || !box.width) return;
    acc += dt * 30;
    while (acc >= 1) { acc -= 1; stepBalls(); }
    controls.update(dt);
    renderer.render(scene, camera);
  }
  raf = requestAnimationFrame(frame);

  choose(preset);
  readout.replaceChildren(h('span', { class: 'muted' }, 'Hover the surface to measure it'));

  return {
    el,
    title: '3D Function Lab',
    destroy() {
      cancelAnimationFrame(raf);
      clearTimeout(typing);
      ro.disconnect();
      controls.dispose();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose()); else mat?.dispose();
      });
      renderer.dispose();
    },
  };
}

function fmt(v: number): string {
  if (!Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  if (a !== 0 && (a < 1e-3 || a >= 1e5)) return v.toExponential(2);
  return String(Number(v.toFixed(3)));
}
