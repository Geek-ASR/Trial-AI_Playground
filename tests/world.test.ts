import { beforeAll, describe, expect, it } from 'vitest';
import { LESSONS } from '../src/curriculum';
import { MAZE_MAP, galaxyStairsForTest } from './helpers';
import { B, blockIdFromName, isSolid } from '../src/world/blocks';
import { GROUND, HUB_PORTALS, HUB_SPAWN, LAB_SITES, REALM_SITES, STATIONS, SX, SZ } from '../src/world/layout';
import { skyOf } from '../src/world/lighting';
import { meshChunk } from '../src/world/mesher';
import { opsFromRaw } from '../src/world/ops';
import { World } from '../src/world/world';

let world: World;
let genMs = 0;
beforeAll(() => {
  const t = performance.now();
  world = new World();
  world.generate();
  genMs = performance.now() - t;
});

describe('world generation', () => {
  it('generates the whole world, lighting included, in reasonable time', () => {
    expect(genMs).toBeLessThan(15000);
  });

  it('has a station for every lesson plus the forge, each protected', () => {
    expect(STATIONS.filter((s) => s.kind === 'lesson')).toHaveLength(LESSONS.length);
    expect(STATIONS.some((s) => s.kind === 'forge')).toBe(true);
    for (const s of STATIONS) {
      expect(world.get(s.x, s.y, s.z)).toBe(s.kind === 'forge' ? B.CRYSTAL : B.BEACON);
      expect(world.isProtected(s.x, s.y, s.z)).toBe(true);
    }
  });

  it('keeps stations apart and inside their realm plaza', () => {
    for (const a of STATIONS)
      for (const b of STATIONS) if (a !== b) expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(3);
    for (const s of STATIONS) {
      const site = REALM_SITES.find((r) => r.id === s.realm)!;
      expect(Math.hypot(s.x - site.x, s.z - site.z)).toBeLessThan(22);
    }
  });

  it('places walkable portals in the hub and every realm', () => {
    for (const p of HUB_PORTALS) expect(world.get(p.x, GROUND, p.z)).toBe(B.PORTAL);
    for (const s of REALM_SITES) expect(world.get(s.portal.x, GROUND, s.portal.z)).toBe(B.PORTAL);
  });

  it('keeps labs inside the world and away from realms', () => {
    for (const l of LAB_SITES) {
      expect(l.x - 24).toBeGreaterThan(0);
      expect(l.z - 24).toBeGreaterThan(0);
      expect(l.x + 24).toBeLessThan(SX);
      expect(l.z + 24).toBeLessThan(SZ);
      for (const r of REALM_SITES) expect(Math.hypot(l.x - r.x, l.z - r.z)).toBeGreaterThan(24 + 24);
    }
  });

  it('spawns the player in open air on solid ground', () => {
    const x = Math.floor(HUB_SPAWN.x), z = Math.floor(HUB_SPAWN.z);
    expect(isSolid(world.get(x, GROUND, z))).toBe(true);
    expect(world.get(x, GROUND + 1, z)).toBe(B.AIR);
    expect(world.get(x, GROUND + 2, z)).toBe(B.AIR);
    for (const s of [...REALM_SITES, ...LAB_SITES]) {
      const sx = Math.floor(s.spawn.x), sz = Math.floor(s.spawn.z);
      expect(isSolid(world.get(sx, GROUND, sz)), `ground at ${sx},${sz}`).toBe(true);
      expect(world.get(sx, GROUND + 1, sz), `air at ${sx},${sz}`).toBe(B.AIR);
      expect(world.get(sx, GROUND + 2, sz)).toBe(B.AIR);
    }
  });

  it('lights the world: open plazas are sunlit, underground is dark, lamps glow', () => {
    expect(skyOf(world.lightAt(Math.floor(HUB_SPAWN.x), GROUND + 1, Math.floor(HUB_SPAWN.z)))).toBe(15);
    expect(skyOf(world.lightAt(Math.floor(HUB_SPAWN.x), 5, Math.floor(HUB_SPAWN.z)))).toBe(0);
    const s = STATIONS[0];
    const beside = world.lightAt(s.x + 1, s.y, s.z);
    expect(beside & 0x0fff).toBeGreaterThan(0);
  });

  it('builds the maze exactly as its map says', () => {
    let walls = 0;
    for (const row of MAZE_MAP) for (const ch of row) if (ch === '#') walls++;
    expect(walls).toBeGreaterThan(30);
  });

  it('builds a climbable staircase up the galaxy tower', () => {
    const steps = galaxyStairsForTest();
    for (let k = 1; k < steps.length; k++) {
      const a = steps[k - 1], b = steps[k];
      expect(b.v - a.v).toBeLessThanOrEqual(1);
    }
  });

  it('ray casts hit the first solid block and report the face', () => {
    const s = STATIONS[0];
    const hit = world.raycast(s.x + 0.5, s.y + 3.5, s.z + 0.5, 0, -1, 0, 10);
    expect(hit).toMatchObject({ x: s.x, y: s.y, z: s.z, ny: 1 });
  });

  it('records edits for saving and restores them', () => {
    const s = REALM_SITES[0];
    world.set(s.x + 20, GROUND + 5, s.z, B.GOLD);
    const saved = world.serializeEdits();
    const w2 = new World();
    w2.generate();
    w2.applyEdits(saved);
    expect(w2.get(s.x + 20, GROUND + 5, s.z)).toBe(B.GOLD);
  });

  it('relights around an edit and caches column heights', () => {
    const s = REALM_SITES[1];
    const x = s.x + 3, z = s.z + 3;
    const top = world.topCached(x, z);
    world.set(x, top + 1, z, B.LAMP);
    world.flushLight();
    expect(world.lightAt(x + 1, top + 1, z) & 0x0f00).toBe(14 << 8);
    expect(world.topCached(x, z)).toBe(top + 1);
  });
});

describe('meshing', () => {
  it('produces indexed geometry with light and flag attributes', () => {
    const geo = meshChunk(world, 10, 10);
    const g = geo.opaque!;
    const n = g.getAttribute('position').count;
    expect(n).toBeGreaterThan(100);
    for (const a of ['uv', 'color', 'normal', 'aLight', 'aFlags']) expect(g.getAttribute(a).count).toBe(n);
    expect(g.getIndex()!.count % 6).toBe(0);
  });

  it('culls faces between solid neighbours', () => {
    const w = new World();
    w.set(5, 5, 5, B.STONE, false);
    w.set(6, 5, 5, B.STONE, false);
    const g = meshChunk(w, 0, 0).opaque!;
    expect(g.getIndex()!.count / 6).toBe(10);
  });

  it('renders plants as two crossed quads', () => {
    const w = new World();
    w.set(3, 5, 3, B.TALL_GRASS, false);
    const g = meshChunk(w, 0, 0).cutout!;
    expect(g.getIndex()!.count / 6).toBe(2);
  });
});

describe('ops', () => {
  it('sanitises raw ops from learner code', () => {
    const ops = opsFromRaw([[1.4, 2, 3, 'gold'], [NaN, 0, 0, 'red'], 'junk', [0, 0, 0, 'no-such-block']]);
    expect(ops).toEqual([{ x: 1, y: 2, z: 3, b: B.GOLD }, { x: 0, y: 0, z: 0, b: B.STONE }]);
    expect(blockIdFromName('AIR')).toBe(B.AIR);
    expect(blockIdFromName('cherry blossom')).toBe(B.CHERRY_LEAVES);
    expect(blockIdFromName('tall_grass')).toBe(B.TALL_GRASS);
  });
});
