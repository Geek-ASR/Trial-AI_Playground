import { describe, expect, it } from 'vitest';
import { CODE_CHALLENGES, CODE_TOLERANCE } from '../src/challenges/code';
import { isCorrect, mathQuestionOfKind, MATH_KINDS, parseAnswer } from '../src/challenges/math';
import { QUIZ } from '../src/challenges/quiz';
import { buildJsBody, matches, PY_PRELUDE, pyCallExpr } from '../src/runtime/harness';
import { mulberry32 } from '../src/ml/rng';

const runJs = (code: string, calls: string[]) =>
  (new Function('console', buildJsBody(code, calls, false))(console) as { results: { ok: boolean; value?: unknown }[] }).results;

describe('quiz bank', () => {
  it('has well-formed questions with unique ids', () => {
    expect(QUIZ.length).toBeGreaterThanOrEqual(40);
    expect(new Set(QUIZ.map((q) => q.id)).size).toBe(QUIZ.length);
    for (const q of QUIZ) {
      expect(q.options.length, q.id).toBe(4);
      expect(q.answer, q.id).toBeGreaterThanOrEqual(0);
      expect(q.answer, q.id).toBeLessThan(4);
      expect(new Set(q.options).size, q.id).toBe(4);
    }
  });
});

describe('math questions', () => {
  it('every generator produces a question its own answer satisfies', () => {
    const r = mulberry32(3);
    for (let k = 0; k < MATH_KINDS; k++)
      for (let n = 0; n < 30; n++) {
        const q = mathQuestionOfKind(k, r);
        expect(Number.isFinite(q.answer), q.prompt).toBe(true);
        expect(isCorrect(q, String(q.answer)), q.prompt).toBe(true);
        expect(isCorrect(q, String(q.answer + 1)), q.prompt).toBe(false);
      }
  });

  it('parses fractions, percentages and decimals', () => {
    expect(parseAnswer('1/4')).toBe(0.25);
    expect(parseAnswer('25%')).toBe(0.25);
    expect(parseAnswer(' -3.5 ')).toBe(-3.5);
    expect(parseAnswer('abc')).toBeNaN();
  });
});

describe('code challenges', () => {
  it('reference JavaScript solutions pass and starters fail', () => {
    for (const c of CODE_CHALLENGES) {
      const calls = c.tests.map((t) => t.call);
      const ok = runJs(c.solution.js, calls);
      c.tests.forEach((t, i) => expect(matches(ok[i].value, t.expect, CODE_TOLERANCE), `${c.id} ${t.call}`).toBe(true));
      const starter = runJs(c.starter.js, calls);
      expect(starter.every((r, i) => r.ok && matches(r.value, c.tests[i].expect, CODE_TOLERANCE)), c.id).toBe(false);
    }
  });

  it('reference Python solutions pass', async () => {
    const { loadPyodide } = await import('pyodide');
    const py = await loadPyodide();
    for (const c of CODE_CHALLENGES) {
      const ns = py.globals.get('dict')();
      py.runPython(PY_PRELUDE, { globals: ns });
      py.runPython(c.solution.py, { globals: ns });
      for (const t of c.tests) {
        const v = JSON.parse(py.runPython(pyCallExpr(t.call), { globals: ns }) as string);
        expect(matches(v, t.expect, CODE_TOLERANCE), `${c.id} ${t.call} → ${JSON.stringify(v)}`).toBe(true);
      }
    }
  }, 120_000);
});
