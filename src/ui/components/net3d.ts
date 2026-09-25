import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { featurize, FEATURES, type FeatureId, type Point } from '../../ml/datasets';
import type { MLP } from '../../ml/mlp';
import { makeLabel } from '../../world/labels';
import { h } from '../dom';

/**
 * The Neural Forge in 3D. The network floats above its own output:
 *  - every neuron is a tile showing what it responds to across the input plane,
 *  - weights are rods (orange +, blue −, thicker = stronger) with pulses flowing forward,
 *  - below, the output probability is a landscape over the data; a glass sheet at p = 0.5
 *    cuts it along the decision boundary,
 *  - hover the landscape to push that point through the network and watch it light up.
 */

const TILE_RES = 24;
const SURF_RES = 56;
const SURF_SIZE = 8;
const SURF_H = 2.4;
const RANGE = 1.2;
const MAX_EDGES = 8 * 8 * 5 + 8 * 8 + 8;
const PULSES_PER_EDGE = 2;

const BLUE = new THREE.Color(0x3e63dd), MID = new THREE.Color(0xf0f0f5), ORANGE = new THREE.Color(0xf76b15);

function diverging(t: number, out: THREE.Color): THREE.Color {
  // t in [-1, 1]: blue → white → orange
  const k = Math.max(-1, Math.min(1, t));
  return k < 0 ? out.copy(MID).lerp(BLUE, -k) : out.copy(MID).lerp(ORANGE, k);
}

interface Frame {
  net: MLP;
  feats: FeatureId[];
  train: Point[];
  test: Point[];
}

export interface Net3D {
  el: HTMLElement;
  update(frame: Frame): void;
  destroy(): void;
}

export function createNet3D(): Net3D {
  const canvas = h('canvas', { class: 'net3d-canvas', 'aria-label': 'Interactive 3D view of the network and its decision landscape' });
  const readout = h('div', { class: 'net3d-readout' });
  const help = h('p', { class: 'net3d-help muted small' }, 'Drag to orbit · scroll to zoom · hover the landscape to send a point through the network');
  const el = h('div', { class: 'net3d' }, canvas, readout, help);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0d1c);
  scene.fog = new THREE.Fog(0x0b0d1c, 22, 48);
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
  camera.position.set(6.5, 8.2, 11.5);
  const controls = new OrbitControls(camera, canvas);
  controls.target.set(0, 3.6, 0);
  controls.enableDamping = true;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.6;
  controls.maxDistance = 40;
  controls.minDistance = 5;
  controls.addEventListener('start', () => { controls.autoRotate = false; });

  scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x20182a, 1.2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(5, 12, 8);
  scene.add(sun);
  const grid = new THREE.GridHelper(40, 40, 0x2a3060, 0x171a36);
  grid.position.y = -0.02;
  scene.add(grid);

  // ------------------------------------------------------------ decision landscape
  const surfGeo = new THREE.PlaneGeometry(SURF_SIZE, SURF_SIZE, SURF_RES - 1, SURF_RES - 1).rotateX(-Math.PI / 2);
  surfGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(SURF_RES * SURF_RES * 3), 3));
  const surf = new THREE.Mesh(surfGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.05, side: THREE.DoubleSide, flatShading: false }));
  scene.add(surf);
  const wire = new THREE.LineSegments(new THREE.WireframeGeometry(surfGeo), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.06 }));
  scene.add(wire);
  const sheet = new THREE.Mesh(
    new THREE.PlaneGeometry(SURF_SIZE, SURF_SIZE).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide }),
  );
  sheet.position.y = SURF_H * 0.5;
  scene.add(sheet);
  const sheetEdge = new THREE.LineSegments(new THREE.EdgesGeometry(sheet.geometry), new THREE.LineBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.5 }));
  sheetEdge.position.y = sheet.position.y;
  scene.add(sheetEdge);
  const sheetLabel = makeLabel(['p = 0.5', 'decision boundary'], { accent: '#9fe8ff', scale: 0.55 });
  sheetLabel.position.set(SURF_SIZE / 2 + 0.9, SURF_H * 0.5 + 0.4, SURF_SIZE / 2 - 0.4);
  scene.add(sheetLabel);

  const toSurf = (x: number, y: number) => new THREE.Vector3((x / RANGE) * (SURF_SIZE / 2), 0, (-y / RANGE) * (SURF_SIZE / 2));

  // Data points: train solid, test smaller.
  const pointGeo = new THREE.SphereGeometry(0.075, 10, 8);
  const points = new THREE.InstancedMesh(pointGeo, new THREE.MeshStandardMaterial({ roughness: 0.3 }), 600);
  points.count = 0;
  scene.add(points);

  // Probe marker.
  const probe = new THREE.Group();
  const probeBall = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  const probeStem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 }));
  probe.add(probeBall, probeStem);
  scene.add(probe);

  // ------------------------------------------------------------ network
  const netGroup = new THREE.Group();
  netGroup.position.y = 6.4;
  scene.add(netGroup);
  const tileGeo = new THREE.PlaneGeometry(0.72, 0.72);
  const frameGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(0.8, 0.8, 0.08));
  const haloGeo = new THREE.TorusGeometry(0.56, 0.035, 8, 40);
  const rodGeo = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true).translate(0, 0.5, 0).rotateX(Math.PI / 2);
  const rods = new THREE.InstancedMesh(rodGeo, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.85, depthWrite: false }), MAX_EDGES);
  rods.count = 0;
  rods.frustumCulled = false;
  netGroup.add(rods);

  const pulseGeo = new THREE.BufferGeometry();
  const pulsePos = new Float32Array(MAX_EDGES * PULSES_PER_EDGE * 3);
  const pulseCol = new Float32Array(MAX_EDGES * PULSES_PER_EDGE * 3);
  pulseGeo.setAttribute('position', new THREE.BufferAttribute(pulsePos, 3).setUsage(THREE.DynamicDrawUsage));
  pulseGeo.setAttribute('color', new THREE.BufferAttribute(pulseCol, 3).setUsage(THREE.DynamicDrawUsage));
  const pulses = new THREE.Points(pulseGeo, new THREE.PointsMaterial({ size: 0.16, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, map: dotTexture() }));
  pulses.frustumCulled = false;
  netGroup.add(pulses);

  interface Neuron { pos: THREE.Vector3; tile: THREE.Mesh; tex: THREE.DataTexture; halo: THREE.Mesh; layer: number; index: number }
  interface Edge { from: Neuron; to: Neuron; l: number; i: number; j: number }
  let neurons: Neuron[][] = [];
  let edges: Edge[] = [];
  let labels: THREE.Sprite[] = [];
  let shape = '';
  let current: Frame | null = null;
  let probeXY: [number, number] = [0.4, 0.3];
  let hovering = false;
  let acts: number[][] = [];

  function rebuild(sizes: number[], feats: FeatureId[]) {
    for (const col of neurons) for (const n of col) { n.tex.dispose(); (n.tile.material as THREE.Material).dispose(); }
    for (const l of labels) { (l.material as THREE.SpriteMaterial).map?.dispose(); l.material.dispose(); }
    netGroup.children.filter((c) => c !== rods && c !== pulses).forEach((c) => netGroup.remove(c));
    labels = [];
    const L = sizes.length;
    const dx = Math.min(2.6, 12 / Math.max(1, L - 1));
    neurons = sizes.map((n, l) => {
      const dy = Math.min(1.05, 5.2 / Math.max(1, n - 1));
      return Array.from({ length: n }, (_, i) => {
        const pos = new THREE.Vector3((l - (L - 1) / 2) * dx, (i - (n - 1) / 2) * -dy, 0);
        const data = new Uint8Array(TILE_RES * TILE_RES * 4);
        const tex = new THREE.DataTexture(data, TILE_RES, TILE_RES);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.magFilter = THREE.LinearFilter;
        tex.needsUpdate = true;
        const tile = new THREE.Mesh(tileGeo, new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
        tile.position.copy(pos);
        const frame = new THREE.LineSegments(frameGeo, new THREE.LineBasicMaterial({ color: l === 0 ? 0x7ef9ff : l === L - 1 ? 0xffc53d : 0xc9cdf0 }));
        frame.position.copy(pos);
        const halo = new THREE.Mesh(haloGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
        halo.position.copy(pos);
        netGroup.add(tile, frame, halo);
        return { pos, tile, tex, halo, layer: l, index: i };
      });
    });
    edges = [];
    for (let l = 0; l < L - 1; l++)
      for (let j = 0; j < sizes[l + 1]; j++)
        for (let i = 0; i < sizes[l]; i++) edges.push({ from: neurons[l][i], to: neurons[l + 1][j], l, i, j });
    rods.count = Math.min(MAX_EDGES, edges.length);
    pulseGeo.setDrawRange(0, rods.count * PULSES_PER_EDGE);

    // Input and output labels.
    feats.forEach((f, i) => {
      const s = makeLabel([FEATURES.find((x) => x.id === f)?.label ?? f], { accent: '#7ef9ff', scale: 0.55 });
      s.position.copy(neurons[0][i].pos).add(new THREE.Vector3(-1.2, 0, 0));
      netGroup.add(s);
      labels.push(s);
    });
    const out = makeLabel(['output', 'P(orange)'], { accent: '#ffc53d', scale: 0.5 });
    out.position.copy(neurons[L - 1][0].pos).add(new THREE.Vector3(1.6, 0, 0));
    netGroup.add(out);
    labels.push(out);
    // A drop line from the output neuron to the landscape it produces.
    const drop = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([neurons[L - 1][0].pos.clone(), new THREE.Vector3(neurons[L - 1][0].pos.x, -netGroup.position.y + SURF_H + 0.3, 0)]),
      new THREE.LineDashedMaterial({ color: 0xffc53d, dashSize: 0.18, gapSize: 0.12, transparent: true, opacity: 0.6 }),
    );
    drop.computeLineDistances();
    netGroup.add(drop);
    netGroup.add(rods, pulses);
  }

  /** Range used to colour a layer's activations. */
  const actRange = (net: MLP, l: number, L: number) => (l === 0 ? RANGE * 1.2 : l === L - 1 ? 1 : net.activation === 'relu' || net.activation === 'linear' ? 0 : 1);

  function paintTiles(f: Frame) {
    const { net, feats } = f;
    const L = net.sizes.length;
    const grids: number[][][] = net.sizes.map((n) => Array.from({ length: n }, () => new Array(TILE_RES * TILE_RES)));
    for (let r = 0; r < TILE_RES; r++)
      for (let c = 0; c < TILE_RES; c++) {
        const x = (c / (TILE_RES - 1)) * 2 * RANGE - RANGE, y = (r / (TILE_RES - 1)) * 2 * RANGE - RANGE;
        const a = net.forward(featurize(x, y, feats));
        for (let l = 0; l < L; l++) for (let i = 0; i < a[l].length; i++) grids[l][i][r * TILE_RES + c] = a[l][i];
      }
    const col = new THREE.Color();
    for (let l = 0; l < L; l++) {
      for (let i = 0; i < net.sizes[l]; i++) {
        const g = grids[l][i];
        let scale = actRange(net, l, L);
        if (!scale) scale = Math.max(1e-6, ...g.map(Math.abs));
        const data = neurons[l][i].tex.image.data as Uint8Array;
        for (let k = 0; k < g.length; k++) {
          // Output and sigmoid layers live in [0, 1]: centre them on 0.5.
          const v = l === L - 1 || net.activation === 'sigmoid' && l > 0 ? (g[k] - 0.5) * 2 : g[k] / scale;
          diverging(v, col);
          data[k * 4] = col.r * 255; data[k * 4 + 1] = col.g * 255; data[k * 4 + 2] = col.b * 255; data[k * 4 + 3] = 255;
        }
        neurons[l][i].tex.needsUpdate = true;
      }
    }
  }

  function paintSurface(f: Frame) {
    const { net, feats } = f;
    const pos = surfGeo.getAttribute('position') as THREE.BufferAttribute;
    const colors = surfGeo.getAttribute('color') as THREE.BufferAttribute;
    const c = new THREE.Color();
    for (let k = 0; k < pos.count; k++) {
      const x = (pos.getX(k) / (SURF_SIZE / 2)) * RANGE, y = (-pos.getZ(k) / (SURF_SIZE / 2)) * RANGE;
      const p = net.predict(featurize(x, y, feats));
      pos.setY(k, p * SURF_H);
      diverging((p - 0.5) * 2, c);
      colors.setXYZ(k, c.r, c.g, c.b);
    }
    pos.needsUpdate = true;
    colors.needsUpdate = true;
    surfGeo.computeVertexNormals();
    surfGeo.computeBoundingSphere();
    wire.geometry.dispose();
    wire.geometry = new THREE.WireframeGeometry(surfGeo);

    const m = new THREE.Matrix4();
    let n = 0;
    const put = (pt: Point, test: boolean) => {
      if (n >= 600) return;
      const v = toSurf(pt.x, pt.y);
      if (Math.abs(v.x) > SURF_SIZE / 2 || Math.abs(v.z) > SURF_SIZE / 2) return;
      v.y = (pt.label ? SURF_H : 0) + 0.1;
      const s = test ? 0.7 : 1;
      m.makeScale(s, s, s).setPosition(v);
      points.setMatrixAt(n, m);
      points.setColorAt(n, c.set(pt.label ? 0xf76b15 : 0x3e63dd).multiplyScalar(test ? 0.65 : 1.15));
      n++;
    };
    f.train.forEach((p) => put(p, false));
    f.test.forEach((p) => put(p, true));
    points.count = n;
    points.instanceMatrix.needsUpdate = true;
    if (points.instanceColor) points.instanceColor.needsUpdate = true;
  }

  function paintEdges(f: Frame) {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    const dir = new THREE.Vector3(), z = new THREE.Vector3(0, 0, 1), c = new THREE.Color();
    for (let e = 0; e < rods.count; e++) {
      const E = edges[e];
      const w = f.net.layers[E.l].W[E.j][E.i];
      dir.subVectors(E.to.pos, E.from.pos);
      const len = dir.length();
      q.setFromUnitVectors(z, dir.normalize());
      const r = 0.008 + Math.min(1, Math.abs(w) / 2.5) * 0.05;
      m.compose(E.from.pos, q, s.set(r, r, len));
      rods.setMatrixAt(e, m);
      const k = Math.min(1, 0.25 + Math.abs(w) / 2);
      rods.setColorAt(e, c.set(w >= 0 ? 0xf76b15 : 0x4a6cf0).multiplyScalar(k));
    }
    rods.instanceMatrix.needsUpdate = true;
    if (rods.instanceColor) rods.instanceColor.needsUpdate = true;
  }

  function probeForward() {
    if (!current) return;
    const { net, feats } = current;
    const [x, y] = probeXY;
    acts = net.forward(featurize(x, y, feats));
    const p = acts[acts.length - 1][0];
    const v = toSurf(x, y);
    probe.position.set(v.x, 0, v.z);
    probeBall.position.y = p * SURF_H + 0.25;
    probeStem.scale.y = p * SURF_H + 0.25;
    probeStem.position.y = (p * SURF_H + 0.25) / 2;
    const L = acts.length;
    const col = new THREE.Color();
    for (let l = 0; l < L; l++)
      for (let i = 0; i < acts[l].length; i++) {
        const a = acts[l][i];
        const scale = actRange(net, l, L) || 3;
        const t = l === L - 1 || (net.activation === 'sigmoid' && l > 0) ? (a - 0.5) * 2 : a / scale;
        const halo = neurons[l][i].halo;
        const mat = halo.material as THREE.MeshBasicMaterial;
        mat.color.copy(diverging(t, col)).multiplyScalar(1.4);
        mat.opacity = Math.min(1, 0.15 + Math.abs(t));
        halo.scale.setScalar(0.85 + Math.min(1, Math.abs(t)) * 0.35);
      }
    readout.replaceChildren(
      h('span', null, `point (${x.toFixed(2)}, ${y.toFixed(2)})`),
      h('strong', { style: { color: p > 0.5 ? '#f76b15' : '#6d8cff' } }, `P(orange) = ${(p * 100).toFixed(1)}%`),
      h('span', { class: 'muted' }, hovering ? '' : '· hover the landscape'),
    );
  }

  let lastHeavy = 0;
  function update(f: Frame) {
    current = f;
    const key = f.net.sizes.join('-') + '|' + f.feats.join(',');
    if (key !== shape) {
      shape = key;
      rebuild(f.net.sizes, f.feats);
      lastHeavy = 0;
    }
    const now = performance.now();
    paintEdges(f);
    if (now - lastHeavy > 180) {
      lastHeavy = now;
      paintTiles(f);
      paintSurface(f);
    }
    probeForward();
  }

  // ------------------------------------------------------------ interaction & loop
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  canvas.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObject(surf)[0];
    hovering = !!hit;
    if (hit) {
      probeXY = [(hit.point.x / (SURF_SIZE / 2)) * RANGE, (-hit.point.z / (SURF_SIZE / 2)) * RANGE];
      probeForward();
    }
  });
  canvas.addEventListener('pointerleave', () => { hovering = false; });

  let raf = 0;
  let t = 0;
  let last = performance.now();
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
    // Skip rendering while scrolled out of view.
    const box = canvas.getBoundingClientRect();
    if (box.bottom < 0 || box.top > window.innerHeight || !box.width) return;
    t += dt;
    if (!hovering && current) {
      // Wander the probe around the plane so the network is never still.
      probeXY = [Math.cos(t * 0.35) * 0.75, Math.sin(t * 0.5) * 0.75];
      probeForward();
    }
    animatePulses(dt);
    for (const col of neurons) for (const n of col) n.halo.rotation.z += dt * 0.8;
    controls.update(dt);
    renderer.render(scene, camera);
  }
  raf = requestAnimationFrame(frame);

  const phase = Float32Array.from({ length: MAX_EDGES * PULSES_PER_EDGE }, () => Math.random());
  function animatePulses(dt: number) {
    if (!current || !acts.length) return;
    const tmp = new THREE.Vector3(), c = new THREE.Color();
    for (let e = 0; e < rods.count; e++) {
      const E = edges[e];
      const w = current.net.layers[E.l].W[E.j][E.i];
      const a = acts[E.l][E.i];
      const signal = Math.min(1, Math.abs(w * a) / 1.5);
      c.set(w * a >= 0 ? 0xffa060 : 0x7f9bff).multiplyScalar(0.15 + signal * 1.6);
      for (let k = 0; k < PULSES_PER_EDGE; k++) {
        const idx = e * PULSES_PER_EDGE + k;
        phase[idx] = (phase[idx] + dt * (0.35 + signal * 0.9)) % 1;
        tmp.lerpVectors(E.from.pos, E.to.pos, phase[idx]);
        pulsePos.set([tmp.x, tmp.y, tmp.z], idx * 3);
        pulseCol.set([c.r, c.g, c.b], idx * 3);
      }
    }
    pulseGeo.attributes.position.needsUpdate = true;
    pulseGeo.attributes.color.needsUpdate = true;
  }

  return {
    el,
    update,
    destroy() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose()); else mat?.dispose();
      });
      for (const col of neurons) for (const n of col) n.tex.dispose();
      renderer.dispose();
    },
  };
}

function dotTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.6)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}

