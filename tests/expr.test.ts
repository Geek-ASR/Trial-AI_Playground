import { describe, expect, it } from 'vitest';
import { compile, ExprError, gradient } from '../src/ml/expr';

const ev = (src: string, vars: Record<string, number> = {}) => compile(src).f(vars);

describe('expression compiler', () => {
  it('follows operator precedence and associativity', () => {
    expect(ev('1 + 2 * 3')).toBe(7);
    expect(ev('(1 + 2) * 3')).toBe(9);
    expect(ev('2 ^ 3 ^ 2')).toBe(512);
    expect(ev('-2 ^ 2')).toBe(-4);
    expect(ev('2 ** 3')).toBe(8);
    expect(ev('10 / 4 - 1')).toBe(1.5);
    expect(ev('1.5e2')).toBe(150);
  });

  it('supports variables, constants and implicit multiplication', () => {
    expect(ev('2x + 3y', { x: 1, y: 2 })).toBe(8);
    expect(ev('3(x + 1)', { x: 1 })).toBe(6);
    expect(ev('pi')).toBeCloseTo(Math.PI);
    expect(compile('a*x + b*y + c').vars).toEqual(new Set(['a', 'x', 'b', 'y', 'c']));
  });

  it('has the usual maths and ML functions', () => {
    expect(ev('sigmoid(0)')).toBe(0.5);
    expect(ev('relu(-3) + relu(2)')).toBe(2);
    expect(ev('max(1, 5, 3)')).toBe(5);
    expect(ev('tanh(0) + cos(0)')).toBe(1);
    expect(ev('softplus(0)')).toBeCloseTo(Math.log(2));
    expect(ev('gelu(0)')).toBe(0);
  });

  it('rejects anything that is not maths', () => {
    for (const bad of ['alert(1)', 'x +', '(x', 'sin x', 'constructor', 'x;y', 'sin(1,2)', '"a"', 'window.x']) {
      expect(() => compile(bad), bad).toThrow(ExprError);
    }
  });

  it('computes numerical gradients', () => {
    const { f } = compile('x^2 + 3y');
    const [gx, gy] = gradient(f, { x: 2, y: 5 });
    expect(gx).toBeCloseTo(4, 4);
    expect(gy).toBeCloseTo(3, 4);
  });
});
