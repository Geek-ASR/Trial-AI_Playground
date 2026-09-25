import { B, CATEGORY_BLOCKS, HEAT_RAMP, type BlockId } from '../world/blocks';
import { bucket, type VoxelOp } from '../world/ops';

/** Display pads are 25×25 blocks; visualisations must stay inside ±PAD. */
export const PAD = 12;
const MAX_H = 14;

const nums = (v: unknown): number[] =>
  Array.isArray(v) ? v.map((x) => (typeof x === 'number' && Number.isFinite(x) ? x : 0)) : [];

/** Vertical bars along the x axis, heights scaled to the largest |value|. */
export function bars(values: unknown, opts: { colors?: BlockId[]; z?: number } = {}): VoxelOp[] {
  const v = nums(values);
  if (!v.length) return [];
  const maxAbs = Math.max(...v.map(Math.abs), 1e-9);
  const step = v.length <= 12 ? 2 : 1;
  const width = (v.length - 1) * step;
  const x0 = -Math.floor(width / 2);
  const ops: VoxelOp[] = [];
  v.forEach((val, i) => {
    const h = Math.max(1, Math.round((Math.abs(val) / maxAbs) * MAX_H));
    const color =
      opts.colors?.[i % opts.colors.length] ?? (val < 0 ? B.RED : HEAT_RAMP[bucket(Math.abs(val), 0, maxAbs, 6)]);
    const x = x0 + i * step;
    if (Math.abs(x) > PAD) return;
    for (let y = 0; y < h; y++) ops.push({ x, y, z: opts.z ?? 0, b: color });
    ops.push({ x, y: h, z: opts.z ?? 0, b: B.GOLD });
  });
  return ops;
}

/** Floor heat-map of a 2-D matrix, centred on the pad. */
export function heatmap(matrix: unknown, lift = 0): VoxelOp[] {
  if (!Array.isArray(matrix)) return [];
  const rows = matrix.map(nums);
  const flat = rows.flat();
  if (!flat.length) return [];
  const lo = Math.min(...flat);
  const hi = Math.max(...flat);
  const ops: VoxelOp[] = [];
  const cell = rows.length <= 8 ? 2 : 1;
  const z0 = -Math.floor((rows.length * cell) / 2);
  rows.forEach((row, r) => {
    const x0 = -Math.floor((row.length * cell) / 2);
    row.forEach((val, c) => {
      const b = HEAT_RAMP[bucket(val, lo, hi, 6)];
      const h = 1 + bucket(val, lo, hi, 6);
      for (let dx = 0; dx < cell; dx++)
        for (let dz = 0; dz < cell; dz++)
          for (let y = 0; y < h; y++) ops.push({ x: x0 + c * cell + dx, y: lift + y, z: z0 + r * cell + dz, b });
    });
  });
  return ops;
}

export interface ScatterOpts {
  labels?: number[];
  bounds?: [number, number, number, number];
  y?: number;
}

/** Map 2-D points onto the pad floor. Returns ops and the transform used. */
export function scatter(points: number[][], opts: ScatterOpts = {}) {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const [x0, x1, y0, y1] = opts.bounds ?? [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const tx = (x: number) => Math.round(((x - x0) / (x1 - x0 || 1)) * (2 * PAD - 2)) - (PAD - 1);
  const tz = (y: number) => (PAD - 1) - Math.round(((y - y0) / (y1 - y0 || 1)) * (2 * PAD - 2));
  const ops: VoxelOp[] = points.map((p, i) => ({
    x: tx(p[0]),
    y: opts.y ?? 0,
    z: tz(p[1]),
    b: opts.labels ? CATEGORY_BLOCKS[opts.labels[i] % CATEGORY_BLOCKS.length] : B.BLUE,
  }));
  return { ops, tx, tz };
}
