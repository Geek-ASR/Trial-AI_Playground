import { beforeAll, describe, expect, it } from 'vitest';
import { LESSONS } from '../src/curriculum';
import { buildJsBody, matches, PY_PRELUDE, pyCallExpr, toPlain } from '../src/runtime/harness';
import { PAD } from '../src/curriculum/viz';

function runJs(code: string, calls: string[]) {
  const fn = new Function('console', buildJsBody(code, calls, false));
  return (fn({ log() {} }) as { results: { ok: boolean; value?: unknown; error?: string }[] }).results.map((r) => ({
    ...r,
    value: toPlain(r.value),
  }));
}

describe('curriculum', () => {
  it('has unique ids and function names per lesson', () => {
    const ids = new Set(LESSONS.map((l) => l.id));
    expect(ids.size).toBe(LESSONS.length);
    for (const l of LESSONS) {
      expect(l.tests.length).toBeGreaterThan(0);
      expect(l.starter.js).toContain(l.fn);
      expect(l.starter.py).toContain(l.fn);
    }
  });

  for (const lesson of LESSONS) {
    it(`${lesson.id}: JS solution passes, starter does not`, () => {
      const res = runJs(lesson.solution.js, lesson.tests.map((t) => t.call));
      res.forEach((r, i) => {
        expect(r.error, `${lesson.tests[i].call}`).toBeUndefined();
        expect(matches(r.value, lesson.tests[i].expect, lesson.tests[i].tol), `${lesson.tests[i].call} -> ${JSON.stringify(r.value)}`).toBe(true);
      });
      const starter = runJs(lesson.starter.js, lesson.tests.map((t) => t.call));
      const allPass = starter.every((r, i) => r.ok && matches(r.value, lesson.tests[i].expect, lesson.tests[i].tol));
      expect(allPass).toBe(false);
    });

    if (lesson.viz) {
      it(`${lesson.id}: visualisation renders inside the pad`, () => {
        const res = runJs(lesson.solution.js, lesson.viz!.calls);
        res.forEach((r) => expect(r.error).toBeUndefined());
        const ops = lesson.viz!.render(res.map((r) => r.value));
        expect(ops.length).toBeGreaterThan(0);
        for (const o of ops) {
          expect(Math.abs(o.x)).toBeLessThanOrEqual(PAD);
          expect(Math.abs(o.z)).toBeLessThanOrEqual(PAD);
          expect(o.y).toBeGreaterThanOrEqual(0);
          expect(o.y).toBeLessThan(20);
        }
      });
    }
  }
});

describe('curriculum (Python via Pyodide)', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let py: any;
  beforeAll(async () => {
    const { loadPyodide } = await import('pyodide');
    py = await loadPyodide();
  });

  for (const lesson of LESSONS) {
    it(`${lesson.id}: Python solution passes, starter does not`, () => {
      const check = (code: string) => {
        const ns = py.globals.get('dict')();
        py.runPython(PY_PRELUDE, { globals: ns });
        py.runPython(code, { globals: ns });
        const out = lesson.tests.map((t) => {
          try {
            return { ok: true, value: JSON.parse(py.runPython(pyCallExpr(t.call), { globals: ns })) };
          } catch (e) {
            return { ok: false, error: String(e) };
          }
        });
        ns.destroy();
        return out;
      };
      const sol = check(lesson.solution.py);
      sol.forEach((r, i) => {
        expect(r.ok, `${lesson.tests[i].call}: ${r.error}`).toBe(true);
        expect(matches(r.value, lesson.tests[i].expect, lesson.tests[i].tol), `${lesson.tests[i].call} -> ${JSON.stringify(r.value)}`).toBe(true);
      });
      const starter = check(lesson.starter.py);
      expect(starter.every((r, i) => r.ok && matches(r.value, lesson.tests[i].expect, lesson.tests[i].tol))).toBe(false);
    });
  }
});
