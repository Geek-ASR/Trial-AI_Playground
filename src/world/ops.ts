import { B, blockIdFromName, type BlockId } from './blocks';

/** A single voxel edit. Coordinates are relative to some origin chosen by the caller. */
export interface VoxelOp {
  x: number;
  y: number;
  z: number;
  b: BlockId;
}

/** Hard cap so a runaway loop in learner code can't freeze the tab. */
export const MAX_OPS = 60_000;

/** Raw op as produced by sandboxed code: [x, y, z, blockName]. */
export type RawOp = [number, number, number, string | number];

export function opsFromRaw(raw: unknown): VoxelOp[] {
  if (!Array.isArray(raw)) return [];
  const out: VoxelOp[] = [];
  for (const r of raw) {
    if (out.length >= MAX_OPS) break;
    if (!Array.isArray(r) || r.length < 4) continue;
    const [x, y, z, name] = r;
    if (![x, y, z].every((v) => typeof v === 'number' && Number.isFinite(v))) continue;
    out.push({ x: Math.round(x), y: Math.round(y), z: Math.round(z), b: blockIdFromName(name) });
  }
  return out;
}

export function column(x: number, z: number, height: number, b: BlockId, y0 = 0): VoxelOp[] {
  const ops: VoxelOp[] = [];
  for (let y = 0; y < height; y++) ops.push({ x, y: y0 + y, z, b });
  return ops;
}

export function box(
  x1: number, y1: number, z1: number,
  x2: number, y2: number, z2: number,
  b: BlockId,
): VoxelOp[] {
  const ops: VoxelOp[] = [];
  const [ax, bx] = [Math.min(x1, x2), Math.max(x1, x2)];
  const [ay, by] = [Math.min(y1, y2), Math.max(y1, y2)];
  const [az, bz] = [Math.min(z1, z2), Math.max(z1, z2)];
  for (let x = ax; x <= bx; x++)
    for (let y = ay; y <= by; y++)
      for (let z = az; z <= bz; z++) {
        ops.push({ x, y, z, b });
        if (ops.length >= MAX_OPS) return ops;
      }
  return ops;
}

/** Map a value in [lo, hi] onto an integer in [0, n-1]. */
export function bucket(v: number, lo: number, hi: number, n: number): number {
  if (!Number.isFinite(v)) return 0;
  if (hi <= lo) return Math.floor(n / 2);
  const t = (v - lo) / (hi - lo);
  return Math.max(0, Math.min(n - 1, Math.floor(t * n)));
}

export const AIR_OP = (x: number, y: number, z: number): VoxelOp => ({ x, y, z, b: B.AIR });
