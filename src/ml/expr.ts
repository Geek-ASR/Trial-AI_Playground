/**
 * A tiny, safe maths-expression compiler for the 3D Function Lab.
 * Recursive-descent parser → closure tree; no eval, no access to globals.
 *
 *   compile('sigmoid(a*x + b*y + c)')  →  { f(vars) → number, vars: Set{'a','b','c','x','y'} }
 *
 * Grammar:  expr := term (('+'|'-') term)*
 *           term := unary (('*'|'/') unary | implicit-multiply)*
 *           unary := ('-'|'+') unary | power
 *           power := atom ('^' unary)?          (right-associative)
 *           atom := number | name | name '(' args ')' | '(' expr ')'
 */

export type Vars = Record<string, number>;
type Node = (v: Vars) => number;

const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));

const FUNCS: Record<string, { n: number | [number, number]; f: (...a: number[]) => number }> = {
  sin: { n: 1, f: Math.sin },
  cos: { n: 1, f: Math.cos },
  tan: { n: 1, f: Math.tan },
  asin: { n: 1, f: Math.asin },
  acos: { n: 1, f: Math.acos },
  atan: { n: 1, f: Math.atan },
  atan2: { n: 2, f: Math.atan2 },
  sinh: { n: 1, f: Math.sinh },
  cosh: { n: 1, f: Math.cosh },
  tanh: { n: 1, f: Math.tanh },
  exp: { n: 1, f: Math.exp },
  log: { n: 1, f: Math.log },
  ln: { n: 1, f: Math.log },
  log2: { n: 1, f: Math.log2 },
  log10: { n: 1, f: Math.log10 },
  sqrt: { n: 1, f: Math.sqrt },
  abs: { n: 1, f: Math.abs },
  sign: { n: 1, f: Math.sign },
  floor: { n: 1, f: Math.floor },
  ceil: { n: 1, f: Math.ceil },
  round: { n: 1, f: Math.round },
  min: { n: [2, 8], f: Math.min },
  max: { n: [2, 8], f: Math.max },
  pow: { n: 2, f: Math.pow },
  hypot: { n: [2, 8], f: Math.hypot },
  // Machine-learning favourites.
  sigmoid: { n: 1, f: sigmoid },
  relu: { n: 1, f: (z) => Math.max(0, z) },
  leaky: { n: 1, f: (z) => (z > 0 ? z : 0.1 * z) },
  softplus: { n: 1, f: (z) => (z > 30 ? z : Math.log1p(Math.exp(z))) },
  gelu: { n: 1, f: (z) => 0.5 * z * (1 + Math.tanh(0.7978845608 * (z + 0.044715 * z ** 3))) },
  swish: { n: 1, f: (z) => z * sigmoid(z) },
  step: { n: 1, f: (z) => (z >= 0 ? 1 : 0) },
  gauss: { n: 1, f: (z) => Math.exp(-z * z) },
};

const CONSTS: Record<string, number> = { pi: Math.PI, e: Math.E, tau: Math.PI * 2 };

export interface Compiled {
  f: (vars: Vars) => number;
  /** Free variables used (x, y, a, b, …), excluding constants and function names. */
  vars: Set<string>;
}

export class ExprError extends Error {
  constructor(message: string, readonly pos: number) {
    super(message);
  }
}

type Tok = { t: 'num'; v: number; p: number } | { t: 'name'; v: string; p: number } | { t: 'op'; v: string; p: number };

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9.]/.test(c)) {
      const m = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(src.slice(i))!;
      if (!m) throw new ExprError(`Unexpected "${c}"`, i);
      out.push({ t: 'num', v: Number(m[0]), p: i });
      i += m[0].length;
      continue;
    }
    if (/[a-z_]/i.test(c)) {
      const m = /^[a-z_][a-z_0-9]*/i.exec(src.slice(i))!;
      out.push({ t: 'name', v: m[0].toLowerCase(), p: i });
      i += m[0].length;
      continue;
    }
    if (c === '*' && src[i + 1] === '*') { out.push({ t: 'op', v: '^', p: i }); i += 2; continue; }
    if ('+-*/^(),'.includes(c)) { out.push({ t: 'op', v: c, p: i }); i++; continue; }
    throw new ExprError(`Unexpected "${c}"`, i);
  }
  return out;
}

export function compile(src: string): Compiled {
  if (src.length > 400) throw new ExprError('Expression is too long', 400);
  const toks = tokenize(src);
  let k = 0;
  const vars = new Set<string>();
  const peek = () => toks[k];
  const isOp = (v: string) => peek()?.t === 'op' && peek()!.v === v;
  const expect = (v: string) => {
    if (!isOp(v)) throw new ExprError(`Expected "${v}"`, peek()?.p ?? src.length);
    k++;
  };

  function expr(): Node {
    let a = term();
    while (isOp('+') || isOp('-')) {
      const op = toks[k++].v, l = a, r = term();
      a = op === '+' ? (v) => l(v) + r(v) : (v) => l(v) - r(v);
    }
    return a;
  }
  function term(): Node {
    let a = unary();
    for (;;) {
      if (isOp('*') || isOp('/')) {
        const op = toks[k++].v, l = a, r = unary();
        a = op === '*' ? (v) => l(v) * r(v) : (v) => l(v) / r(v);
      } else if (peek() && (peek()!.t !== 'op' || peek()!.v === '(')) {
        // Implicit multiplication: 2x, 3(x+1), x y
        const l = a, r = unary();
        a = (v) => l(v) * r(v);
      } else return a;
    }
  }
  function unary(): Node {
    if (isOp('-')) { k++; const a = unary(); return (v) => -a(v); }
    if (isOp('+')) { k++; return unary(); }
    return power();
  }
  function power(): Node {
    const base = atom();
    if (isOp('^')) {
      k++;
      const ex = unary();
      return (v) => Math.pow(base(v), ex(v));
    }
    return base;
  }
  function atom(): Node {
    const t = peek();
    if (!t) throw new ExprError('Unexpected end of expression', src.length);
    if (t.t === 'num') { k++; const n = t.v; return () => n; }
    if (t.t === 'op' && t.v === '(') { k++; const a = expr(); expect(')'); return a; }
    if (t.t === 'name') {
      k++;
      // Own-property lookups only, so names like "constructor" can't reach Object.prototype.
      const fn = Object.hasOwn(FUNCS, t.v) ? FUNCS[t.v] : undefined;
      if (fn && isOp('(')) {
        k++;
        const args: Node[] = [];
        if (!isOp(')')) {
          args.push(expr());
          while (isOp(',')) { k++; args.push(expr()); }
        }
        expect(')');
        const [lo, hi] = Array.isArray(fn.n) ? fn.n : [fn.n, fn.n];
        if (args.length < lo || args.length > hi) throw new ExprError(`${t.v}() takes ${lo === hi ? lo : `${lo}–${hi}`} argument${hi > 1 ? 's' : ''}`, t.p);
        const f = fn.f;
        if (args.length === 1) { const a0 = args[0]; return (v) => f(a0(v)); }
        return (v) => f(...args.map((a) => a(v)));
      }
      if (Object.hasOwn(CONSTS, t.v)) { const c = CONSTS[t.v]; return () => c; }
      if (fn) throw new ExprError(`${t.v} needs brackets, e.g. ${t.v}(x)`, t.p);
      if (t.v.length > 1 && !/^[a-z]\d*$/.test(t.v)) throw new ExprError(`Unknown name "${t.v}"`, t.p);
      const name = t.v;
      vars.add(name);
      return (v) => v[name] ?? 0;
    }
    throw new ExprError(`Unexpected "${t.v}"`, t.p);
  }

  const root = expr();
  if (k < toks.length) throw new ExprError(`Unexpected "${toks[k].v}"`, toks[k].p);
  return { f: root, vars };
}

/** Central-difference gradient of f with respect to x and y. */
export function gradient(f: (v: Vars) => number, vars: Vars, h = 1e-3): [number, number] {
  const fx = (f({ ...vars, x: vars.x + h }) - f({ ...vars, x: vars.x - h })) / (2 * h);
  const fy = (f({ ...vars, y: vars.y + h }) - f({ ...vars, y: vars.y - h })) / (2 * h);
  return [fx, fy];
}
