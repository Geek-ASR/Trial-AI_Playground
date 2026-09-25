import { describe, expect, it } from 'vitest';
import { B } from '../src/world/blocks';
import { bOf, computeAllLight, gOf, relightBox, rOf, skyOf, type VoxelGrid } from '../src/world/lighting';

function grid(sx = 40, sy = 30, sz = 40): VoxelGrid & { set(x: number, y: number, z: number, b: number): void; at(x: number, y: number, z: number): number } {
  const data = new Uint8Array(sx * sy * sz);
  const light = new Uint16Array(sx * sy * sz);
  const idx = (x: number, y: number, z: number) => (y * sz + z) * sx + x;
  return {
    sx, sy, sz, data, light,
    set: (x, y, z, b) => { data[idx(x, y, z)] = b; },
    at: (x, y, z) => light[idx(x, y, z)],
  };
}

describe('lighting', () => {
  it('fills open air with full sky light', () => {
    const g = grid();
    computeAllLight(g);
    expect(skyOf(g.at(5, 5, 5))).toBe(15);
    expect(skyOf(g.at(39, 0, 39))).toBe(15);
  });

  it('shades the space under a roof by distance to the open edge', () => {
    const g = grid();
    for (let x = 10; x <= 14; x++) for (let z = 10; z <= 14; z++) g.set(x, 10, z, B.STONE);
    computeAllLight(g);
    expect(skyOf(g.at(12, 11, 12))).toBe(15); // on top of the roof
    expect(skyOf(g.at(12, 9, 12))).toBe(12); // 3 steps in from the edge
    expect(skyOf(g.at(10, 9, 12))).toBe(14);
  });

  it('attenuates sky light through leaves and water', () => {
    const g = grid();
    g.set(5, 20, 5, B.LEAVES);
    g.set(5, 19, 5, B.LEAVES);
    computeAllLight(g);
    // Straight down through two leaf blocks, but open neighbours relight it from the side.
    expect(skyOf(g.at(5, 18, 5))).toBe(14);
  });

  it('spreads coloured block light from a lamp', () => {
    const g = grid();
    for (let x = 0; x < 40; x++) for (let z = 0; z < 40; z++) g.set(x, 25, z, B.STONE); // roof: no sky below
    g.set(20, 10, 20, B.LAMP); // emits (15, 12, 7)
    computeAllLight(g);
    const n = g.at(21, 10, 20);
    expect([rOf(n), gOf(n), bOf(n)]).toEqual([14, 11, 6]);
    const far = g.at(25, 10, 20);
    expect([rOf(far), gOf(far), bOf(far)]).toEqual([10, 7, 2]);
    expect(skyOf(g.at(20, 10, 22))).toBe(0);
  });

  it('mixes two coloured lights by taking the brighter channel', () => {
    const g = grid();
    for (let x = 0; x < 40; x++) for (let z = 0; z < 40; z++) g.set(x, 25, z, B.STONE);
    g.set(10, 10, 10, B.MAGMA); // (15, 6, 1)
    g.set(14, 10, 10, B.BEACON); // (5, 14, 15)
    computeAllLight(g);
    const mid = g.at(12, 10, 10);
    expect([rOf(mid), gOf(mid), bOf(mid)]).toEqual([13, 12, 13]);
  });

  it('relights locally when a wall blocks a lamp and when it is removed again', () => {
    const g = grid();
    for (let x = 0; x < 40; x++) for (let z = 0; z < 40; z++) g.set(x, 25, z, B.STONE);
    g.set(20, 10, 20, B.LAMP);
    computeAllLight(g);
    const before = rOf(g.at(24, 10, 20));
    // Enclose the lamp completely.
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++)
      if (dx || dy || dz) g.set(20 + dx, 10 + dy, 20 + dz, B.STONE);
    relightBox(g, 19, 19, 21, 21);
    expect(rOf(g.at(24, 10, 20))).toBe(0);
    // Open it again.
    g.set(21, 10, 20, B.AIR);
    relightBox(g, 21, 20, 21, 20);
    expect(rOf(g.at(24, 10, 20))).toBe(before);
  });
});
