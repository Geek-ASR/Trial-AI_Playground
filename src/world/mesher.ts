import * as THREE from 'three';
import { B, blockDef, isOpaque, type RenderPass } from './blocks';
import { CHUNK, SY } from './layout';
import { tileUV } from './textures';
import type { World } from './world';

interface Face {
  dir: [number, number, number];
  /** Corners in BL, BR, TR, TL order as seen from outside the block. */
  corners: [number, number, number][];
  /** 0 = top tile, 1 = side, 2 = bottom. */
  tile: 0 | 1 | 2;
  shade: number;
}

const FACES: Face[] = [
  { dir: [1, 0, 0], corners: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], tile: 1, shade: 0.8 },
  { dir: [-1, 0, 0], corners: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], tile: 1, shade: 0.8 },
  { dir: [0, 1, 0], corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], tile: 0, shade: 1.0 },
  { dir: [0, -1, 0], corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], tile: 2, shade: 0.5 },
  { dir: [0, 0, 1], corners: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], tile: 1, shade: 0.65 },
  { dir: [0, 0, -1], corners: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], tile: 1, shade: 0.65 },
];

const AO_LEVELS = [0.45, 0.62, 0.8, 1.0];
const UVS: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1]];

class Buffers {
  pos: number[] = [];
  uv: number[] = [];
  col: number[] = [];
  idx: number[] = [];

  toGeometry(): THREE.BufferGeometry | null {
    if (!this.idx.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

export type ChunkGeometry = Record<RenderPass, THREE.BufferGeometry | null>;

/** Build geometry for one 16×SY×16 column of the world. */
export function meshChunk(world: World, cx: number, cz: number): ChunkGeometry {
  const bufs: Record<RenderPass, Buffers> = { opaque: new Buffers(), cutout: new Buffers(), translucent: new Buffers() };
  const x0 = cx * CHUNK, z0 = cz * CHUNK;
  const occ = (x: number, y: number, z: number) => (isOpaque(world.get(x, y, z)) ? 1 : 0);

  for (let y = 1; y < SY; y++) {
    for (let z = z0; z < z0 + CHUNK; z++) {
      for (let x = x0; x < x0 + CHUNK; x++) {
        const id = world.get(x, y, z);
        if (id === B.AIR) continue;
        const def = blockDef(id);
        const buf = bufs[def.pass];

        for (const face of FACES) {
          const [dx, dy, dz] = face.dir;
          const n = world.get(x + dx, y + dy, z + dz);
          // Cull faces hidden by an opaque neighbour, or shared with the same see-through block.
          if (isOpaque(n)) continue;
          if (def.pass !== 'opaque' && n === id) continue;
          if (def.pass === 'translucent' && n !== B.AIR && blockDef(n).pass !== 'cutout') continue;

          const [u0, v0, u1, v1] = tileUV(def.tiles[face.tile]);
          const base = buf.pos.length / 3;
          const ao: number[] = [];

          for (let c = 0; c < 4; c++) {
            const [ox, oy, oz] = face.corners[c];
            buf.pos.push(x + ox, y + oy, z + oz);
            buf.uv.push(UVS[c][0] ? u1 : u0, UVS[c][1] ? v1 : v0);

            let light = face.shade;
            let level = 3;
            if (!def.glow) {
              // Ambient occlusion: sample the three blocks touching this corner in front of the face.
              const s = [ox ? 1 : -1, oy ? 1 : -1, oz ? 1 : -1];
              const fx = x + dx, fy = y + dy, fz = z + dz;
              let side1: number, side2: number, corner: number;
              if (dx !== 0) {
                side1 = occ(fx, fy + s[1], fz);
                side2 = occ(fx, fy, fz + s[2]);
                corner = occ(fx, fy + s[1], fz + s[2]);
              } else if (dy !== 0) {
                side1 = occ(fx + s[0], fy, fz);
                side2 = occ(fx, fy, fz + s[2]);
                corner = occ(fx + s[0], fy, fz + s[2]);
              } else {
                side1 = occ(fx + s[0], fy, fz);
                side2 = occ(fx, fy + s[1], fz);
                corner = occ(fx + s[0], fy + s[1], fz);
              }
              level = side1 && side2 ? 0 : 3 - (side1 + side2 + corner);
            } else {
              light = 1;
            }
            ao.push(level);
            const v = light * AO_LEVELS[level];
            buf.col.push(v, v, v);
          }

          // Flip the quad's diagonal when it makes the AO gradient look smoother.
          if (ao[0] + ao[2] < ao[1] + ao[3]) {
            buf.idx.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
          } else {
            buf.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
          }
        }
      }
    }
  }

  return {
    opaque: bufs.opaque.toGeometry(),
    cutout: bufs.cutout.toGeometry(),
    translucent: bufs.translucent.toGeometry(),
  };
}
