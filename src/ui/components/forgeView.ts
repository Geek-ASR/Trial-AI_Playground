import { DATASETS, FEATURES, featurize, makeDataset, split, type DatasetId, type FeatureId, type Point } from '../../ml/datasets';
import { MLP, type Activation } from '../../ml/mlp';
import { recordForge } from '../../progress/store';
import { B, type BlockId } from '../../world/blocks';
import type { VoxelOp } from '../../world/ops';
import { h } from '../dom';
import { celebrate } from './lessonView';

export interface ForgeOptions {
  /** Called a few times per second with voxels for the Neural Peaks display pad. */
  onPad?: (ops: VoxelOp[]) => void;
}

const PAD = 12;
const BANDS: BlockId[] = [B.BLUE, B.CYAN, B.WHITE, B.YELLOW, B.ORANGE];

/** Colour for a probability: blue (class 0) → white → orange (class 1). */
function probColor(p: number): string {
  const t = Math.max(0, Math.min(1, p));
  const a = [62, 99, 221], mid = [240, 240, 245], b = [247, 107, 21];
  const lerp = (x: number[], y: number[], k: number) => x.map((v, i) => Math.round(v + (y[i] - v) * k));
  const c = t < 0.5 ? lerp(a, mid, t * 2) : lerp(mid, b, (t - 0.5) * 2);
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

export function forgeView(opts: ForgeOptions = {}): { el: HTMLElement; destroy(): void } {
  let dataset: DatasetId = 'circle';
  let noise = 0.1;
  let feats: FeatureId[] = ['x', 'y'];
  let hidden = [4, 4];
  let activation: Activation = 'tanh';
  let lr = 0.1;
  let l2 = 0;
  let data: { train: Point[]; test: Point[] } = { train: [], test: [] };
  let net: MLP;
  let epoch = 0;
  let playing = false;
  let raf = 0;
  let lastPad = 0;
  let seed = 1;
  const lossHistory: number[] = [];

  const boundary = h('canvas', { class: 'forge-canvas', width: 300, height: 300, 'aria-label': 'Decision boundary' });
  const netCanvas = h('canvas', { class: 'forge-net', width: 420, height: 220, 'aria-label': 'Network diagram' });
  const lossCanvas = h('canvas', { class: 'forge-loss', width: 300, height: 60, 'aria-label': 'Loss curve' });
  const stats = h('div', { class: 'forge-stats' });
  const playBtn = h('button', { class: 'btn btn-primary', onclick: () => toggle() }, '▶ Train');
  const hint = h('p', { class: 'muted small' });

  const select = <T extends string>(label: string, options: [T, string][], value: T, onChange: (v: T) => void) => {
    const s = h('select', { class: 'select' }, options.map(([v, l]) => h('option', { value: v, selected: v === value }, l)));
    s.addEventListener('change', () => onChange(s.value as T));
    return h('label', { class: 'field' }, h('span', null, label), s);
  };

  const featureBoxes = h('div', { class: 'feature-boxes' },
    FEATURES.map((f) => {
      const cb = h('input', { type: 'checkbox', checked: feats.includes(f.id) });
      cb.addEventListener('change', () => {
        feats = FEATURES.filter((x) => (x.id === f.id ? cb.checked : feats.includes(x.id))).map((x) => x.id);
        if (!feats.length) { feats = ['x']; cb.checked = f.id === 'x'; }
        reset();
      });
      return h('label', { class: 'check' }, cb, f.label);
    }),
  );

  const layerCtl = h('div', { class: 'layers' });
  function renderLayers() {
    layerCtl.replaceChildren(
      h('span', { class: 'muted small' }, `Hidden layers: ${hidden.length}`),
      h('button', { class: 'btn small', onclick: () => { if (hidden.length < 5) { hidden.push(4); reset(); } } }, '+ layer'),
      h('button', { class: 'btn small', onclick: () => { hidden.pop(); reset(); } }, '− layer'),
      ...hidden.map((n, i) =>
        h('span', { class: 'layer-pill' },
          h('button', { class: 'mini', 'aria-label': 'fewer neurons', onclick: () => { hidden[i] = Math.max(1, n - 1); reset(); } }, '−'),
          `${n}`,
          h('button', { class: 'mini', 'aria-label': 'more neurons', onclick: () => { hidden[i] = Math.min(8, n + 1); reset(); } }, '+'),
        ),
      ),
    );
  }

  const el = h('div', { class: 'forge' },
    h('header', { class: 'panel-title' },
      h('h2', null, '⚒ Neural Forge'),
      h('p', { class: 'muted' }, 'Design a neural network, press Train, and watch it learn to separate blue from orange. In the world, the decision boundary is painted live onto the Neural Peaks display pad.'),
    ),
    h('div', { class: 'forge-controls' },
      select('Dataset', DATASETS.map((d) => [d.id, d.name]), dataset, (v) => { dataset = v; regen(); }),
      select('Noise', [['0', '0'], ['0.1', '0.1'], ['0.2', '0.2'], ['0.3', '0.3']], String(noise), (v) => { noise = Number(v); regen(); }),
      select('Activation', [['tanh', 'tanh'], ['relu', 'ReLU'], ['sigmoid', 'sigmoid'], ['linear', 'linear']], activation, (v) => { activation = v; reset(); }),
      select('Learning rate', [['0.003', '0.003'], ['0.01', '0.01'], ['0.03', '0.03'], ['0.1', '0.1'], ['0.3', '0.3'], ['1', '1'], ['3', '3']], String(lr), (v) => { lr = Number(v); }),
      select('L2 regularisation', [['0', 'none'], ['0.0001', '0.0001'], ['0.001', '0.001'], ['0.01', '0.01']], String(l2), (v) => { l2 = Number(v); }),
    ),
    h('div', { class: 'field' }, h('span', null, 'Input features'), featureBoxes),
    layerCtl,
    h('div', { class: 'lesson-actions' },
      playBtn,
      h('button', { class: 'btn', onclick: () => { stepEpoch(); draw(); } }, '⏭ Step'),
      h('button', { class: 'btn btn-ghost', onclick: () => { seed++; reset(); } }, '↺ Re-initialise'),
    ),
    hint,
    h('div', { class: 'forge-grid' },
      h('figure', null, boundary, h('figcaption', null, 'Decision boundary · ● train ○ test')),
      h('div', null, stats, lossCanvas, netCanvas),
    ),
  );

  function regen() {
    data = split(makeDataset(dataset, 300, noise));
    hint.textContent = DATASETS.find((d) => d.id === dataset)!.hint;
    reset();
  }

  function reset() {
    net = new MLP(feats.length, hidden, activation, seed);
    epoch = 0;
    lossHistory.length = 0;
    renderLayers();
    draw(true);
  }

  const X = (pts: Point[]) => pts.map((p) => featurize(p.x, p.y, feats));
  const Y = (pts: Point[]) => pts.map((p) => p.label);

  function stepEpoch() {
    const order = data.train.map((_, i) => i).sort(() => Math.random() - 0.5);
    const xs = X(data.train), ys = Y(data.train);
    for (let i = 0; i < order.length; i += 10) {
      const idx = order.slice(i, i + 10);
      net.trainBatch(idx.map((k) => xs[k]), idx.map((k) => ys[k]), lr, l2);
    }
    epoch++;
    lossHistory.push(net.loss(X(data.test), Y(data.test)));
    if (lossHistory.length > 300) lossHistory.shift();
  }

  function toggle() {
    playing = !playing;
    playBtn.textContent = playing ? '⏸ Pause' : '▶ Train';
    if (playing) loop();
  }

  function loop() {
    if (!playing || !el.isConnected) return;
    stepEpoch();
    draw();
    raf = requestAnimationFrame(loop);
  }

  function draw(forcePad = false) {
    const ctx = boundary.getContext('2d')!;
    const W = boundary.width, H = boundary.height;
    const cell = 6;
    for (let py = 0; py < H; py += cell)
      for (let px = 0; px < W; px += cell) {
        const x = (px / W) * 2.4 - 1.2, y = 1.2 - (py / H) * 2.4;
        ctx.fillStyle = probColor(net.predict(featurize(x, y, feats)));
        ctx.fillRect(px, py, cell, cell);
      }
    const dot = (p: Point, hollow: boolean) => {
      const px = ((p.x + 1.2) / 2.4) * W, py = ((1.2 - p.y) / 2.4) * H;
      ctx.beginPath();
      ctx.arc(px, py, 3.6, 0, Math.PI * 2);
      ctx.fillStyle = p.label ? '#f76b15' : '#3e63dd';
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.2;
      if (hollow) { ctx.stroke(); } else { ctx.fill(); ctx.stroke(); }
    };
    data.train.forEach((p) => dot(p, false));
    data.test.forEach((p) => dot(p, true));

    const trainAcc = net.accuracy(X(data.train), Y(data.train));
    const testAcc = net.accuracy(X(data.test), Y(data.test));
    const testLoss = lossHistory[lossHistory.length - 1] ?? net.loss(X(data.test), Y(data.test));
    stats.replaceChildren(
      stat('Epoch', String(epoch)),
      stat('Test loss', testLoss.toFixed(3)),
      stat('Train acc', `${Math.round(trainAcc * 100)}%`),
      stat('Test acc', `${Math.round(testAcc * 100)}%`),
    );
    if (epoch > 5) {
      const badges = recordForge(testAcc, dataset);
      if (badges.length) celebrate({ xp: 0, badges, levelUp: null, firstTime: false });
    }

    drawLoss();
    drawNet();

    const now = performance.now();
    if (opts.onPad && (forcePad || now - lastPad > 350)) {
      lastPad = now;
      opts.onPad(padOps());
    }
  }

  function padOps(): VoxelOp[] {
    const ops: VoxelOp[] = [];
    for (let gx = -PAD; gx <= PAD; gx++)
      for (let gz = -PAD; gz <= PAD; gz++) {
        const x = (gx / PAD) * 1.2, y = (-gz / PAD) * 1.2;
        const p = net.predict(featurize(x, y, feats));
        ops.push({ x: gx, y: 0, z: gz, b: BANDS[Math.min(4, Math.floor(p * 5))] });
      }
    for (const p of data.train) {
      const gx = Math.round((p.x / 1.2) * PAD), gz = Math.round((-p.y / 1.2) * PAD);
      if (Math.abs(gx) > PAD || Math.abs(gz) > PAD) continue;
      ops.push({ x: gx, y: 1, z: gz, b: p.label ? B.MAGMA : B.OBSIDIAN });
    }
    return ops;
  }

  function drawLoss() {
    const ctx = lossCanvas.getContext('2d')!;
    const W = lossCanvas.width, H = lossCanvas.height;
    ctx.clearRect(0, 0, W, H);
    if (lossHistory.length < 2) return;
    const max = Math.max(...lossHistory, 0.01);
    ctx.strokeStyle = '#7ef9ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    lossHistory.forEach((l, i) => {
      const x = (i / (lossHistory.length - 1)) * W, y = H - (l / max) * (H - 4) - 2;
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    });
    ctx.stroke();
  }

  function drawNet() {
    const ctx = netCanvas.getContext('2d')!;
    const W = netCanvas.width, H = netCanvas.height;
    ctx.clearRect(0, 0, W, H);
    const sizes = net.sizes;
    const colX = (l: number) => 30 + (l / (sizes.length - 1)) * (W - 60);
    const rowY = (i: number, n: number) => H / 2 + (i - (n - 1) / 2) * Math.min(26, (H - 30) / Math.max(1, n - 1));
    net.layers.forEach((layer, l) => {
      layer.W.forEach((row, j) => row.forEach((w, i) => {
        ctx.strokeStyle = w > 0 ? 'rgba(247,107,21,0.8)' : 'rgba(62,99,221,0.8)';
        ctx.lineWidth = Math.min(4, Math.abs(w) * 1.5) + 0.2;
        ctx.beginPath();
        ctx.moveTo(colX(l), rowY(i, sizes[l]));
        ctx.lineTo(colX(l + 1), rowY(j, sizes[l + 1]));
        ctx.stroke();
      }));
    });
    sizes.forEach((n, l) => {
      for (let i = 0; i < n; i++) {
        ctx.beginPath();
        ctx.arc(colX(l), rowY(i, n), 8, 0, Math.PI * 2);
        ctx.fillStyle = l === 0 ? '#7ef9ff' : l === sizes.length - 1 ? '#ffc53d' : '#e7eaff';
        ctx.fill();
        if (l === 0) {
          ctx.fillStyle = '#c9cdf0';
          ctx.font = '11px Inter, sans-serif';
          ctx.textAlign = 'right';
          ctx.fillText(FEATURES.find((f) => f.id === feats[i])?.label ?? '', colX(0) - 12, rowY(i, n) + 4);
        }
      }
    });
  }

  regen();

  return {
    el,
    destroy() {
      playing = false;
      cancelAnimationFrame(raf);
    },
  };
}

function stat(label: string, value: string) {
  return h('div', { class: 'stat' }, h('span', null, label), h('strong', null, value));
}
