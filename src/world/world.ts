import { REALM_BY_ID } from '../curriculum';
import type { RealmId } from '../curriculum/types';
import { buildLabStructures } from '../sims/structures';
import { B, isSolid, type BlockId } from './blocks';
import {
  CHUNK, GROUND, HUB, HUB_PORTALS, LAB_RADIUS, LAB_SITES, PAD_HALF, PLAYGROUND, REALM_RADIUS, REALM_SITES, STATIONS, SX, SY, SZ,
  WATER_LEVEL,
} from './layout';
import { computeAllLight, relightBox, type VoxelGrid } from './lighting';

/** Deterministic 2-D value noise with fractal octaves. */
export function makeNoise(seed: number, baseFreq = 1 / 48, octaves = 4) {
  const hash = (x: number, z: number) => {
    let h = Math.imul(x, 374761393) ^ Math.imul(z, 668265263) ^ seed;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const smooth = (t: number) => t * t * (3 - 2 * t);
  const value = (x: number, z: number) => {
    const x0 = Math.floor(x), z0 = Math.floor(z);
    const fx = smooth(x - x0), fz = smooth(z - z0);
    const a = hash(x0, z0), b = hash(x0 + 1, z0), c = hash(x0, z0 + 1), d = hash(x0 + 1, z0 + 1);
    return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
  };
  return (x: number, z: number) => {
    let sum = 0, amp = 1, freq = baseFreq, norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += value(x * freq, z * freq) * amp;
      norm += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return sum / norm;
  };
}

/** Per-column deterministic random number in [0, 1). */
export function hash2(x: number, z: number, salt = 0): number {
  let h = Math.imul(x + 7919 * salt, 2654435761) ^ Math.imul(z + 104729 * salt, 1597334677);
  h = Math.imul(h ^ (h >>> 15), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export interface RayHit {
  x: number;
  y: number;
  z: number;
  /** Face normal of the block face that was hit. */
  nx: number;
  ny: number;
  nz: number;
  block: BlockId;
}

/** Biome ids line up with the realm order (0–5); 6 is the neutral hub meadow. */
export const BIOMES: (RealmId | 'hub')[] = ['foundations', 'data', 'classic', 'neural', 'tokens', 'agents', 'hub'];
const BIOME_TINT: [number, number, number][] = [
  [1.0, 1.02, 0.92], // meadow
  [1.28, 1.06, 0.62], // dunes: dry grass
  [0.78, 0.98, 0.74], // forest: deep green
  [0.74, 0.94, 0.9], // peaks: cool
  [0.98, 1.1, 0.86], // coast: lush
  [1.14, 0.86, 0.56], // volcanic: scorched
  [1.0, 1.04, 0.9], // hub
];

export class World implements VoxelGrid {
  readonly sx = SX;
  readonly sy = SY;
  readonly sz = SZ;
  readonly data = new Uint8Array(SX * SY * SZ);
  readonly light = new Uint16Array(SX * SY * SZ);
  /** Dominant biome per column (index into BIOMES). */
  readonly biome = new Uint8Array(SX * SZ);
  /** Grass/leaf tint per column, RGB 0–255 where 128 = ×1. */
  readonly tint = new Uint8Array(SX * SZ * 3);
  /** Blocks the player may not break (stations, portals, pads, lab machinery). */
  readonly protectedCells = new Set<number>();
  /** Player / builder edits relative to the generated terrain, for saving. */
  readonly edits = new Map<number, BlockId>();
  private dirty = new Set<number>();
  private listeners: ((cx: number, cz: number) => void)[] = [];
  private lightBox: { x0: number; z0: number; x1: number; z1: number } | null = null;
  /** Cached topY per column (−1 = unknown), invalidated by edits. */
  private tops = new Int16Array(SX * SZ).fill(-1);

  static index(x: number, y: number, z: number): number {
    return (y * SZ + z) * SX + x;
  }

  inBounds(x: number, y: number, z: number): boolean {
    return x >= 0 && y >= 0 && z >= 0 && x < SX && y < SY && z < SZ;
  }

  get(x: number, y: number, z: number): BlockId {
    if (!this.inBounds(x, y, z)) return y < 0 ? B.BEDROCK : B.AIR;
    return this.data[World.index(x, y, z)];
  }

  lightAt(x: number, y: number, z: number): number {
    if (!this.inBounds(x, y, z)) return y < 0 ? 0 : 0xf000;
    return this.light[World.index(x, y, z)];
  }

  biomeAt(x: number, z: number): RealmId | 'hub' {
    const cx = Math.max(0, Math.min(SX - 1, Math.floor(x)));
    const cz = Math.max(0, Math.min(SZ - 1, Math.floor(z)));
    return BIOMES[this.biome[cz * SX + cx]];
  }

  /** Set a block and mark affected chunks and light for update. `record` saves it as a user edit. */
  set(x: number, y: number, z: number, b: BlockId, record = true): boolean {
    if (!this.inBounds(x, y, z) || y === 0) return false;
    const i = World.index(x, y, z);
    if (this.data[i] === b) return false;
    this.data[i] = b;
    if (record) this.edits.set(i, b);
    this.tops[z * SX + x] = -1;
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
    this.markDirty(cx, cz);
    const lx = x - cx * CHUNK, lz = z - cz * CHUNK;
    if (lx === 0) this.markDirty(cx - 1, cz);
    if (lx === CHUNK - 1) this.markDirty(cx + 1, cz);
    if (lz === 0) this.markDirty(cx, cz - 1);
    if (lz === CHUNK - 1) this.markDirty(cx, cz + 1);
    const box = this.lightBox;
    if (box) {
      box.x0 = Math.min(box.x0, x); box.z0 = Math.min(box.z0, z);
      box.x1 = Math.max(box.x1, x); box.z1 = Math.max(box.z1, z);
    } else {
      this.lightBox = { x0: x, z0: z, x1: x, z1: z };
    }
    return true;
  }

  /** Recompute light around everything edited since the last flush. */
  flushLight(): boolean {
    const box = this.lightBox;
    if (!box) return false;
    this.lightBox = null;
    const r = relightBox(this, box.x0, box.z0, box.x1, box.z1);
    for (let cz = Math.floor((r.z0 - 1) / CHUNK); cz <= Math.floor((r.z1 + 1) / CHUNK); cz++)
      for (let cx = Math.floor((r.x0 - 1) / CHUNK); cx <= Math.floor((r.x1 + 1) / CHUNK); cx++) this.markDirty(cx, cz);
    return true;
  }

  isProtected(x: number, y: number, z: number): boolean {
    return this.protectedCells.has(World.index(x, y, z));
  }

  solidAt(x: number, y: number, z: number): boolean {
    return isSolid(this.get(Math.floor(x), Math.floor(y), Math.floor(z)));
  }

  markDirty(cx: number, cz: number) {
    if (cx < 0 || cz < 0 || cx >= SX / CHUNK || cz >= SZ / CHUNK) return;
    const key = cz * 1000 + cx;
    if (!this.dirty.has(key)) {
      this.dirty.add(key);
      this.listeners.forEach((l) => l(cx, cz));
    }
  }

  onDirty(fn: (cx: number, cz: number) => void) {
    this.listeners.push(fn);
  }

  takeDirty(): [number, number][] {
    const out = [...this.dirty].map((k) => [k % 1000, Math.floor(k / 1000)] as [number, number]);
    this.dirty.clear();
    return out;
  }

  clearDirty() {
    this.dirty.clear();
  }

  /** Height of the highest solid block in a column (the y you'd stand on is this + 1). */
  topY(x: number, z: number): number {
    for (let y = SY - 1; y > 0; y--) if (isSolid(this.get(x, y, z))) return y;
    return 0;
  }

  /** topY with a per-column cache — cheap enough to call thousands of times a frame. */
  topCached(x: number, z: number): number {
    if (x < 0 || z < 0 || x >= SX || z >= SZ) return 0;
    const c = z * SX + x;
    let t = this.tops[c];
    if (t < 0) {
      t = this.topY(x, z);
      this.tops[c] = t;
    }
    return t;
  }

  /** Highest non-air cell (including water and plants). */
  surfaceY(x: number, z: number): number {
    for (let y = SY - 1; y > 0; y--) if (this.get(x, y, z) !== B.AIR) return y;
    return 0;
  }

  /** Voxel DDA ray cast (Amanatides & Woo). Skips air, water and (optionally) plants. */
  raycast(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxDist: number, hitPlants = true): RayHit | null {
    let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
    const stepX = Math.sign(dx), stepY = Math.sign(dy), stepZ = Math.sign(dz);
    const tDeltaX = stepX ? Math.abs(1 / dx) : Infinity;
    const tDeltaY = stepY ? Math.abs(1 / dy) : Infinity;
    const tDeltaZ = stepZ ? Math.abs(1 / dz) : Infinity;
    let tMaxX = stepX > 0 ? (x + 1 - ox) * tDeltaX : stepX < 0 ? (ox - x) * tDeltaX : Infinity;
    let tMaxY = stepY > 0 ? (y + 1 - oy) * tDeltaY : stepY < 0 ? (oy - y) * tDeltaY : Infinity;
    let tMaxZ = stepZ > 0 ? (z + 1 - oz) * tDeltaZ : stepZ < 0 ? (oz - z) * tDeltaZ : Infinity;
    let nx = 0, ny = 0, nz = 0;
    let t = 0;
    while (t <= maxDist) {
      const b = this.get(x, y, z);
      if (b !== B.AIR && b !== B.WATER && (hitPlants || isSolid(b))) return { x, y, z, nx, ny, nz, block: b };
      if (tMaxX < tMaxY && tMaxX < tMaxZ) {
        x += stepX; t = tMaxX; tMaxX += tDeltaX; nx = -stepX; ny = 0; nz = 0;
      } else if (tMaxY < tMaxZ) {
        y += stepY; t = tMaxY; tMaxY += tDeltaY; nx = 0; ny = -stepY; nz = 0;
      } else {
        z += stepZ; t = tMaxZ; tMaxZ += tDeltaZ; nx = 0; ny = 0; nz = -stepZ;
      }
    }
    return null;
  }

  // ---------------------------------------------------------------- generation

  generate(seed = 20260925) {
    this.genTerrain(seed);
    this.genStructures(seed);
    this.genLight();
  }

  /** Same as generate(), but yields between phases so a loading screen can repaint. */
  async generateAsync(onProgress: (label: string, frac: number) => void, seed = 20260925) {
    const tick = () => new Promise<void>((r) => setTimeout(r, 0));
    onProgress('Sculpting terrain…', 0.05);
    await tick();
    this.genTerrain(seed);
    onProgress('Growing forests and building labs…', 0.45);
    await tick();
    this.genStructures(seed);
    onProgress('Lighting the world…', 0.75);
    await tick();
    this.genLight();
    onProgress('Meshing chunks…', 0.9);
  }

  private genLight() {
    computeAllLight(this);
    this.dirty.clear();
    this.lightBox = null;
    this.tops.fill(-1);
  }

  private genStructures(seed: number) {
    const n2 = makeNoise(seed ^ 0x9e3779b9, 1 / 32, 4);
    const n3 = makeNoise(seed ^ 0x51ed270b, 1 / 90, 3);
    this.buildRoads();
    this.buildHub();
    for (const site of REALM_SITES) this.buildRealm(site);
    buildLabStructures(this);
    this.buildPlayground();
    for (const s of STATIONS) this.buildStation(s.x, s.y, s.z, s.kind === 'forge' ? B.CRYSTAL : B.BEACON);
    this.decorate(n2, n3);
  }

  private genTerrain(seed: number) {
    const n1 = makeNoise(seed, 1 / 64, 5);
    const n2 = makeNoise(seed ^ 0x9e3779b9, 1 / 32, 4);
    const n3 = makeNoise(seed ^ 0x51ed270b, 1 / 90, 3);
    const ridge = makeNoise(seed ^ 0x2545f491, 1 / 56, 5);

    // 1. Biome weights and the natural height of every column.
    const heights = new Float32Array(SX * SZ);
    const weights = new Float32Array(7);
    for (let z = 0; z < SZ; z++) {
      for (let x = 0; x < SX; x++) {
        this.biomeWeights(x, z, weights);
        let h = 0;
        let best = 0;
        const tint = [0, 0, 0];
        for (let b = 0; b < 7; b++) {
          const w = weights[b];
          if (!w) continue;
          h += w * this.biomeHeight(b, x, z, n1, n2, n3, ridge);
          tint[0] += w * BIOME_TINT[b][0];
          tint[1] += w * BIOME_TINT[b][1];
          tint[2] += w * BIOME_TINT[b][2];
          if (w > weights[best]) best = b;
        }
        // The world ends in a ring of sea so its edge is a horizon, not a wall.
        const r = Math.hypot(x - HUB.x, z - HUB.z);
        const edge = Math.min(1, Math.max(0, (r - 146) / 14));
        h = h * (1 - edge) + 11 * edge;
        const c = z * SX + x;
        heights[c] = h;
        this.biome[c] = best;
        this.tint[c * 3] = Math.min(255, Math.round(tint[0] * 128));
        this.tint[c * 3 + 1] = Math.min(255, Math.round(tint[1] * 128));
        this.tint[c * 3 + 2] = Math.min(255, Math.round(tint[2] * 128));
      }
    }

    // 2. Flatten plazas and roads into the landscape (strongest pull wins, applied once).
    const pull = new Float32Array(SX * SZ);
    const flatten = (cx: number, cz: number, r: number, blend: number) => {
      for (let z = Math.floor(cz - r - blend); z <= Math.ceil(cz + r + blend); z++)
        for (let x = Math.floor(cx - r - blend); x <= Math.ceil(cx + r + blend); x++) {
          if (x < 0 || z < 0 || x >= SX || z >= SZ) continue;
          const d = Math.hypot(x - cx, z - cz);
          const t = d <= r + 1 ? 1 : Math.max(0, 1 - (d - r - 1) / blend);
          const k = t * t * (3 - 2 * t);
          const c = z * SX + x;
          if (k > pull[c]) pull[c] = k;
        }
    };
    for (const [ax, az, bx, bz] of this.roads()) {
      const len = Math.hypot(bx - ax, bz - az);
      for (let s = 0; s <= len; s += 1) {
        const t = s / len;
        flatten(ax + (bx - ax) * t, az + (bz - az) * t, 2.5, 7);
      }
    }
    flatten(HUB.x, HUB.z, HUB.radius, 14);
    for (const s of REALM_SITES) flatten(s.x, s.z, REALM_RADIUS, 14);
    for (const l of LAB_SITES) flatten(l.x, l.z, LAB_RADIUS, 14);
    flatten(PLAYGROUND.x, PLAYGROUND.z, PLAYGROUND.radius, 16);
    for (let c = 0; c < SX * SZ; c++) heights[c] = heights[c] * (1 - pull[c]) + GROUND * pull[c];

    // 3. Fill columns.
    for (let z = 0; z < SZ; z++) {
      for (let x = 0; x < SX; x++) {
        const c = z * SX + x;
        const h = Math.max(3, Math.min(SY - 6, Math.round(heights[c])));
        this.fillColumn(x, z, h, this.biome[c], n2);
      }
    }
  }

  private biomeWeights(x: number, z: number, out: Float32Array) {
    const dx = x - HUB.x, dz = z - HUB.z;
    const theta = Math.atan2(dz, dx);
    const r = Math.hypot(dx, dz);
    let sum = 0;
    for (let i = 0; i < 6; i++) {
      const a = REALM_SITES[i].angle;
      let d = theta - a;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      const w = Math.exp(-((d / 0.4) ** 2));
      out[i] = w;
      sum += w;
    }
    const hub = Math.max(0, 1 - r / 42);
    out[6] = hub * hub * 3;
    sum += out[6];
    for (let i = 0; i < 7; i++) out[i] = out[i] / sum < 0.02 ? 0 : out[i] / sum;
  }

  private biomeHeight(
    b: number, x: number, z: number,
    n1: (x: number, z: number) => number, n2: (x: number, z: number) => number,
    n3: (x: number, z: number) => number, ridge: (x: number, z: number) => number,
  ): number {
    const base = n1(x, z);
    switch (b) {
      case 0: { // meadow: gentle hills with ponds
        const pond = Math.max(0, 0.3 - n3(x + 400, z)) * 30;
        return 25 + (base - 0.5) * 16 - pond;
      }
      case 1: { // dunes
        const d = Math.abs(Math.sin(x * 0.07 + z * 0.045 + n2(x, z) * 5));
        const oasis = Math.max(0, 0.28 - n3(x, z + 900)) * 40;
        return 23 + d * 8 + (base - 0.5) * 6 - oasis;
      }
      case 2: // forest
        return 26 + (base - 0.5) * 18;
      case 3: { // peaks: ridged mountains
        const rr = 1 - Math.abs(ridge(x, z) * 2 - 1);
        return 27 + rr * rr * 46 + (base - 0.5) * 10;
      }
      case 4: // coast: islands and bays
        return 15 + base * 16 + (n2(x, z) - 0.5) * 6;
      case 5: // volcanic
        return 25 + (base - 0.5) * 20 + Math.max(0, n2(x * 1.3, z * 1.3) - 0.65) * 26;
      default: // hub meadow
        return 25 + (base - 0.5) * 8;
    }
  }

  private fillColumn(x: number, z: number, h: number, biome: number, n2: (x: number, z: number) => number) {
    const set = (y: number, b: BlockId) => { this.data[World.index(x, y, z)] = b; };
    set(0, B.BEDROCK);
    const underwater = h < WATER_LEVEL;
    let top: BlockId = B.GRASS, under: BlockId = B.DIRT, deep: BlockId = B.STONE;
    const noise = n2(x * 3, z * 3);
    switch (biome) {
      case 1: top = B.SAND; under = B.SAND; deep = B.SANDSTONE; break;
      case 3:
        if (h > 46) { top = B.SNOW; under = B.STONE; } else if (h > 38 && noise > 0.45) { top = B.STONE; under = B.STONE; }
        break;
      case 4: if (h <= WATER_LEVEL + 2) { top = B.SAND; under = B.SAND; } break;
      case 5:
        top = noise > 0.7 ? B.OBSIDIAN : noise > 0.3 ? B.BASALT : B.GRAVEL;
        under = B.BASALT; deep = B.BASALT;
        break;
    }
    if (underwater) {
      top = biome === 5 ? B.BASALT : noise > 0.55 ? B.GRAVEL : B.SAND;
      under = top === B.GRAVEL ? B.GRAVEL : B.SAND;
    } else if (h <= WATER_LEVEL + 1 && biome !== 5 && biome !== 3) {
      top = B.SAND; under = B.SAND; // beaches
    }
    for (let y = 1; y <= h; y++) set(y, y === h ? top : y > h - 4 ? under : deep);
    // Volcanic lowlands hold lava instead of water.
    const fluid = biome === 5 ? B.MAGMA : B.WATER;
    for (let y = h + 1; y <= WATER_LEVEL; y++) set(y, fluid);
    if (biome === 3 && h + 1 <= WATER_LEVEL && WATER_LEVEL > 0 && h > 15) set(WATER_LEVEL, B.ICE);
  }

  /** Road centre lines: hub → realm → lab. */
  roads(): [number, number, number, number][] {
    const out: [number, number, number, number][] = [];
    for (const s of REALM_SITES) {
      out.push([HUB.x, HUB.z, s.x, s.z]);
      const lab = LAB_SITES.find((l) => l.realm === s.id)!;
      out.push([s.x, s.z, lab.x, lab.z]);
    }
    out.push([HUB.x, HUB.z, PLAYGROUND.x, PLAYGROUND.z]);
    return out;
  }

  private buildRoads() {
    const insidePlaza = (x: number, z: number) =>
      Math.hypot(x - HUB.x, z - HUB.z) < HUB.radius ||
      REALM_SITES.some((s) => Math.hypot(x - s.x, z - s.z) < REALM_RADIUS) ||
      LAB_SITES.some((l) => Math.hypot(x - l.x, z - l.z) < LAB_RADIUS) ||
      Math.hypot(x - PLAYGROUND.x, z - PLAYGROUND.z) < PLAYGROUND.radius;
    let lampCount = 0;
    for (const [ax, az, bx, bz] of this.roads()) {
      const len = Math.hypot(bx - ax, bz - az);
      const nx = -(bz - az) / len, nz = (bx - ax) / len;
      for (let s = 0; s <= len; s += 0.5) {
        const cx = ax + ((bx - ax) * s) / len;
        const cz = az + ((bz - az) * s) / len;
        for (let w = -2; w <= 2; w++) {
          const x = Math.round(cx + nx * w), z = Math.round(cz + nz * w);
          if (insidePlaza(x, z)) continue;
          const edge = Math.abs(w) === 2;
          this.setRaw(x, GROUND, z, edge ? B.GRAVEL : B.PATH);
          for (let y = GROUND - 3; y < GROUND; y++) if (this.get(x, y, z) === B.AIR || this.get(x, y, z) === B.WATER || this.get(x, y, z) === B.MAGMA) this.setRaw(x, y, z, B.STONE);
          for (let y = GROUND + 1; y <= GROUND + 5; y++) this.setRaw(x, y, z, B.AIR);
        }
        // Street lamps every 12 blocks, alternating sides.
        if (Math.abs(s % 12) < 0.25 && s > 4 && s < len - 4) {
          const side = lampCount++ % 2 ? 3 : -3;
          const x = Math.round(cx + nx * side), z = Math.round(cz + nz * side);
          if (!insidePlaza(x, z)) this.lampPost(x, GROUND + 1, z, 3);
        }
      }
    }
  }

  lampPost(x: number, y: number, z: number, h: number, pole: BlockId = B.SPRUCE_LOG) {
    for (let i = 0; i < h; i++) this.setRaw(x, y + i, z, pole);
    this.setRaw(x, y + h, z, B.LAMP);
    if (this.get(x, y - 1, z) === B.AIR) this.setRaw(x, y - 1, z, B.STONE);
  }

  private decorate(n2: (x: number, z: number) => number, n3: (x: number, z: number) => number) {
    const blocked = (x: number, z: number, pad: number) =>
      Math.hypot(x - HUB.x, z - HUB.z) < HUB.radius + pad ||
      REALM_SITES.some((s) => Math.hypot(x - s.x, z - s.z) < REALM_RADIUS + pad) ||
      LAB_SITES.some((l) => Math.hypot(x - l.x, z - l.z) < LAB_RADIUS + pad) ||
      Math.hypot(x - PLAYGROUND.x, z - PLAYGROUND.z) < PLAYGROUND.radius + pad ||
      this.nearRoad(x, z, pad + 2);

    for (let z = 2; z < SZ - 2; z++) {
      for (let x = 2; x < SX - 2; x++) {
        const c = z * SX + x;
        const biome = this.biome[c];
        const y = this.topY(x, z);
        const ground = this.get(x, y, z);
        if (this.get(x, y + 1, z) !== B.AIR || y < WATER_LEVEL) continue;
        const r = hash2(x, z, 1);
        const patch = n3(x * 2.3, z * 2.3);
        const treeOk = !blocked(x, z, 4);
        const plantOk = !blocked(x, z, 0);
        if (!plantOk) continue;

        switch (biome) {
          case 0: // meadow
          case 6:
            if (ground !== B.GRASS) break;
            if (treeOk && r < 0.0045) (hash2(x, z, 2) < 0.5 ? this.oak(x, y + 1, z) : this.birch(x, y + 1, z));
            else if (r < 0.3 && patch > 0.55) this.plant(x, y + 1, z, [B.FLOWER_RED, B.FLOWER_YELLOW, B.FLOWER_BLUE][Math.floor(hash2(x, z, 3) * 3)]);
            else if (r < 0.3) this.plant(x, y + 1, z, B.TALL_GRASS);
            else if (r < 0.302 && treeOk) this.boulder(x, y, z);
            break;
          case 1: // dunes
            if (ground === B.GRASS && treeOk && r < 0.03) this.palm(x, y + 1, z);
            else if (ground === B.GRASS && r < 0.2) this.plant(x, y + 1, z, B.TALL_GRASS);
            else if (ground === B.SAND && treeOk && r < 0.004) this.cactus(x, y + 1, z);
            else if (ground === B.SAND && r < 0.012) this.plant(x, y + 1, z, B.DEAD_BUSH);
            break;
          case 2: // forest
            if (ground !== B.GRASS) break;
            if (treeOk && r < 0.028) {
              const t = hash2(x, z, 4);
              if (t < 0.12) this.bigOak(x, y + 1, z);
              else if (t < 0.55) this.oak(x, y + 1, z);
              else this.birch(x, y + 1, z);
            } else if (r < 0.14) this.plant(x, y + 1, z, B.FERN);
            else if (r < 0.26) this.plant(x, y + 1, z, B.TALL_GRASS);
            else if (r < 0.272) this.plant(x, y + 1, z, B.MUSHROOM);
            else if (r < 0.2775) this.plant(x, y + 1, z, B.GLOW_SHROOM);
            break;
          case 3: // peaks
            if (ground === B.GRASS && y < 44) {
              if (treeOk && r < 0.018) this.spruce(x, y + 1, z);
              else if (r < 0.1) this.plant(x, y + 1, z, B.TALL_GRASS);
              else if (r < 0.105) this.plant(x, y + 1, z, B.FLOWER_BLUE);
            } else if (ground === B.STONE && treeOk && r < 0.003) this.boulder(x, y, z);
            break;
          case 4: // coast
            if (ground === B.GRASS) {
              if (treeOk && r < 0.012) this.cherry(x, y + 1, z);
              else if (r < 0.16) this.plant(x, y + 1, z, B.TALL_GRASS);
              else if (r < 0.2 && patch > 0.5) this.plant(x, y + 1, z, B.FLOWER_RED);
            } else if (ground === B.SAND && treeOk && y <= WATER_LEVEL + 2 && r < 0.006) this.palm(x, y + 1, z);
            else if (ground === B.SAND && treeOk && r < 0.0025) this.crystalCluster(x, y + 1, z);
            break;
          case 5: // volcanic
            if (treeOk && r < 0.003) this.deadTree(x, y + 1, z);
            else if (treeOk && r < 0.0055) this.basaltColumn(x, y + 1, z);
            else if (r < 0.01) this.plant(x, y + 1, z, B.DEAD_BUSH);
            else if (r < 0.0115 && n2(x, z) > 0.5) this.plant(x, y + 1, z, B.GLOW_SHROOM);
            break;
        }
      }
    }
  }

  nearRoad(x: number, z: number, d: number): boolean {
    for (const [ax, az, bx, bz] of this.roads()) {
      const vx = bx - ax, vz = bz - az;
      const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz)));
      if (Math.hypot(x - (ax + vx * t), z - (az + vz * t)) < d) return true;
    }
    return false;
  }

  // ---------------------------------------------------------------- flora

  private plant(x: number, y: number, z: number, b: BlockId) {
    if (this.get(x, y, z) === B.AIR) this.setRaw(x, y, z, b);
  }

  private leafBlob(x: number, y: number, z: number, r: number, leaf: BlockId, squash = 1) {
    const R = Math.ceil(r);
    for (let dx = -R; dx <= R; dx++)
      for (let dy = -R; dy <= R; dy++)
        for (let dz = -R; dz <= R; dz++) {
          const d = Math.hypot(dx, dy * squash, dz);
          if (d > r + 0.3) continue;
          if (d > r - 0.6 && hash2(x + dx * 7, z + dz * 13, y + dy) < 0.35) continue; // ragged edges
          if (this.get(x + dx, y + dy, z + dz) === B.AIR) this.setRaw(x + dx, y + dy, z + dz, leaf);
        }
  }

  private trunk(x: number, y: number, z: number, h: number, log: BlockId) {
    for (let i = 0; i < h; i++) this.setRaw(x, y + i, z, log);
  }

  oak(x: number, y: number, z: number) {
    const h = 4 + Math.floor(hash2(x, z, 9) * 3);
    this.trunk(x, y, z, h, B.LOG);
    this.leafBlob(x, y + h - 1, z, 2.6, B.LEAVES, 1.2);
  }

  bigOak(x: number, y: number, z: number) {
    const h = 7 + Math.floor(hash2(x, z, 9) * 4);
    this.trunk(x, y, z, h, B.LOG);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const bh = 3 + Math.floor(hash2(x + dx, z + dz, 5) * 3);
      for (let i = 1; i <= 2; i++) this.setRaw(x + dx * i, y + bh + i - 1, z + dz * i, B.LOG);
      this.leafBlob(x + dx * 3, y + bh + 2, z + dz * 3, 2.4, B.LEAVES, 1.3);
    }
    this.leafBlob(x, y + h, z, 3.4, B.LEAVES, 1.3);
  }

  birch(x: number, y: number, z: number) {
    const h = 5 + Math.floor(hash2(x, z, 11) * 3);
    this.trunk(x, y, z, h, B.BIRCH_LOG);
    this.leafBlob(x, y + h - 1, z, 2.2, B.BIRCH_LEAVES, 0.9);
  }

  spruce(x: number, y: number, z: number) {
    const h = 7 + Math.floor(hash2(x, z, 13) * 5);
    this.trunk(x, y, z, h, B.SPRUCE_LOG);
    for (let i = 2; i <= h; i++) {
      const r = Math.max(0.6, ((h - i) / h) * 3.2 + (i % 2 ? 0.4 : 0));
      const R = Math.ceil(r);
      for (let dx = -R; dx <= R; dx++)
        for (let dz = -R; dz <= R; dz++) {
          if (Math.hypot(dx, dz) > r) continue;
          if (this.get(x + dx, y + i, z + dz) === B.AIR) this.setRaw(x + dx, y + i, z + dz, B.SPRUCE_LEAVES);
        }
    }
    this.setRaw(x, y + h + 1, z, B.SPRUCE_LEAVES);
  }

  cherry(x: number, y: number, z: number) {
    const h = 4 + Math.floor(hash2(x, z, 17) * 3);
    this.trunk(x, y, z, h, B.LOG);
    const dx = hash2(x, z, 18) < 0.5 ? 1 : -1;
    this.setRaw(x + dx, y + h, z, B.LOG);
    this.leafBlob(x, y + h + 1, z, 3.2, B.CHERRY_LEAVES, 1.5);
    // Fallen petals.
    for (let i = 0; i < 6; i++) {
      const px = x + Math.round((hash2(x, z, 30 + i) - 0.5) * 7);
      const pz = z + Math.round((hash2(z, x, 40 + i) - 0.5) * 7);
      const py = this.topY(px, pz);
      if (this.get(px, py, pz) === B.GRASS && this.get(px, py + 1, pz) === B.AIR) this.setRaw(px, py + 1, pz, B.FLOWER_RED);
    }
  }

  palm(x: number, y: number, z: number) {
    const h = 6 + Math.floor(hash2(x, z, 19) * 3);
    const lean = hash2(x, z, 20) < 0.5 ? 1 : -1;
    let tx = x;
    for (let i = 0; i < h; i++) {
      if (i === Math.floor(h / 2)) tx += lean;
      this.setRaw(tx, y + i, z, B.LOG);
    }
    const top = y + h;
    this.setRaw(tx, top, z, B.LEAVES);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
      for (let i = 1; i <= 3; i++) {
        const droop = i === 3 ? -1 : 0;
        if (this.get(tx + dx * i, top + droop, z + dz * i) === B.AIR) this.setRaw(tx + dx * i, top + droop, z + dz * i, B.LEAVES);
      }
    }
  }

  cactus(x: number, y: number, z: number) {
    const h = 2 + Math.floor(hash2(x, z, 21) * 3);
    this.trunk(x, y, z, h, B.CACTUS);
    if (h >= 3 && hash2(x, z, 22) < 0.5) {
      this.setRaw(x + 1, y + 1, z, B.CACTUS);
      this.setRaw(x + 1, y + 2, z, B.CACTUS);
    }
  }

  deadTree(x: number, y: number, z: number) {
    const h = 4 + Math.floor(hash2(x, z, 23) * 4);
    this.trunk(x, y, z, h, B.SPRUCE_LOG);
    this.setRaw(x + 1, y + h - 2, z, B.SPRUCE_LOG);
    this.setRaw(x - 1, y + h - 1, z, B.SPRUCE_LOG);
    this.setRaw(x, y + h - 3, z + 1, B.SPRUCE_LOG);
  }

  basaltColumn(x: number, y: number, z: number) {
    const h = 3 + Math.floor(hash2(x, z, 24) * 7);
    for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      const hh = h - Math.floor(hash2(x + dx, z + dz, 25) * 3);
      for (let i = 0; i < hh; i++) this.setRaw(x + dx, y + i, z + dz, B.BASALT);
      if (hash2(x + dx, z + dz, 26) < 0.3) this.setRaw(x + dx, y + hh, z + dz, B.MAGMA);
    }
  }

  crystalCluster(x: number, y: number, z: number) {
    const h = 2 + Math.floor(hash2(x, z, 27) * 3);
    this.trunk(x, y, z, h, B.CRYSTAL);
    this.setRaw(x + 1, y, z, B.CRYSTAL);
    this.setRaw(x, y, z + 1, B.CRYSTAL);
    if (h > 2) this.setRaw(x - 1, y + 1, z, B.CRYSTAL);
  }

  private boulder(x: number, y: number, z: number) {
    const r = 1.2 + hash2(x, z, 28) * 1.3;
    const R = Math.ceil(r);
    for (let dx = -R; dx <= R; dx++)
      for (let dy = -1; dy <= R; dy++)
        for (let dz = -R; dz <= R; dz++)
          if (Math.hypot(dx, dy * 1.3, dz) <= r) this.setRaw(x + dx, y + dy, z + dz, hash2(x + dx, z + dz, dy) < 0.3 ? B.GRAVEL : B.STONE);
  }

  setRaw(x: number, y: number, z: number, b: BlockId) {
    if (this.inBounds(x, y, z)) this.data[World.index(x, y, z)] = b;
  }

  protect(x: number, y: number, z: number) {
    if (this.inBounds(x, y, z)) this.protectedCells.add(World.index(x, y, z));
  }

  /** A flat disc of floor at `y` with the space above cleared. */
  disc(cx: number, cz: number, r: number, y: number, floor: (x: number, z: number, d: number) => BlockId, clearAbove = 30) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++)
      for (let z = Math.floor(cz - r); z <= Math.ceil(cz + r); z++) {
        const d = Math.hypot(x - cx, z - cz);
        if (d > r) continue;
        for (let yy = y - 4; yy < y; yy++) this.setRaw(x, yy, z, B.STONE);
        this.setRaw(x, y, z, floor(x, z, d));
        for (let yy = y + 1; yy <= y + clearAbove; yy++) this.setRaw(x, yy, z, B.AIR);
      }
  }

  // ---------------------------------------------------------------- playground

  /** A big empty sand plot with a faint 8-block grid, lamps around the rim and a credits kiosk. */
  private buildPlayground() {
    const { x: cx, z: cz, radius: r } = PLAYGROUND;
    this.disc(cx, cz, r, GROUND, (x, z, d) => {
      if (d > r - 1.2) return B.QUARTZ;
      if (d > r - 2.2) return B.SANDSTONE;
      const gx = (x - cx) % 8 === 0, gz = (z - cz) % 8 === 0;
      return gx || gz ? B.SANDSTONE : B.SAND;
    }, 60);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + Math.PI / 16;
      const x = Math.round(cx + Math.cos(a) * (r - 1.5)), z = Math.round(cz + Math.sin(a) * (r - 1.5));
      // Leave the western (road) entrance clear.
      if (Math.cos(a) < -0.93) continue;
      this.lampPost(x, GROUND + 1, z, 3, B.SANDSTONE);
    }
    const k = PLAYGROUND.kiosk;
    this.setRaw(k.x, GROUND + 1, k.z, B.QUARTZ);
    this.setRaw(k.x, GROUND + 2, k.z, B.GOLD);
    this.protect(k.x, GROUND + 1, k.z);
    this.protect(k.x, GROUND + 2, k.z);
  }

  // ---------------------------------------------------------------- hub, realms, stations

  private buildHub() {
    const { x: hx, z: hz, radius } = HUB;
    this.disc(hx, hz, radius, GROUND, (_x, _z, d) => (d > radius - 1 ? B.BRICK : d > 15.5 && d < 16.6 ? B.PATH : B.QUARTZ));
    // Fountain: a quartz rim around shallow water, with the crystal spire rising from the middle.
    for (let x = hx - 6; x <= hx + 6; x++)
      for (let z = hz - 6; z <= hz + 6; z++) {
        const d = Math.hypot(x - hx, z - hz);
        if (d <= 4.6) {
          this.setRaw(x, GROUND, z, B.WATER);
          this.setRaw(x, GROUND - 1, z, B.QUARTZ);
        } else if (d <= 5.6) {
          this.setRaw(x, GROUND + 1, z, B.QUARTZ);
          this.protect(x, GROUND + 1, z);
        }
      }
    for (let y = 0; y <= 9; y++) {
      const b = y === 9 ? B.GOLD : y === 8 ? B.BEACON : B.CRYSTAL;
      this.setRaw(hx, GROUND + y, hz, b);
      this.protect(hx, GROUND + y, hz);
    }
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      this.setRaw(hx + dx, GROUND + 1, hz + dz, B.CRYSTAL);
      this.setRaw(hx + dx, GROUND + 2, hz + dz, B.CRYSTAL);
    }
    // Portal pads.
    for (const p of HUB_PORTALS) {
      const realm = REALM_BY_ID.get(p.realm)!;
      for (let dx = -1; dx <= 1; dx++)
        for (let dz = -1; dz <= 1; dz++) {
          const edge = Math.abs(dx) === 1 || Math.abs(dz) === 1;
          this.setRaw(p.x + dx, GROUND, p.z + dz, edge ? realm.accent : B.PORTAL);
          this.protect(p.x + dx, GROUND, p.z + dz);
        }
    }
    // Lamps and flower planters around the rim.
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + Math.PI / 12;
      this.lampPost(Math.round(hx + Math.cos(a) * 16), GROUND + 1, Math.round(hz + Math.sin(a) * 16), 3, B.QUARTZ);
    }
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 - Math.PI / 2 + Math.PI / 6;
      const px = Math.round(hx + Math.cos(a) * 9), pz = Math.round(hz + Math.sin(a) * 9);
      for (let dx = -1; dx <= 1; dx++)
        for (let dz = -1; dz <= 1; dz++) {
          this.setRaw(px + dx, GROUND, pz + dz, B.GRASS);
          const f = [B.FLOWER_RED, B.FLOWER_YELLOW, B.FLOWER_BLUE, B.TALL_GRASS][Math.floor(hash2(px + dx, pz + dz, 50) * 4)];
          this.setRaw(px + dx, GROUND + 1, pz + dz, f);
        }
    }
  }

  private buildRealm(site: (typeof REALM_SITES)[number]) {
    const realm = REALM_BY_ID.get(site.id)!;
    this.disc(site.x, site.z, REALM_RADIUS, GROUND, (x, z, d) => {
      if (d > REALM_RADIUS - 1.2) return realm.accent;
      if (d > 16 && d < 17) return B.PATH;
      if (realm.floor === B.GRASS && (x + z) % 2 === 0) return B.GRASS;
      return realm.floor;
    });
    // Display pad: a frame around a white floor where visualisations appear.
    for (let dx = -PAD_HALF - 1; dx <= PAD_HALF + 1; dx++)
      for (let dz = -PAD_HALF - 1; dz <= PAD_HALF + 1; dz++) {
        const frame = Math.abs(dx) === PAD_HALF + 1 || Math.abs(dz) === PAD_HALF + 1;
        this.setRaw(site.x + dx, GROUND, site.z + dz, frame ? realm.accent : B.WHITE);
        this.protect(site.x + dx, GROUND, site.z + dz);
      }
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const x = site.x + dx * (PAD_HALF + 1), z = site.z + dz * (PAD_HALF + 1);
      this.setRaw(x, GROUND + 1, z, B.LAMP);
      this.protect(x, GROUND + 1, z);
    }
    // Return portal to the hub.
    for (let dx = -1; dx <= 1; dx++)
      for (let dz = -1; dz <= 1; dz++) {
        const edge = Math.abs(dx) === 1 || Math.abs(dz) === 1;
        this.setRaw(site.portal.x + dx, GROUND, site.portal.z + dz, edge ? B.GOLD : B.PORTAL);
        this.protect(site.portal.x + dx, GROUND, site.portal.z + dz);
      }
    // Lamp posts around the rim, leaving gaps for the two roads.
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + 0.31;
      const rel = Math.atan2(Math.sin(a - site.angle), Math.cos(a - site.angle));
      if (Math.abs(rel) < 0.35 || Math.abs(Math.abs(rel) - Math.PI) < 0.35) continue;
      this.lampPost(Math.round(site.x + Math.cos(a) * 22.5), GROUND + 1, Math.round(site.z + Math.sin(a) * 22.5), 3);
    }
  }

  private buildStation(x: number, y: number, z: number, top: BlockId) {
    for (let dx = -1; dx <= 1; dx++)
      for (let dz = -1; dz <= 1; dz++) {
        this.setRaw(x + dx, y - 1, z + dz, B.OBSIDIAN);
        this.protect(x + dx, y - 1, z + dz);
        for (let yy = y; yy <= y + 3; yy++) if (dx || dz) this.setRaw(x + dx, yy, z + dz, B.AIR);
      }
    this.setRaw(x, y, z, top);
    this.protect(x, y, z);
  }

  // ---------------------------------------------------------------- persistence

  serializeEdits(): number[] {
    const out: number[] = [];
    for (const [i, b] of this.edits) out.push(i, b);
    return out;
  }

  /** Apply saved edits (call computeAllLight afterwards). */
  applyEdits(flat: number[]) {
    this.tops.fill(-1);
    for (let k = 0; k + 1 < flat.length; k += 2) {
      const i = flat[k], b = flat[k + 1];
      if (i < 0 || i >= this.data.length || this.protectedCells.has(i)) continue;
      this.data[i] = b;
      this.edits.set(i, b);
    }
  }

  relightAll() {
    computeAllLight(this);
  }
}
