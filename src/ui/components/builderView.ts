import type { Lang } from '../../curriculum/types';
import { progress, recordBuild } from '../../progress/store';
import { run } from '../../runtime/sandbox';
import { PLACEABLE_NAMES } from '../../world/blocks';
import { opsFromRaw, type VoxelOp } from '../../world/ops';
import { NAMED_COLORS, propsFromRaw, SHAPE_KINDS, type Prop } from '../../world/shapes';
import { credits } from '../../progress/credits';
import { clear, h } from '../dom';
import { BUILD_EXAMPLES } from './builderExamples';
import { createEditor, type CodeEditor } from './editor';
import { celebrate } from './lessonView';
import { toast } from './toast';

type Mode = 'blocks' | Lang;

export interface BuilderOptions {
  /** Place blocks and shapes in the world (costs block credits). */
  onBuild: (ops: VoxelOp[], shapes: Prop[]) => { blocks: number; shapes: number; cost: number; short?: number };
  onUndo: () => number;
  /** Open the “earn blocks” challenges. */
  onEarn?: () => void;
}

const CODE_KEY = 'nc.builder.v1';

function loadSaved(): Partial<Record<Mode, string>> {
  try {
    return JSON.parse(localStorage.getItem(CODE_KEY) ?? '{}');
  } catch {
    return {};
  }
}

// Blockly is ~1 MB, so it's only downloaded when someone opens the Blocks tab.
type BlocklyModule = typeof import('blockly');
type BlocklyWorkspace = import('blockly').WorkspaceSvg;
let blocklyReady: Promise<{ Blockly: BlocklyModule; toCode: (ws: BlocklyWorkspace) => string }> | null = null;

function loadBlockly() {
  blocklyReady ??= (async () => {
    const Blockly = await import('blockly');
    const { javascriptGenerator, Order } = await import('blockly/javascript');
    const typeOptions = PLACEABLE_NAMES.map((n) => [n, n]);
    const xyz = (prefix = '') => [
      { type: 'input_value', name: `${prefix}X`, check: 'Number' },
      { type: 'input_value', name: `${prefix}Y`, check: 'Number' },
      { type: 'input_value', name: `${prefix}Z`, check: 'Number' },
    ];
    Blockly.common.defineBlocksWithJsonArray([
      {
        type: 'nc_block',
        message0: 'place %1 at x %2 y %3 z %4',
        args0: [{ type: 'field_dropdown', name: 'TYPE', options: typeOptions }, ...xyz()],
        inputsInline: true, previousStatement: null, nextStatement: null, colour: 20,
        tooltip: 'Place one block. x = right, y = up, z = away from you.',
      },
      {
        type: 'nc_fill',
        message0: 'fill %1 from x %2 y %3 z %4 to x %5 y %6 z %7',
        args0: [{ type: 'field_dropdown', name: 'TYPE', options: typeOptions }, ...xyz('A'), ...xyz('B')],
        inputsInline: true, previousStatement: null, nextStatement: null, colour: 40,
        tooltip: 'Fill a box between two corners.',
      },
      {
        type: 'nc_sphere',
        message0: 'sphere of %1 at x %2 y %3 z %4 radius %5 hollow %6',
        args0: [
          { type: 'field_dropdown', name: 'TYPE', options: typeOptions }, ...xyz(),
          { type: 'input_value', name: 'R', check: 'Number' },
          { type: 'field_checkbox', name: 'HOLLOW', checked: false },
        ],
        inputsInline: true, previousStatement: null, nextStatement: null, colour: 60,
      },
      {
        type: 'nc_shape',
        message0: 'shape %1 at x %2 y %3 z %4 size w %5 h %6 d %7 turn %8 ° colour %9 glow %10',
        args0: [
          { type: 'field_dropdown', name: 'KIND', options: SHAPE_KINDS.map((k) => [k, k]) }, ...xyz(),
          { type: 'input_value', name: 'W', check: 'Number' },
          { type: 'input_value', name: 'H', check: 'Number' },
          { type: 'input_value', name: 'D', check: 'Number' },
          { type: 'input_value', name: 'ROT', check: 'Number' },
          { type: 'field_dropdown', name: 'COLOR', options: Object.keys(NAMED_COLORS).filter((c) => c !== 'gray').map((c) => [c, c]) },
          { type: 'field_checkbox', name: 'GLOW', checked: false },
        ],
        inputsInline: true, previousStatement: null, nextStatement: null, colour: 290,
        tooltip: 'A smooth shape of any size: its base sits on block (x, y, z).',
      },
      {
        type: 'nc_line',
        message0: 'line of %1 from x %2 y %3 z %4 to x %5 y %6 z %7',
        args0: [{ type: 'field_dropdown', name: 'TYPE', options: typeOptions }, ...xyz('A'), ...xyz('B')],
        inputsInline: true, previousStatement: null, nextStatement: null, colour: 80,
      },
    ]);
    const g = javascriptGenerator;
    const v = (b: import('blockly').Block, name: string) => g.valueToCode(b, name, Order.NONE) || '0';
    const t = (b: import('blockly').Block) => JSON.stringify(b.getFieldValue('TYPE'));
    g.forBlock['nc_block'] = (b) => `block(${v(b, 'X')}, ${v(b, 'Y')}, ${v(b, 'Z')}, ${t(b)});\n`;
    g.forBlock['nc_fill'] = (b) => `fill(${v(b, 'AX')}, ${v(b, 'AY')}, ${v(b, 'AZ')}, ${v(b, 'BX')}, ${v(b, 'BY')}, ${v(b, 'BZ')}, ${t(b)});\n`;
    g.forBlock['nc_line'] = (b) => `line(${v(b, 'AX')}, ${v(b, 'AY')}, ${v(b, 'AZ')}, ${v(b, 'BX')}, ${v(b, 'BY')}, ${v(b, 'BZ')}, ${t(b)});\n`;
    g.forBlock['nc_shape'] = (b) =>
      `shape(${JSON.stringify(b.getFieldValue('KIND'))}, ${v(b, 'X')}, ${v(b, 'Y')}, ${v(b, 'Z')}, { size: [${v(b, 'W')}, ${v(b, 'H')}, ${v(b, 'D')}], rotate: ${v(b, 'ROT')}, color: ${JSON.stringify(b.getFieldValue('COLOR'))}, glow: ${b.getFieldValue('GLOW') === 'TRUE'} });\n`;
    g.forBlock['nc_sphere'] = (b) =>
      `sphere(${v(b, 'X')}, ${v(b, 'Y')}, ${v(b, 'Z')}, ${v(b, 'R')}, ${t(b)}, ${b.getFieldValue('HOLLOW') === 'TRUE'});\n`;
    return { Blockly, toCode: (ws: BlocklyWorkspace) => g.workspaceToCode(ws) };
  })();
  return blocklyReady;
}

const num = (n: number) => ({ shadow: { type: 'math_number', fields: { NUM: n } } });

const TOOLBOX = {
  kind: 'categoryToolbox',
  contents: [
    { kind: 'category', name: 'World', colour: '20', contents: [
      { kind: 'block', type: 'nc_block', inputs: { X: num(0), Y: num(0), Z: num(0) } },
      { kind: 'block', type: 'nc_fill', inputs: { AX: num(0), AY: num(0), AZ: num(0), BX: num(4), BY: num(4), BZ: num(4) } },
      { kind: 'block', type: 'nc_sphere', inputs: { X: num(0), Y: num(4), Z: num(6), R: num(4) } },
      { kind: 'block', type: 'nc_line', inputs: { AX: num(0), AY: num(0), AZ: num(0), BX: num(0), BY: num(10), BZ: num(10) } },
    ] },
    { kind: 'category', name: 'Shapes', colour: '290', contents: [
      { kind: 'block', type: 'nc_shape', inputs: { X: num(0), Y: num(0), Z: num(4), W: num(2), H: num(2), D: num(2), ROT: num(0) } },
    ] },
    { kind: 'category', name: 'Loops', colour: '120', contents: [
      { kind: 'block', type: 'controls_repeat_ext', inputs: { TIMES: num(10) } },
      { kind: 'block', type: 'controls_for', inputs: { FROM: num(0), TO: num(9), BY: num(1) } },
      { kind: 'block', type: 'controls_whileUntil' },
    ] },
    { kind: 'category', name: 'Logic', colour: '210', contents: [
      { kind: 'block', type: 'controls_if' },
      { kind: 'block', type: 'logic_compare' },
      { kind: 'block', type: 'logic_operation' },
      { kind: 'block', type: 'logic_boolean' },
    ] },
    { kind: 'category', name: 'Math', colour: '230', contents: [
      { kind: 'block', type: 'math_number' },
      { kind: 'block', type: 'math_arithmetic', inputs: { A: num(1), B: num(1) } },
      { kind: 'block', type: 'math_single' },
      { kind: 'block', type: 'math_trig', inputs: { NUM: num(45) } },
      { kind: 'block', type: 'math_round' },
      { kind: 'block', type: 'math_modulo', inputs: { DIVIDEND: num(10), DIVISOR: num(3) } },
      { kind: 'block', type: 'math_random_int', inputs: { FROM: num(0), TO: num(10) } },
    ] },
    { kind: 'category', name: 'Variables', colour: '330', custom: 'VARIABLE' },
  ],
};

const STARTER_BLOCKS = {
  blocks: {
    languageVersion: 0,
    blocks: [
      {
        type: 'controls_for', x: 24, y: 24,
        fields: { VAR: { id: 'var-i' } },
        inputs: {
          FROM: num(0), TO: num(12), BY: num(1),
          DO: { block: {
            type: 'nc_block', fields: { TYPE: 'gold' },
            inputs: {
              X: num(0),
              Y: { shadow: { type: 'math_number', fields: { NUM: 0 } }, block: { type: 'variables_get', fields: { VAR: { id: 'var-i' } } } },
              Z: { shadow: { type: 'math_number', fields: { NUM: 0 } }, block: { type: 'variables_get', fields: { VAR: { id: 'var-i' } } } },
            },
          } },
        },
      },
    ],
  },
  variables: [{ name: 'i', id: 'var-i' }],
};

export function builderView(opts: BuilderOptions): { el: HTMLElement; destroy(): void } {
  const saved = loadSaved();
  let mode: Mode = (saved as { mode?: Mode }).mode ?? 'blocks';
  let editor: CodeEditor | null = null;
  let ws: BlocklyWorkspace | null = null;
  let busy = false;

  const store = () => {
    const data: Record<string, string> = { ...(loadSaved() as Record<string, string>), mode };
    if (editor && mode !== 'blocks') data[mode] = editor.get();
    try {
      localStorage.setItem(CODE_KEY, JSON.stringify(data));
    } catch { /* ignore */ }
  };

  const status = h('div', { class: 'builder-status', 'aria-live': 'polite' });
  const wallet = h('p', { class: 'muted small builder-wallet' },
    `You have ⚡ ${credits().toLocaleString()} block credits. `,
    opts.onEarn ? h('button', { class: 'linklike', onclick: () => opts.onEarn?.() }, 'Earn more →') : null);
  const body = h('div', { class: 'builder-body' });
  const tabs = (['blocks', 'py', 'js'] as Mode[]).map((m) =>
    h('button', { class: `seg${m === mode ? ' active' : ''}`, onclick: () => setMode(m) }, m === 'blocks' ? '🧩 Blocks' : m === 'py' ? '🐍 Python' : '⚡ JavaScript'),
  );
  const examples = h('select', { class: 'select', 'aria-label': 'Load an example' },
    h('option', { value: '' }, 'Load an example…'),
    BUILD_EXAMPLES.map((e) => h('option', { value: e.id }, `${e.name} — ${e.blurb}`)),
  );
  examples.addEventListener('change', () => {
    const ex = BUILD_EXAMPLES.find((e) => e.id === examples.value);
    examples.value = '';
    if (!ex) return;
    if (mode === 'blocks') setMode(progress().lang);
    editor?.set(mode === 'py' ? ex.py : ex.js, mode as Lang);
    store();
  });

  const el = h('div', { class: 'builder' },
    h('header', { class: 'panel-title' },
      h('h2', null, '🧱 Code Builder'),
      h('p', { class: 'muted' }, 'Build in the world with blocks or real code. ', h('code', null, '(0, 0, 0)'), ' is 3 blocks in front of you: x → right, y → up, z → away.'),
    ),
    h('div', { class: 'editor-toolbar' }, h('div', { class: 'segmented' }, tabs), examples),
    body,
    h('div', { class: 'lesson-actions' },
      h('button', { class: 'btn btn-primary', onclick: () => build() }, '▶ Build it'),
      h('button', { class: 'btn', onclick: () => {
        const n = opts.onUndo();
        status.textContent = n ? `Undid ${n} blocks and shapes; credits refunded.` : 'Nothing to undo.';
        wallet.firstChild!.textContent = `You have ⚡ ${credits().toLocaleString()} block credits. `;
      } }, '↶ Undo last build'),
      h('span', { class: 'kbd-hint' }, 'API: block · fill · sphere · line · shape'),
    ),
    wallet,
    status,
    h('details', { class: 'api-help' },
      h('summary', null, 'Builder API reference'),
      h('pre', null, `block(x, y, z, type)                 # one block
fill(x1, y1, z1, x2, y2, z2, type)   # a solid box
sphere(x, y, z, radius, type, hollow)
line(x1, y1, z1, x2, y2, z2, type)

# Smooth shapes of any size, turn and colour (not stuck to the grid):
shape(kind, x, y, z, size=2, color='cyan', rotate=45, glow=True)      # Python
shape(kind, x, y, z, { size: [4, 1, 2], color: '#ff8800', rotate: [0, 30, 0], glow: false })  // JS
  kinds: ${SHAPE_KINDS.join(', ')}
  size: one number, or [width, height, depth] · rotate: degrees (turn), or [x, y, z]
  color: a name (${Object.keys(NAMED_COLORS).slice(0, 10).join(', ')}, …) or '#rrggbb'

types: ${PLACEABLE_NAMES.join(', ')}, air (erases)

Costs: 1 ⚡ per block (glowing blocks 3), erasing is free; a shape costs its
largest side (rounded up), +2 if it glows. Undo refunds the last build.`),
    ),
  );

  async function setMode(m: Mode) {
    if (editor && mode !== 'blocks') store();
    mode = m;
    tabs.forEach((t, i) => t.classList.toggle('active', (['blocks', 'py', 'js'] as Mode[])[i] === m));
    editor?.destroy();
    editor = null;
    ws?.dispose();
    ws = null;
    clear(body);
    store();
    if (m === 'blocks') {
      const host = h('div', { class: 'blockly-host' }, h('div', { class: 'muted pad' }, 'Loading blocks…'));
      const showCode = h('button', { class: 'btn btn-ghost small', onclick: async () => {
        const { toCode } = await loadBlockly();
        if (!ws) return;
        const code = toCode(ws);
        setMode('js').then(() => editor?.set(`// Generated from your blocks — now it's real JavaScript!\n${code}`, 'js'));
      } }, '⇢ Turn my blocks into JavaScript');
      body.append(host, showCode);
      const { Blockly } = await loadBlockly();
      if (mode !== 'blocks') return;
      clear(host);
      const theme = Blockly.Theme.defineTheme('nc-dark', {
        name: 'nc-dark',
        base: Blockly.Themes.Classic,
        componentStyles: {
          workspaceBackgroundColour: '#11142a',
          toolboxBackgroundColour: '#191d38',
          toolboxForegroundColour: '#e7eaff',
          flyoutBackgroundColour: '#20254a',
          flyoutForegroundColour: '#e7eaff',
          flyoutOpacity: 0.95,
          scrollbarColour: '#3a4180',
          insertionMarkerColour: '#7ef9ff',
        },
      });
      ws = Blockly.inject(host, { toolbox: TOOLBOX, theme, media: './blockly-media/', trashcan: true, zoom: { controls: true, startScale: 0.85 }, renderer: 'zelos' });
      try {
        const savedBlocks = localStorage.getItem('nc.blocks.v1');
        Blockly.serialization.workspaces.load(savedBlocks ? JSON.parse(savedBlocks) : STARTER_BLOCKS, ws);
      } catch {
        Blockly.serialization.workspaces.load(STARTER_BLOCKS, ws);
      }
      ws.addChangeListener(() => {
        try {
          if (ws) localStorage.setItem('nc.blocks.v1', JSON.stringify(Blockly.serialization.workspaces.save(ws)));
        } catch { /* ignore */ }
      });
      requestAnimationFrame(() => ws && Blockly.svgResize(ws));
    } else {
      const host = h('div', { class: 'editor-host tall' });
      body.append(host);
      const all = loadSaved();
      const ex = BUILD_EXAMPLES[0];
      editor = createEditor(host, all[m] ?? (m === 'py' ? ex.py : ex.js), m, { onRun: () => build(), onChange: () => store() });
    }
  }

  async function build() {
    if (busy) return;
    busy = true;
    status.textContent = 'Running…';
    let code = '';
    let lang: Lang = 'js';
    if (mode === 'blocks') {
      const { toCode } = await loadBlockly();
      code = ws ? toCode(ws) : '';
    } else {
      code = editor?.get() ?? '';
      lang = mode;
    }
    const res = await run(lang, code, [], true);
    busy = false;
    if (!res.ok) {
      status.innerHTML = '';
      status.append(h('span', { class: 'result-error' }, '✖ ', res.error ?? 'Error'));
      if (res.stdout) status.append(h('pre', { class: 'stdout' }, res.stdout));
      return;
    }
    const ops = opsFromRaw(res.ops);
    const shapes = propsFromRaw(res.ops);
    if (!ops.length && !shapes.length) {
      status.textContent = 'Your program ran but built nothing. Call block(), fill(), sphere(), line() or shape().';
      return;
    }
    const r = opts.onBuild(ops, shapes);
    wallet.firstChild!.textContent = `You have ⚡ ${credits().toLocaleString()} block credits. `;
    if (r.short) {
      status.replaceChildren(
        h('span', { class: 'result-error' }, `✖ This build costs ⚡ ${r.cost.toLocaleString()} but you have ${credits().toLocaleString()}. `),
        opts.onEarn ? h('button', { class: 'btn small', onclick: () => opts.onEarn?.() }, '⚡ Earn more credits') : '',
        h('p', { class: 'muted small' }, 'Tip: shrink the build, or erase with type "air" (free).'),
      );
      return;
    }
    const n = r.blocks + r.shapes;
    const what = [r.blocks ? `${r.blocks.toLocaleString()} blocks` : '', r.shapes ? `${r.shapes.toLocaleString()} shapes` : ''].filter(Boolean).join(' and ');
    status.textContent = `Built ${what} for ⚡ ${r.cost.toLocaleString()} in ${Math.round(res.ms)} ms. Close this panel to admire it!`;
    if (res.stdout) status.append(h('pre', { class: 'stdout' }, res.stdout));
    const badges = recordBuild(n);
    if (badges.length) celebrate({ xp: 0, badges, levelUp: null, firstTime: false });
    else toast('🧱 Built!', `${what} placed.`, 'success', 2500);
  }

  queueMicrotask(() => setMode(mode));

  return {
    el,
    destroy() {
      store();
      editor?.destroy();
      ws?.dispose();
    },
  };
}
