import { describe, expect, it } from 'vitest';
import { buildJsBody } from '../src/runtime/harness';
import { opsFromRaw } from '../src/world/ops';
import { parseColor, propsFromRaw, shapeCost } from '../src/world/shapes';

const runJs = (code: string) => (new Function('console', buildJsBody(code, [], true))(console) as { ops: unknown[] }).ops;

describe('code-built shapes', () => {
  it('shape() records sized, rotated, coloured props next to blocks', () => {
    const ops = runJs(`block(0, 0, 0, 'gold'); shape('sphere', 1, 2, 3, { size: [2, 4], color: 'red', rotate: 45, glow: true });`);
    expect(opsFromRaw(ops)).toHaveLength(1);
    const [p] = propsFromRaw(ops);
    expect(p).toMatchObject({ kind: 'sphere', x: 1, y: 2, z: 3, sx: 2, sy: 4, sz: 2, ry: 45, color: '#e5484d', glow: true });
  });

  it('rejects unknown kinds, bad numbers and clamps sizes', () => {
    const ops = runJs(`shape('dragon', 0, 0, 0); shape('box', NaN, 0, 0); shape('cone', 0, 0, 0, { size: 1000 });`);
    const props = propsFromRaw(ops);
    expect(props).toHaveLength(1);
    expect(props[0].sy).toBe(48);
  });

  it('parses colours safely', () => {
    expect(parseColor('#abc')).toBe('#aabbcc');
    expect(parseColor('#12AB9f')).toBe('#12ab9f');
    expect(parseColor('constructor')).toBe(parseColor('white'));
    expect(parseColor(42)).toBe(parseColor('white'));
  });

  it('prices shapes by their largest side, plus glow', () => {
    expect(shapeCost({ sx: 1, sy: 1, sz: 1, glow: false })).toBe(1);
    expect(shapeCost({ sx: 2.2, sy: 1, sz: 1, glow: true })).toBe(5);
    expect(shapeCost({ sx: 0.2, sy: 0.2, sz: 0.2, glow: false })).toBe(1);
  });
});

describe('Python shape()', () => {
  it('matches the JavaScript encoding', async () => {
    const { loadPyodide } = await import('pyodide');
    const py = await loadPyodide();
    const { PY_PRELUDE } = await import('../src/runtime/harness');
    const ns = py.globals.get('dict')();
    py.runPython(PY_PRELUDE, { globals: ns });
    py.runPython(`shape('torus', 1, 2, 3, size=(2, 1), color='#0f0', rotate=(90, 30, 0), glow=True)`, { globals: ns });
    const ops = JSON.parse(py.runPython('__nc_json(__nc_ops)', { globals: ns }) as string);
    expect(propsFromRaw(ops)[0]).toMatchObject({ kind: 'torus', sx: 2, sy: 1, sz: 2, rx: 90, ry: 30, color: '#00ff00', glow: true });
  }, 120_000);
});
