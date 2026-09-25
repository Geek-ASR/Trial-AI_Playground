import { DIM, EMIT, OPAQUE } from './blocks';

/**
 * Voxel lighting, Minecraft-style but with coloured block light.
 *
 * Each cell stores 16 bits: sky light (4 bits) and red/green/blue block light
 * (4 bits each). Sky light pours straight down each column and then floods
 * sideways into overhangs; block light floods out of emissive blocks. Both lose
 * one level per step (more through leaves and water) and never pass opaque blocks.
 */

export interface VoxelGrid {
  readonly sx: number;
  readonly sy: number;
  readonly sz: number;
  readonly data: Uint8Array;
  readonly light: Uint16Array;
}

export const skyOf = (v: number) => v >>> 12;
export const rOf = (v: number) => (v >>> 8) & 15;
export const gOf = (v: number) => (v >>> 4) & 15;
export const bOf = (v: number) => v & 15;
const MAX_REACH = 15;

/** Growable FIFO of cell indices. */
class IndexQueue {
  private buf = new Int32Array(1 << 16);
  private head = 0;
  private tail = 0;

  push(i: number) {
    if (this.tail === this.buf.length) {
      if (this.head > this.buf.length / 2) {
        this.buf.copyWithin(0, this.head, this.tail);
        this.tail -= this.head;
        this.head = 0;
      } else {
        const next = new Int32Array(this.buf.length * 2);
        next.set(this.buf.subarray(this.head, this.tail));
        this.tail -= this.head;
        this.head = 0;
        this.buf = next;
      }
    }
    this.buf[this.tail++] = i;
  }

  pop(): number {
    return this.buf[this.head++];
  }

  get size() {
    return this.tail - this.head;
  }

  reset() {
    this.head = this.tail = 0;
  }
}

const queue = new IndexQueue();

/** Recompute all light in the world from scratch. */
export function computeAllLight(g: VoxelGrid) {
  relightColumns(g, 0, 0, g.sx - 1, g.sz - 1, false);
}

/**
 * Recompute light after edits inside the column box [x0..x1] × [z0..z1].
 * Light reaches at most 15 blocks, so the box is grown by that much and every
 * cell outside it keeps its (still correct) value and acts as a light source.
 * Returns the box that changed so callers can re-mesh it.
 */
export function relightBox(g: VoxelGrid, x0: number, z0: number, x1: number, z1: number) {
  const bx0 = Math.max(0, x0 - MAX_REACH), bz0 = Math.max(0, z0 - MAX_REACH);
  const bx1 = Math.min(g.sx - 1, x1 + MAX_REACH), bz1 = Math.min(g.sz - 1, z1 + MAX_REACH);
  relightColumns(g, bx0, bz0, bx1, bz1, true);
  return { x0: bx0, z0: bz0, x1: bx1, z1: bz1 };
}

function relightColumns(g: VoxelGrid, x0: number, z0: number, x1: number, z1: number, useBorder: boolean) {
  const { sx, sy, sz, data, light } = g;
  const layer = sx * sz;

  // 1. Straight-down sunlight per column; clear block light. Remember each
  //    column's "surface": the highest cell that is not in full sunlight.
  const w = x1 - x0 + 1;
  const surf = new Int16Array(w * (z1 - z0 + 1));
  for (let z = z0; z <= z1; z++) {
    for (let x = x0; x <= x1; x++) {
      let s = 15;
      let top = -1;
      for (let y = sy - 1; y >= 0; y--) {
        const i = y * layer + z * sx + x;
        const b = data[i];
        if (OPAQUE[b]) s = 0;
        else if (DIM[b]) s = Math.max(0, s - DIM[b]);
        if (s < 15 && top < 0) top = y;
        light[i] = s << 12;
      }
      surf[(z - z0) * w + (x - x0)] = top;
    }
  }
  const surfAt = (x: number, z: number): number => {
    if (x < 0 || z < 0 || x >= sx || z >= sz) return -1;
    if (x >= x0 && x <= x1 && z >= z0 && z <= z1) return surf[(z - z0) * w + (x - x0)];
    for (let y = sy - 1; y >= 0; y--) if (light[y * layer + z * sx + x] >>> 12 < 15) return y;
    return -1;
  };

  // 2. Seed the sky flood with lit cells next to darker open cells. Above the
  //    tallest surface in a column's neighbourhood everything is full sunlight,
  //    so only the part below it needs checking.
  queue.reset();
  for (let z = z0; z <= z1; z++) {
    for (let x = x0; x <= x1; x++) {
      const top = Math.min(sy - 1, Math.max(surfAt(x, z), surfAt(x - 1, z), surfAt(x + 1, z), surfAt(x, z - 1), surfAt(x, z + 1)) + 1);
      for (let y = 0; y <= top; y++) {
        const i = y * layer + z * sx + x;
        const s = light[i] >>> 12;
        if (s < 2) continue;
        if (
          (x > 0 && darker(data, light, i - 1, s)) ||
          (x < sx - 1 && darker(data, light, i + 1, s)) ||
          (z > 0 && darker(data, light, i - sx, s)) ||
          (z < sz - 1 && darker(data, light, i + sx, s)) ||
          (y > 0 && darker(data, light, i - layer, s)) ||
          (y < sy - 1 && darker(data, light, i + layer, s))
        ) queue.push(i);
      }
    }
  }
  if (useBorder) forBorder(g, x0, z0, x1, z1, (i) => { if (light[i] >>> 12 > 1) queue.push(i); });
  floodSky(g);

  // 3. Block light from every emitter in the box (plus light entering from outside).
  queue.reset();
  for (let y = 0; y < sy; y++) {
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        const i = y * layer + z * sx + x;
        const e = EMIT[data[i]];
        if (e) {
          light[i] = (light[i] & 0xf000) | e;
          queue.push(i);
        }
      }
    }
  }
  if (useBorder) forBorder(g, x0, z0, x1, z1, (i) => { if (light[i] & 0x0fff) queue.push(i); });
  floodBlock(g);
}

function darker(data: Uint8Array, light: Uint16Array, n: number, s: number): boolean {
  return !OPAQUE[data[n]] && (light[n] >>> 12) < s - 1;
}

/** Call fn for every cell in the one-column-wide ring just outside the box. */
function forBorder(g: VoxelGrid, x0: number, z0: number, x1: number, z1: number, fn: (i: number) => void) {
  const { sx, sy, sz } = g;
  const layer = sx * sz;
  const cols: [number, number][] = [];
  for (let x = x0 - 1; x <= x1 + 1; x++) {
    cols.push([x, z0 - 1], [x, z1 + 1]);
  }
  for (let z = z0; z <= z1; z++) {
    cols.push([x0 - 1, z], [x1 + 1, z]);
  }
  for (const [x, z] of cols) {
    if (x < 0 || z < 0 || x >= sx || z >= sz) continue;
    for (let y = 0; y < sy; y++) fn(y * layer + z * sx + x);
  }
}

function floodSky(g: VoxelGrid) {
  const { sx, sy, sz, data, light } = g;
  const layer = sx * sz;
  while (queue.size) {
    const i = queue.pop();
    const s = light[i] >>> 12;
    if (s < 2) continue;
    const x = i % sx;
    const rest = (i - x) / sx;
    const z = rest % sz;
    const y = (rest - z) / sz;
    if (x > 0) spreadSky(data, light, i - 1, s);
    if (x < sx - 1) spreadSky(data, light, i + 1, s);
    if (z > 0) spreadSky(data, light, i - sx, s);
    if (z < sz - 1) spreadSky(data, light, i + sx, s);
    if (y > 0) spreadSky(data, light, i - layer, s);
    if (y < sy - 1) spreadSky(data, light, i + layer, s);
  }
}

function spreadSky(data: Uint8Array, light: Uint16Array, n: number, s: number) {
  const b = data[n];
  if (OPAQUE[b]) return;
  const ns = s - 1 - DIM[b];
  if (ns > light[n] >>> 12) {
    light[n] = (light[n] & 0x0fff) | (ns << 12);
    queue.push(n);
  }
}

function floodBlock(g: VoxelGrid) {
  const { sx, sy, sz, data, light } = g;
  const layer = sx * sz;
  while (queue.size) {
    const i = queue.pop();
    const v = light[i];
    const r = (v >>> 8) & 15, gg = (v >>> 4) & 15, b = v & 15;
    if (r < 2 && gg < 2 && b < 2) continue;
    const x = i % sx;
    const rest = (i - x) / sx;
    const z = rest % sz;
    const y = (rest - z) / sz;
    if (x > 0) spreadBlock(data, light, i - 1, r, gg, b);
    if (x < sx - 1) spreadBlock(data, light, i + 1, r, gg, b);
    if (z > 0) spreadBlock(data, light, i - sx, r, gg, b);
    if (z < sz - 1) spreadBlock(data, light, i + sx, r, gg, b);
    if (y > 0) spreadBlock(data, light, i - layer, r, gg, b);
    if (y < sy - 1) spreadBlock(data, light, i + layer, r, gg, b);
  }
}

function spreadBlock(data: Uint8Array, light: Uint16Array, n: number, r: number, g: number, b: number) {
  const blk = data[n];
  if (OPAQUE[blk]) return;
  const d = 1 + DIM[blk];
  const cur = light[n];
  const cr = (cur >>> 8) & 15, cg = (cur >>> 4) & 15, cb = cur & 15;
  const nr = Math.max(cr, r - d), ng = Math.max(cg, g - d), nb = Math.max(cb, b - d);
  if (nr !== cr || ng !== cg || nb !== cb) {
    light[n] = (cur & 0xf000) | (nr << 8) | (ng << 4) | nb;
    queue.push(n);
  }
}
