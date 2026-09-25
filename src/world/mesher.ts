import * as THREE from 'three';
import { B, BLOCKS, OPAQUE, type RenderPass } from './blocks';
import { CHUNK } from './layout';
import { tileUV } from './textures';
import type { World } from './world';

/**
 * Chunk mesher. For every visible face it emits:
 *  - position, normal and atlas uv
 *  - color: ambient occlusion × biome tint (stored halved so tints can exceed 1)
 *  - aLight: smooth sky + RGB block light averaged over the cells around each corner
 *  - aFlags: sway kind (1 leaves, 2 plant tip, 3 water surface, 4 underwater face) + 10 × glow
 */

interface Face {
  dir: [number, number, number];
  axis: 0 | 1 | 2;
  /** Corners in BL, BR, TR, TL order as seen from outside the block. */
  corners: [number, number, number][];
  tile: 0 | 1 | 2;
  shade: number;
}

const FACES: Face[] = [
  { dir: [1, 0, 0], axis: 0, corners: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], tile: 1, shade: 0.86 },
  { dir: [-1, 0, 0], axis: 0, corners: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], tile: 1, shade: 0.86 },
  { dir: [0, 1, 0], axis: 1, corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], tile: 0, shade: 1.0 },
  { dir: [0, -1, 0], axis: 1, corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], tile: 2, shade: 0.62 },
  { dir: [0, 0, 1], axis: 2, corners: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], tile: 1, shade: 0.76 },
  { dir: [0, 0, -1], axis: 2, corners: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], tile: 1, shade: 0.76 },
];

const AO_LEVELS = [0.42, 0.6, 0.8, 1.0];
const UVS: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1]];
const WATER_TOP = 0.875;

/** Growable typed-array geometry builder, reused between chunks to avoid garbage. */
class Builder {
  pos = new Float32Array(1 << 15);
  nor = new Int8Array(1 << 15);
  uv = new Float32Array(1 << 15);
  col = new Uint8Array(1 << 15);
  light = new Uint8Array(1 << 15);
  flags = new Uint8Array(1 << 13);
  idx = new Uint32Array(1 << 14);
  verts = 0;
  indices = 0;

  reset() {
    this.verts = 0;
    this.indices = 0;
  }

  private grow() {
    const g = <T extends Float32Array | Int8Array | Uint8Array | Uint32Array>(a: T, need: number): T => {
      if (a.length >= need) return a;
      const n = new (a.constructor as { new (len: number): T })(Math.max(need, a.length * 2));
      n.set(a);
      return n;
    };
    const v = this.verts + 4;
    this.pos = g(this.pos, v * 3);
    this.nor = g(this.nor, v * 3);
    this.uv = g(this.uv, v * 2);
    this.col = g(this.col, v * 3);
    this.light = g(this.light, v * 4);
    this.flags = g(this.flags, v);
    this.idx = g(this.idx, this.indices + 6);
  }

  vertex(x: number, y: number, z: number, nx: number, ny: number, nz: number, u: number, v: number,
    c0: number, c1: number, c2: number, l0: number, l1: number, l2: number, l3: number, flag: number) {
    if (this.verts * 3 + 3 > this.pos.length || this.verts * 4 + 4 > this.light.length || this.verts + 1 > this.flags.length) this.grow();
    const i = this.verts++;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.nor[i * 3] = nx; this.nor[i * 3 + 1] = ny; this.nor[i * 3 + 2] = nz;
    this.uv[i * 2] = u; this.uv[i * 2 + 1] = v;
    this.col[i * 3] = c0; this.col[i * 3 + 1] = c1; this.col[i * 3 + 2] = c2;
    this.light[i * 4] = l0; this.light[i * 4 + 1] = l1; this.light[i * 4 + 2] = l2; this.light[i * 4 + 3] = l3;
    this.flags[i] = flag;
    return i;
  }

  quad(a: number, b: number, c: number, d: number, flip: boolean) {
    if (this.indices + 6 > this.idx.length) this.grow();
    const I = this.idx;
    let k = this.indices;
    if (flip) {
      I[k++] = b; I[k++] = c; I[k++] = d; I[k++] = b; I[k++] = d; I[k++] = a;
    } else {
      I[k++] = a; I[k++] = b; I[k++] = c; I[k++] = a; I[k++] = c; I[k++] = d;
    }
    this.indices = k;
  }

  toGeometry(): THREE.BufferGeometry | null {
    if (!this.indices) return null;
    const n = this.verts;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos.slice(0, n * 3), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(this.nor.slice(0, n * 3), 3, true));
    g.setAttribute('uv', new THREE.BufferAttribute(this.uv.slice(0, n * 2), 2));
    g.setAttribute('color', new THREE.BufferAttribute(this.col.slice(0, n * 3), 3, true));
    g.setAttribute('aLight', new THREE.BufferAttribute(this.light.slice(0, n * 4), 4, true));
    g.setAttribute('aFlags', new THREE.BufferAttribute(this.flags.slice(0, n), 1, false));
    const index = n < 65536 ? new Uint16Array(this.idx.subarray(0, this.indices)) : this.idx.slice(0, this.indices);
    g.setIndex(new THREE.BufferAttribute(index, 1));
    g.computeBoundingSphere();
    return g;
  }
}

const builders: Record<RenderPass, Builder> = {
  opaque: new Builder(),
  cutout: new Builder(),
  water: new Builder(),
  translucent: new Builder(),
};

export type ChunkGeometry = Record<RenderPass, THREE.BufferGeometry | null>;

/** Build geometry for one 16×SY×16 column of the world. */
export function meshChunk(world: World, cx: number, cz: number): ChunkGeometry {
  const { sx, sy, sz, data, light, tint } = world;
  const layer = sx * sz;
  for (const b of Object.values(builders)) b.reset();
  const x0 = cx * CHUNK, z0 = cz * CHUNK;

  const blockAt = (x: number, y: number, z: number) => {
    if (x < 0 || z < 0 || x >= sx || z >= sz || y >= sy) return B.AIR;
    if (y < 0) return B.BEDROCK;
    return data[y * layer + z * sx + x];
  };
  const lightAt = (x: number, y: number, z: number) => {
    if (x < 0 || z < 0 || x >= sx || z >= sz || y >= sy) return 0xf000;
    if (y < 0) return 0;
    return light[y * layer + z * sx + x];
  };

  // Scratch for smooth light.
  const acc = [0, 0, 0, 0];
  const addLight = (v: number) => {
    acc[0] += v >>> 12; acc[1] += (v >>> 8) & 15; acc[2] += (v >>> 4) & 15; acc[3] += v & 15;
  };

  for (let y = 1; y < sy; y++) {
    for (let z = z0; z < z0 + CHUNK; z++) {
      const rowBase = y * layer + z * sx;
      for (let x = x0; x < x0 + CHUNK; x++) {
        const id = data[rowBase + x];
        if (id === B.AIR) continue;
        const def = BLOCKS[id];
        const buf = builders[def.pass];
        const glow = def.glow ?? 0;
        const col = z * sx + x;
        const tr = tint[col * 3], tg = tint[col * 3 + 1], tb = tint[col * 3 + 2];

        if (def.shape === 'cross') {
          emitCross(buf, x, y, z, def.tiles[1], lightAt(x, y, z), def.tinted ? [tr, tg, tb] : null, def.sway ?? 0, glow);
          continue;
        }

        const isWater = id === B.WATER;
        const waterSurface = isWater && blockAt(x, y + 1, z) !== B.WATER;

        for (let f = 0; f < 6; f++) {
          const face = FACES[f];
          const [dx, dy, dz] = face.dir;
          const n = blockAt(x + dx, y + dy, z + dz);
          if (OPAQUE[n]) continue;
          if (def.pass !== 'opaque' && n === id) continue;
          if (isWater && n !== B.AIR && BLOCKS[n].pass !== 'cutout' && BLOCKS[n].shape !== 'cross') continue;

          const [u0, v0, u1, v1] = tileUV(def.tiles[face.tile]);
          const tinted = def.tinted === 'all' || (def.tinted === 'top' && face.tile === 0);
          let flag = def.sway === 1 ? 1 : 0;
          if (isWater && f === 2) flag = 3;
          else if (!isWater && n === B.WATER) flag = 4; // underwater face: caustics
          flag += Math.min(9, glow) * 10;

          const fx = x + dx, fy = y + dy, fz = z + dz;
          const ids: number[] = [];
          const ao: number[] = [];
          for (let c = 0; c < 4; c++) {
            const [ox, oy, oz] = face.corners[c];
            // Tangent offsets for this corner on the layer in front of the face.
            let ax = 0, ay = 0, az = 0, bx = 0, by = 0, bz = 0;
            if (face.axis === 0) { ay = oy ? 1 : -1; bz = oz ? 1 : -1; }
            else if (face.axis === 1) { ax = ox ? 1 : -1; bz = oz ? 1 : -1; }
            else { ax = ox ? 1 : -1; ay = oy ? 1 : -1; }
            const s1 = OPAQUE[blockAt(fx + ax, fy + ay, fz + az)];
            const s2 = OPAQUE[blockAt(fx + bx, fy + by, fz + bz)];
            const cc = s1 && s2 ? 1 : OPAQUE[blockAt(fx + ax + bx, fy + ay + by, fz + az + bz)];
            const level = s1 && s2 ? 0 : 3 - (s1 + s2 + cc);

            acc[0] = acc[1] = acc[2] = acc[3] = 0;
            let cnt = 1;
            addLight(lightAt(fx, fy, fz));
            if (!s1) { addLight(lightAt(fx + ax, fy + ay, fz + az)); cnt++; }
            if (!s2) { addLight(lightAt(fx + bx, fy + by, fz + bz)); cnt++; }
            if (!cc) { addLight(lightAt(fx + ax + bx, fy + ay + by, fz + az + bz)); cnt++; }
            const k = 17 / cnt;

            const shade = glow ? 1 : face.shade * AO_LEVELS[level];
            const c0 = tinted ? Math.min(255, (shade * tr) | 0) : Math.round(shade * 127.5);
            const c1 = tinted ? Math.min(255, (shade * tg) | 0) : Math.round(shade * 127.5);
            const c2 = tinted ? Math.min(255, (shade * tb) | 0) : Math.round(shade * 127.5);

            let py = y + oy;
            if (isWater && oy === 1 && waterSurface) py = y + WATER_TOP;
            ao.push(level);
            ids.push(buf.vertex(
              x + ox, py, z + oz, dx * 127, dy * 127, dz * 127,
              UVS[c][0] ? u1 : u0, UVS[c][1] ? v1 : v0,
              c0, c1, c2,
              Math.round(acc[0] * k), Math.round(acc[1] * k), Math.round(acc[2] * k), Math.round(acc[3] * k),
              flag,
            ));
          }
          buf.quad(ids[0], ids[1], ids[2], ids[3], ao[0] + ao[2] < ao[1] + ao[3]);
        }
      }
    }
  }

  return {
    opaque: builders.opaque.toGeometry(),
    cutout: builders.cutout.toGeometry(),
    water: builders.water.toGeometry(),
    translucent: builders.translucent.toGeometry(),
  };
}

/** Two crossed quads for plants. Top vertices carry the sway flag so the base stays planted. */
function emitCross(buf: Builder, x: number, y: number, z: number, tile: number, lightValue: number,
  tint: [number, number, number] | null, sway: number, glow: number) {
  const [u0, v0, u1, v1] = tileUV(tile);
  const l0 = (lightValue >>> 12) * 17, l1 = ((lightValue >>> 8) & 15) * 17, l2 = ((lightValue >>> 4) & 15) * 17, l3 = (lightValue & 15) * 17;
  const c = tint ?? [128, 128, 128];
  const g = Math.min(9, glow) * 10;
  // Jitter plants a little inside their cell so fields don't look gridded.
  const jx = ((x * 73856093) ^ (z * 19349663)) & 7;
  const ox = (jx - 3.5) * 0.03, oz = (((x * 83492791) ^ (z * 2654435761)) & 7) * 0.03 - 0.1;
  const quads: [number, number, number, number][] = [
    [0.15, 0.15, 0.85, 0.85],
    [0.15, 0.85, 0.85, 0.15],
  ];
  for (const [ax, az, bx, bz] of quads) {
    const a = buf.vertex(x + ax + ox, y, z + az + oz, 0, 127, 0, u0, v0, c[0], c[1], c[2], l0, l1, l2, l3, g);
    const b = buf.vertex(x + bx + ox, y, z + bz + oz, 0, 127, 0, u1, v0, c[0], c[1], c[2], l0, l1, l2, l3, g);
    const cc = buf.vertex(x + bx + ox, y + 0.95, z + bz + oz, 0, 127, 0, u1, v1, c[0], c[1], c[2], l0, l1, l2, l3, sway + g);
    const d = buf.vertex(x + ax + ox, y + 0.95, z + az + oz, 0, 127, 0, u0, v1, c[0], c[1], c[2], l0, l1, l2, l3, sway + g);
    buf.quad(a, b, cc, d, false);
  }
}
