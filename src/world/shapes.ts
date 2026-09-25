/**
 * Free-form shapes ("props") that code can place in the world alongside voxels:
 * any size, any rotation, any colour, optionally glowing. Pure data + validation;
 * rendering lives in render/propField.ts.
 */

export const SHAPE_KINDS = ['box', 'sphere', 'cylinder', 'cone', 'pyramid', 'torus', 'capsule', 'dome', 'wedge'] as const;
export type ShapeKind = (typeof SHAPE_KINDS)[number];

export interface Prop {
  kind: ShapeKind;
  /** Position of the base centre, in blocks: (x + 0.5, y, z + 0.5). Fractions are allowed. */
  x: number;
  y: number;
  z: number;
  /** Width (x), height (y) and depth (z) in blocks. */
  sx: number;
  sy: number;
  sz: number;
  /** Rotation in degrees about x, y (turn) and z. */
  rx: number;
  ry: number;
  rz: number;
  color: string;
  glow: boolean;
}

export const MAX_SIZE = 48;
export const MAX_PROPS_PER_BUILD = 2000;

export const NAMED_COLORS: Record<string, string> = {
  white: '#f4f6ff', black: '#16171d', grey: '#8a8f9e', gray: '#8a8f9e', silver: '#c4c9d6',
  red: '#e5484d', orange: '#f76b15', yellow: '#ffc53d', gold: '#e8b93c', lime: '#99d52a',
  green: '#30a46c', teal: '#12a594', cyan: '#7ef9ff', sky: '#68ddfd', blue: '#3e63dd',
  indigo: '#5b5bd6', purple: '#8e4ec6', violet: '#a782ff', pink: '#e93d82', magenta: '#d6409f',
  brown: '#8b5a2b', sand: '#e2c68f', wood: '#a47148', ice: '#b8e6ff',
};

/** Colour names or #rgb / #rrggbb → '#rrggbb'. Unknown values fall back to white. */
export function parseColor(c: unknown): string {
  if (typeof c !== 'string') return NAMED_COLORS.white;
  const s = c.trim().toLowerCase();
  if (Object.hasOwn(NAMED_COLORS, s)) return NAMED_COLORS[s];
  if (/^#[0-9a-f]{6}$/.test(s)) return s;
  if (/^#[0-9a-f]{3}$/.test(s)) return '#' + [...s.slice(1)].map((ch) => ch + ch).join('');
  return NAMED_COLORS.white;
}

const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const round2 = (v: number) => Math.round(v * 100) / 100;
const size = (v: unknown) => Math.max(0.1, Math.min(MAX_SIZE, num(v, 1)));

/** Sandboxed code reports shapes as ['shape', kind, x, y, z, sx, sy, sz, rx, ry, rz, color, glow]. */
export function propsFromRaw(raw: unknown): Prop[] {
  if (!Array.isArray(raw)) return [];
  const out: Prop[] = [];
  for (const r of raw) {
    if (out.length >= MAX_PROPS_PER_BUILD) break;
    if (!Array.isArray(r) || r[0] !== 'shape') continue;
    const kind = String(r[1]).toLowerCase() as ShapeKind;
    if (!SHAPE_KINDS.includes(kind)) continue;
    const [x, y, z] = [r[2], r[3], r[4]];
    if (![x, y, z].every((v) => typeof v === 'number' && Number.isFinite(v))) continue;
    out.push({
      kind,
      // Shapes aren't tied to the grid: keep positions to 1/100 of a block.
      x: round2(x as number), y: round2(y as number), z: round2(z as number),
      sx: size(r[5]), sy: size(r[6]), sz: size(r[7]),
      rx: num(r[8], 0) % 360, ry: num(r[9], 0) % 360, rz: num(r[10], 0) % 360,
      color: parseColor(r[11]),
      glow: r[12] === true,
    });
  }
  return out;
}

/** A shape costs its largest dimension in block credits (rounded up), plus 2 if it glows. */
export function shapeCost(p: Pick<Prop, 'sx' | 'sy' | 'sz' | 'glow'>): number {
  return Math.max(1, Math.ceil(Math.max(p.sx, p.sy, p.sz))) + (p.glow ? 2 : 0);
}
