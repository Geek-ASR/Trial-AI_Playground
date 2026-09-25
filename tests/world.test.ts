import { describe, expect, it } from 'vitest';
import { LESSONS } from '../src/curriculum';
import { B, blockIdFromName, isSolid } from '../src/world/blocks';
import { GROUND, HUB_PORTALS, HUB_SPAWN, REALM_SITES, STATIONS } from '../src/world/layout';
import { meshChunk } from '../src/world/mesher';
import { opsFromRaw } from '../src/world/ops';
import { World } from '../src/world/world';

const world = new World();
world.generate();

describe('world generation', () => {
  it('has a station for every lesson plus the forge, each protected', () => {
    expect(STATIONS.filter((s) => s.kind === 'lesson')).toHaveLength(LESSONS.length);
    expect(STATIONS.some((s) => s.kind === 'forge')).toBe(true);
    for (const s of STATIONS) {
      expect(world.get(s.x, s.y, s.z)).toBe(s.kind === 'forge' ? B.CRYSTAL : B.BEACON);
      expect(world.isProtected(s.x, s.y, s.z)).toBe(true);
    }
  });

  it('stations do not overlap each other', () => {
    for (const a of STATIONS)
      for (const b of STATIONS) if (a !== b) expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(3);
  });

  it('places walkable portals in the hub and every realm', () => {
    for (const p of HUB_PORTALS) expect(world.get(p.x, GROUND, p.z)).toBe(B.PORTAL);
    for (const s of REALM_SITES) expect(world.get(s.portal.x, GROUND, s.portal.z)).toBe(B.PORTAL);
  });

  it('spawns the player in open air on solid ground', () => {
    const x = Math.floor(HUB_SPAWN.x), z = Math.floor(HUB_SPAWN.z);
    expect(isSolid(world.get(x, GROUND, z))).toBe(true);
    expect(world.get(x, GROUND + 1, z)).toBe(B.AIR);
    expect(world.get(x, GROUND + 2, z)).toBe(B.AIR);
    for (const s of REALM_SITES) {
      expect(world.get(Math.floor(s.spawn.x), GROUND + 1, Math.floor(s.spawn.z))).toBe(B.AIR);
    }
  });

  it('ray casts hit the first solid block and report the face', () => {
    const s = STATIONS[0];
    const hit = world.raycast(s.x + 0.5, s.y + 3.5, s.z + 0.5, 0, -1, 0, 10);
    expect(hit).toMatchObject({ x: s.x, y: s.y, z: s.z, ny: 1 });
  });

  it('records edits for saving and restores them', () => {
    const w = new World();
    w.generate();
    const s = REALM_SITES[0];
    w.set(s.x + 20, GROUND + 5, s.z, B.GOLD);
    const saved = w.serializeEdits();
    const w2 = new World();
    w2.generate();
    w2.applyEdits(saved);
    expect(w2.get(s.x + 20, GROUND + 5, s.z)).toBe(B.GOLD);
  });
});

describe('meshing', () => {
  it('produces indexed geometry with matching attribute sizes', () => {
    const geo = meshChunk(world, 7, 7);
    const g = geo.opaque!;
    const n = g.getAttribute('position').count;
    expect(n).toBeGreaterThan(100);
    expect(g.getAttribute('uv').count).toBe(n);
    expect(g.getAttribute('color').count).toBe(n);
    expect(g.getIndex()!.count % 6).toBe(0);
  });

  it('culls faces between solid neighbours', () => {
    const w = new World();
    // Empty world: a lone 2×1×1 bar exposes 10 faces, not 12.
    w.set(5, 5, 5, B.STONE, false);
    w.set(6, 5, 5, B.STONE, false);
    const g = meshChunk(w, 0, 0).opaque!;
    expect(g.getIndex()!.count / 6).toBe(10);
  });
});

describe('ops', () => {
  it('sanitises raw ops from learner code', () => {
    const ops = opsFromRaw([[1.4, 2, 3, 'gold'], [NaN, 0, 0, 'red'], 'junk', [0, 0, 0, 'no-such-block']]);
    expect(ops).toEqual([{ x: 1, y: 2, z: 3, b: B.GOLD }, { x: 0, y: 0, z: 0, b: B.STONE }]);
    expect(blockIdFromName('AIR')).toBe(B.AIR);
  });
});
