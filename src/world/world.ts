import { REALM_BY_ID } from '../curriculum';
import { B, isOpaque, isSolid, type BlockId } from './blocks';
import {
  CHUNK, GROUND, HUB, HUB_PORTALS, PAD_HALF, REALM_RADIUS, REALM_SITES, STATIONS, SX, SY, SZ, WATER_LEVEL,
} from './layout';

/** Deterministic 2-D value noise with fractal octaves. */
function makeNoise(seed: number) {
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
    let sum = 0, amp = 1, freq = 1 / 48, norm = 0;
    for (let o = 0; o < 4; o++) {
      sum += value(x * freq, z * freq) * amp;
      norm += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return sum / norm;
  };
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

export class World {
  readonly data = new Uint8Array(SX * SY * SZ);
  /** Blocks the player may not break (stations, portals, pads). */
  readonly protectedCells = new Set<number>();
  /** Player / builder edits relative to the generated terrain, for saving. */
  readonly edits = new Map<number, BlockId>();
  private dirty = new Set<number>();
  private listeners: ((cx: number, cz: number) => void)[] = [];

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

  /** Set a block and mark affected chunks for re-meshing. `record` saves it as a user edit. */
  set(x: number, y: number, z: number, b: BlockId, record = true): boolean {
    if (!this.inBounds(x, y, z) || y === 0) return false;
    const i = World.index(x, y, z);
    if (this.data[i] === b) return false;
    this.data[i] = b;
    if (record) this.edits.set(i, b);
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
    this.markDirty(cx, cz);
    const lx = x - cx * CHUNK, lz = z - cz * CHUNK;
    if (lx === 0) this.markDirty(cx - 1, cz);
    if (lx === CHUNK - 1) this.markDirty(cx + 1, cz);
    if (lz === 0) this.markDirty(cx, cz - 1);
    if (lz === CHUNK - 1) this.markDirty(cx, cz + 1);
    return true;
  }

  isProtected(x: number, y: number, z: number): boolean {
    return this.protectedCells.has(World.index(x, y, z));
  }

  solidAt(x: number, y: number, z: number): boolean {
    return isSolid(this.get(Math.floor(x), Math.floor(y), Math.floor(z)));
  }

  opaqueAt(x: number, y: number, z: number): boolean {
    return isOpaque(this.get(x, y, z));
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

  /** Height of the highest solid block in a column (the y you'd stand on is this + 1). */
  topY(x: number, z: number): number {
    for (let y = SY - 1; y > 0; y--) if (isSolid(this.get(x, y, z))) return y;
    return 0;
  }

  /** Voxel DDA ray cast (Amanatides & Woo). */
  raycast(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxDist: number): RayHit | null {
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
      if (b !== B.AIR && b !== B.WATER) return { x, y, z, nx, ny, nz, block: b };
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
    const noise = makeNoise(seed);
    const detail = makeNoise(seed ^ 0x9e3779b9);

    for (let z = 0; z < SZ; z++) {
      for (let x = 0; x < SX; x++) {
        const { h, top, under } = this.columnProfile(x, z, noise, detail);
        this.data[World.index(x, 0, z)] = B.BEDROCK;
        for (let y = 1; y <= h; y++) {
          const b = y === h ? top : y > h - 4 ? under : B.STONE;
          this.data[World.index(x, y, z)] = b;
        }
        for (let y = h + 1; y <= WATER_LEVEL; y++) this.data[World.index(x, y, z)] = B.WATER;
      }
    }

    this.decorate(detail);
    // Paths first, so the hub and realm plazas (and their portals) are drawn over them.
    this.buildPaths();
    this.buildHub();
    for (const site of REALM_SITES) this.buildRealm(site);
    for (const s of STATIONS) this.buildStation(s.x, s.y, s.z, s.kind === 'forge' ? B.CRYSTAL : B.BEACON);
    this.dirty.clear();
  }

  private columnProfile(x: number, z: number, noise: (x: number, z: number) => number, detail: (x: number, z: number) => number) {
    const n = noise(x, z);
    let h = Math.round(14 + n * 30 + (detail(x * 3, z * 3) - 0.5) * 3);

    // Which realm (if any) is closest? Blend terrain height towards the plaza level near it.
    let nearest = REALM_SITES[0];
    let nd = Infinity;
    for (const s of REALM_SITES) {
      const d = Math.hypot(x - s.x, z - s.z);
      if (d < nd) { nd = d; nearest = s; }
    }
    const dh = Math.hypot(x - HUB.x, z - HUB.z);
    const flatten = (d: number, r: number, falloff: number) => {
      if (d <= r) return 1;
      if (d >= r + falloff) return 0;
      return 1 - (d - r) / falloff;
    };
    const w = Math.max(flatten(nd, REALM_RADIUS + 1, 14), flatten(dh, HUB.radius + 1, 14));
    h = Math.round(h * (1 - w) + GROUND * w);
    h = Math.max(4, Math.min(SY - 12, h));

    // Biome palette by nearest realm.
    let top: BlockId = B.GRASS, under: BlockId = B.DIRT;
    switch (nearest.id) {
      case 'data': top = B.SAND; under = B.SAND; break;
      case 'neural': top = h > 26 ? B.SNOW : B.GRASS; break;
      case 'tokens': if (detail(x, z) > 0.62) top = B.SAND; break;
      case 'agents': if (detail(x, z) > 0.6) top = B.STONE; break;
    }
    if (h <= WATER_LEVEL) { top = B.SAND; under = B.SAND; }
    if (h > 36) { top = B.SNOW; under = B.STONE; }
    return { h, top, under };
  }

  private decorate(detail: (x: number, z: number) => number) {
    for (let z = 3; z < SZ - 3; z += 1) {
      for (let x = 3; x < SX - 3; x += 1) {
        const r = detail(x * 7.3, z * 5.1);
        if (r < 0.86) continue;
        if ((x * 31 + z * 17) % 11 !== 0) continue;
        if (Math.hypot(x - HUB.x, z - HUB.z) < HUB.radius + 6) continue;
        if (REALM_SITES.some((s) => Math.hypot(x - s.x, z - s.z) < REALM_RADIUS + 4)) continue;
        const y = this.topY(x, z);
        const ground = this.get(x, y, z);
        if (ground === B.GRASS) this.tree(x, y + 1, z, 4 + ((x + z) % 3));
        else if (ground === B.SAND && y > WATER_LEVEL) this.cactusCrystal(x, y + 1, z);
      }
    }
  }

  private tree(x: number, y: number, z: number, h: number) {
    for (let i = 0; i < h; i++) this.setRaw(x, y + i, z, B.LOG);
    for (let dx = -2; dx <= 2; dx++)
      for (let dz = -2; dz <= 2; dz++)
        for (let dy = h - 2; dy <= h + 1; dy++) {
          const r = Math.abs(dx) + Math.abs(dz) + Math.max(0, dy - h);
          if (r <= 3 && this.get(x + dx, y + dy, z + dz) === B.AIR) this.setRaw(x + dx, y + dy, z + dz, B.LEAVES);
        }
  }

  private cactusCrystal(x: number, y: number, z: number) {
    const h = 2 + ((x ^ z) & 1);
    for (let i = 0; i < h; i++) this.setRaw(x, y + i, z, B.GREEN);
    this.setRaw(x, y + h, z, B.YELLOW);
  }

  private setRaw(x: number, y: number, z: number, b: BlockId) {
    if (this.inBounds(x, y, z)) this.data[World.index(x, y, z)] = b;
  }

  private protect(x: number, y: number, z: number) {
    this.protectedCells.add(World.index(x, y, z));
  }

  private disc(cx: number, cz: number, r: number, y: number, b: BlockId, clearAbove = 18) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++)
      for (let z = Math.floor(cz - r); z <= Math.ceil(cz + r); z++) {
        if (Math.hypot(x - cx, z - cz) > r) continue;
        for (let yy = y - 3; yy < y; yy++) this.setRaw(x, yy, z, B.STONE);
        this.setRaw(x, y, z, b);
        for (let yy = y + 1; yy <= y + clearAbove; yy++) this.setRaw(x, yy, z, B.AIR);
      }
  }

  private buildHub() {
    this.disc(HUB.x, HUB.z, HUB.radius, GROUND, B.QUARTZ);
    // A ring of brick around the edge and a crystal spire in the middle.
    for (let a = 0; a < Math.PI * 2; a += 0.02) {
      const x = Math.round(HUB.x + Math.cos(a) * HUB.radius);
      const z = Math.round(HUB.z + Math.sin(a) * HUB.radius);
      this.setRaw(x, GROUND, z, B.BRICK);
    }
    for (let y = 1; y <= 7; y++) this.setRaw(HUB.x, GROUND + y, HUB.z, y === 7 ? B.BEACON : B.CRYSTAL);
    this.setRaw(HUB.x, GROUND + 8, HUB.z, B.GOLD);
    for (let y = 1; y <= 8; y++) this.protect(HUB.x, GROUND + y, HUB.z);
    for (const p of HUB_PORTALS) {
      const realm = REALM_BY_ID.get(p.realm)!;
      for (let dx = -1; dx <= 1; dx++)
        for (let dz = -1; dz <= 1; dz++) {
          const edge = Math.abs(dx) === 1 || Math.abs(dz) === 1;
          const b = edge ? realm.accent : B.PORTAL;
          this.setRaw(p.x + dx, GROUND, p.z + dz, b);
          this.protect(p.x + dx, GROUND, p.z + dz);
        }
    }
  }

  private buildRealm(site: (typeof REALM_SITES)[number]) {
    const realm = REALM_BY_ID.get(site.id)!;
    this.disc(site.x, site.z, REALM_RADIUS, GROUND, realm.floor);
    // Display pad: an obsidian frame around a quartz floor where visualisations appear.
    for (let dx = -PAD_HALF - 1; dx <= PAD_HALF + 1; dx++)
      for (let dz = -PAD_HALF - 1; dz <= PAD_HALF + 1; dz++) {
        const frame = Math.abs(dx) === PAD_HALF + 1 || Math.abs(dz) === PAD_HALF + 1;
        this.setRaw(site.x + dx, GROUND, site.z + dz, frame ? realm.accent : B.WHITE);
        this.protect(site.x + dx, GROUND, site.z + dz);
      }
    // Return portal to the hub.
    for (let dx = -1; dx <= 1; dx++)
      for (let dz = -1; dz <= 1; dz++) {
        const edge = Math.abs(dx) === 1 || Math.abs(dz) === 1;
        this.setRaw(site.portal.x + dx, GROUND, site.portal.z + dz, edge ? B.GOLD : B.PORTAL);
        this.protect(site.portal.x + dx, GROUND, site.portal.z + dz);
      }
    // Corner lanterns.
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const x = site.x + dx * (PAD_HALF + 3), z = site.z + dz * (PAD_HALF + 3);
      for (let y = 1; y <= 3; y++) this.setRaw(x, GROUND + y, z, y === 3 ? realm.accent : B.LOG);
    }
  }

  private buildPaths() {
    for (const site of REALM_SITES) {
      const steps = Math.ceil(Math.hypot(site.x - HUB.x, site.z - HUB.z));
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const cx = HUB.x + (site.x - HUB.x) * t;
        const cz = HUB.z + (site.z - HUB.z) * t;
        if (Math.hypot(cx - HUB.x, cz - HUB.z) < HUB.radius - 1) continue;
        if (Math.hypot(cx - site.x, cz - site.z) < REALM_RADIUS - 1) continue;
        for (let w = -1; w <= 1; w++) {
          const x = Math.round(cx + Math.cos(site.angle + Math.PI / 2) * w);
          const z = Math.round(cz + Math.sin(site.angle + Math.PI / 2) * w);
          const y = this.topY(x, z);
          const b = this.get(x, y, z);
          if (b === B.LEAVES || b === B.LOG) continue;
          // Bridge over water, pave elsewhere.
          const top = Math.max(y, WATER_LEVEL);
          this.setRaw(x, top, z, top > y ? B.PLANKS : B.PATH);
          for (let yy = top + 1; yy <= top + 3; yy++) if (this.get(x, yy, z) !== B.AIR) this.setRaw(x, yy, z, B.AIR);
        }
      }
    }
  }

  private buildStation(x: number, y: number, z: number, top: BlockId) {
    for (let dx = -1; dx <= 1; dx++)
      for (let dz = -1; dz <= 1; dz++) {
        this.setRaw(x + dx, y - 1, z + dz, B.OBSIDIAN);
        this.protect(x + dx, y - 1, z + dz);
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

  applyEdits(flat: number[]) {
    for (let k = 0; k + 1 < flat.length; k += 2) {
      const i = flat[k], b = flat[k + 1];
      if (i < 0 || i >= this.data.length || this.protectedCells.has(i)) continue;
      this.data[i] = b;
      this.edits.set(i, b);
    }
  }
}
