/**
 * Pure, environment-independent pieces of the code runner. Kept free of DOM and
 * worker APIs so they can be unit-tested in Node and shared by both workers.
 */

export interface CallResult {
  ok: boolean;
  value?: unknown;
  error?: string;
}

export interface RunRequest {
  id: number;
  lang: 'js' | 'py';
  code: string;
  /** Expressions to evaluate after the code has run (lesson tests / viz). */
  calls: string[];
  /** When true, expose the world-builder API and return the voxel ops. */
  build: boolean;
}

export interface RunResponse {
  id: number;
  ok: boolean;
  error?: string;
  stdout: string;
  results: CallResult[];
  ops: unknown[];
}

export const BUILDER_API_JS = `
const __ops = [];
const __MAX = 60000;
function __push(x, y, z, t) {
  if (__ops.length >= __MAX) throw new Error('Too many blocks: builds are limited to ' + __MAX + ' blocks.');
  __ops.push([x, y, z, t === undefined ? 'stone' : t]);
}
function block(x, y, z, type) { __push(x, y, z, type); }
function fill(x1, y1, z1, x2, y2, z2, type) {
  const [ax, bx] = [Math.min(x1, x2), Math.max(x1, x2)];
  const [ay, by] = [Math.min(y1, y2), Math.max(y1, y2)];
  const [az, bz] = [Math.min(z1, z2), Math.max(z1, z2)];
  for (let x = ax; x <= bx; x++) for (let y = ay; y <= by; y++) for (let z = az; z <= bz; z++) __push(x, y, z, type);
}
function sphere(cx, cy, cz, r, type, hollow) {
  const R = Math.ceil(r);
  for (let x = -R; x <= R; x++) for (let y = -R; y <= R; y++) for (let z = -R; z <= R; z++) {
    const d = Math.sqrt(x * x + y * y + z * z);
    if (d <= r && (!hollow || d > r - 1)) __push(cx + x, cy + y, cz + z, type);
  }
}
function line(x1, y1, z1, x2, y2, z2, type) {
  const n = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1), Math.abs(z2 - z1), 1);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    __push(Math.round(x1 + (x2 - x1) * t), Math.round(y1 + (y2 - y1) * t), Math.round(z1 + (z2 - z1) * t), type);
  }
}
`;

/**
 * Build the body of a `new Function('console', body)` that runs learner code and
 * then evaluates each call, capturing per-call errors.
 */
export function buildJsBody(code: string, calls: string[], build: boolean): string {
  const evals = calls
    .map(
      (c) =>
        `(() => { try { return { ok: true, value: (${c}) }; } catch (e) { return { ok: false, error: String((e && e.message) || e) }; } })()`,
    )
    .join(',\n');
  return `"use strict";
${build ? BUILDER_API_JS : 'const __ops = [];'}
${code}
;return { results: [${evals}], ops: __ops };`;
}

/** Python helpers: JSON conversion for any result (numpy included) and the builder API. */
export const PY_PRELUDE = `
import json as __json, math as __math

def __nc_clean(o):
    if hasattr(o, 'tolist'):
        o = o.tolist()
    if isinstance(o, bool) or o is None or isinstance(o, str):
        return o
    if isinstance(o, int):
        return o
    if isinstance(o, float):
        return o if __math.isfinite(o) else str(o)
    if isinstance(o, (list, tuple, range)):
        return [__nc_clean(x) for x in o]
    if isinstance(o, dict):
        return {str(k): __nc_clean(v) for k, v in o.items()}
    try:
        return [__nc_clean(x) for x in o]
    except TypeError:
        return str(o)

def __nc_json(o):
    return __json.dumps(__nc_clean(o))

__nc_ops = []
__NC_MAX = 60000

def __nc_push(x, y, z, t):
    if len(__nc_ops) >= __NC_MAX:
        raise RuntimeError('Too many blocks: builds are limited to %d blocks.' % __NC_MAX)
    __nc_ops.append([x, y, z, t])

def block(x, y, z, type='stone'):
    __nc_push(x, y, z, type)

def fill(x1, y1, z1, x2, y2, z2, type='stone'):
    for x in range(min(x1, x2), max(x1, x2) + 1):
        for y in range(min(y1, y2), max(y1, y2) + 1):
            for z in range(min(z1, z2), max(z1, z2) + 1):
                __nc_push(x, y, z, type)

def sphere(cx, cy, cz, r, type='stone', hollow=False):
    R = int(__math.ceil(r))
    for x in range(-R, R + 1):
        for y in range(-R, R + 1):
            for z in range(-R, R + 1):
                d = __math.sqrt(x * x + y * y + z * z)
                if d <= r and (not hollow or d > r - 1):
                    __nc_push(cx + x, cy + y, cz + z, type)

def line(x1, y1, z1, x2, y2, z2, type='stone'):
    n = max(abs(x2 - x1), abs(y2 - y1), abs(z2 - z1), 1)
    for i in range(n + 1):
        t = i / n
        __nc_push(round(x1 + (x2 - x1) * t), round(y1 + (y2 - y1) * t), round(z1 + (z2 - z1) * t), type)
`;

export function pyCallExpr(call: string): string {
  return `__nc_json(${call})`;
}

/** Make any value safe to send through postMessage and compare later. */
export function toPlain(v: unknown, depth = 0): unknown {
  if (depth > 20) return null;
  if (v === null || v === undefined) return null;
  if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') return v;
  if (typeof v === 'bigint') return Number(v);
  if (ArrayBuffer.isView(v)) return Array.from(v as unknown as ArrayLike<number>);
  if (Array.isArray(v)) return v.map((x) => toPlain(x, depth + 1));
  if (typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) out[k] = toPlain(x, depth + 1);
    return out;
  }
  return String(v);
}

/** Deep equality with numeric tolerance. */
export function matches(actual: unknown, expected: unknown, tol = 1e-6): boolean {
  if (typeof expected === 'number') {
    if (typeof actual === 'boolean') return false;
    const a = typeof actual === 'string' ? Number(actual) : actual;
    if (typeof a !== 'number' || Number.isNaN(a)) return false;
    return Math.abs(a - expected) <= tol + 1e-9 * Math.abs(expected);
  }
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || actual.length !== expected.length) return false;
    return expected.every((e, i) => matches(actual[i], e, tol));
  }
  if (expected && typeof expected === 'object') {
    if (!actual || typeof actual !== 'object' || Array.isArray(actual)) return false;
    return Object.entries(expected).every(([k, e]) => matches((actual as Record<string, unknown>)[k], e, tol));
  }
  return actual === expected;
}

export function formatValue(v: unknown, depth = 0): string {
  if (typeof v === 'number') {
    if (Number.isInteger(v)) return String(v);
    return String(Math.round(v * 10000) / 10000);
  }
  if (typeof v === 'string') return JSON.stringify(v);
  if (Array.isArray(v)) {
    if (depth > 3) return '[…]';
    const shown = v.slice(0, 12).map((x) => formatValue(x, depth + 1));
    return `[${shown.join(', ')}${v.length > 12 ? `, … (${v.length} items)` : ''}]`;
  }
  if (v === null || v === undefined) return 'None / null';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}
