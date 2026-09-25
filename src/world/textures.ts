import * as THREE from 'three';
import { TILE_NAMES, type TileName } from './blocks';

export const TILE_PX = 16;
export const ATLAS_COLS = 8;
export const ATLAS_ROWS = Math.ceil(TILE_NAMES.length / ATLAS_COLS);

/** Small deterministic PRNG so textures look identical on every visit. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type RGB = [number, number, number];
const hex = (h: number): RGB => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
const shade = (c: RGB, k: number): RGB => c.map((v) => Math.max(0, Math.min(255, Math.round(v * k)))) as RGB;

interface Painter {
  px(x: number, y: number, c: RGB, a?: number): void;
  noise(base: RGB, amount: number): void;
  r: () => number;
}

const PAINTERS: Record<TileName, (p: Painter) => void> = {
  grass_top: (p) => {
    p.noise(hex(0x6cbf4f), 0.22);
    for (let i = 0; i < 18; i++) p.px(Math.floor(p.r() * 16), Math.floor(p.r() * 16), shade(hex(0x6cbf4f), 1.18));
    for (let i = 0; i < 10; i++) p.px(Math.floor(p.r() * 16), Math.floor(p.r() * 16), shade(hex(0x6cbf4f), 0.78));
  },
  grass_side: (p) => {
    p.noise(hex(0x8a5a3b), 0.2);
    for (let i = 0; i < 6; i++) p.px(Math.floor(p.r() * 16), 5 + Math.floor(p.r() * 11), hex(0x6e4a30));
    for (let x = 0; x < 16; x++) {
      const h = 3 + Math.floor(p.r() * 3);
      for (let y = 0; y < h; y++) p.px(x, y, shade(hex(0x62ad49), 0.85 + p.r() * 0.3));
    }
  },
  dirt: (p) => {
    p.noise(hex(0x8a5a3b), 0.22);
    for (let i = 0; i < 8; i++) p.px(Math.floor(p.r() * 16), Math.floor(p.r() * 16), hex(0x6e4a30));
    for (let i = 0; i < 5; i++) p.px(Math.floor(p.r() * 16), Math.floor(p.r() * 16), hex(0xa27250));
  },
  stone: (p) => {
    p.noise(hex(0x8b8f96), 0.14);
    for (let i = 0; i < 7; i++) {
      const x = Math.floor(p.r() * 14), y = Math.floor(p.r() * 14);
      p.px(x, y, hex(0x6d7178));
      p.px(x + 1, y, hex(0x6d7178));
      p.px(x, y + 1, hex(0x767a82));
    }
  },
  sand: (p) => {
    p.noise(hex(0xe3cf8f), 0.08);
    for (let i = 0; i < 12; i++) p.px(Math.floor(p.r() * 16), Math.floor(p.r() * 16), hex(0xcdb574));
  },
  water: (p) => {
    p.noise(hex(0x2f6fb8), 0.1);
    for (let y = 2; y < 16; y += 5) for (let x = 0; x < 16; x++) if ((x + y) % 7 < 3) p.px(x, y, hex(0x5b95d8));
  },
  log_side: (p) => {
    for (let x = 0; x < 16; x++) {
      const k = x % 4 === 0 ? 0.72 : 0.95 + p.r() * 0.1;
      for (let y = 0; y < 16; y++) p.px(x, y, shade(hex(0x6b4a2b), k * (0.92 + p.r() * 0.14)));
    }
  },
  log_top: (p) => {
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
        const ring = Math.floor(d) % 3 === 0;
        p.px(x, y, d > 6.5 ? hex(0x5a3d22) : shade(hex(0xb78a52), ring ? 0.8 : 1));
      }
  },
  leaves: (p) => {
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        if (p.r() < 0.14) continue; // holes for the cut-out look
        p.px(x, y, shade(hex(0x4d9a41), 0.7 + p.r() * 0.5));
      }
  },
  snow: (p) => {
    p.noise(hex(0xf2f6fb), 0.04);
    for (let i = 0; i < 6; i++) p.px(Math.floor(p.r() * 16), Math.floor(p.r() * 16), hex(0xdde6f2));
  },
  snow_side: (p) => {
    p.noise(hex(0x8a5a3b), 0.2);
    for (let x = 0; x < 16; x++) {
      const h = 4 + Math.floor(p.r() * 3);
      for (let y = 0; y < h; y++) p.px(x, y, shade(hex(0xf2f6fb), 0.95 + p.r() * 0.05));
    }
  },
  glass: (p) => {
    // Clear float glass: a faint blue-green body, a thin bright rim and two soft reflection streaks.
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const edge = x === 0 || y === 0 || x === 15 || y === 15;
        const d = x + y;
        const streak = d === 9 || d === 10 || d === 21;
        if (edge) p.px(x, y, hex(0xe4f6ff), 0.8);
        else p.px(x, y, streak ? hex(0xffffff) : hex(0xbfe6f2), streak ? 0.32 : 0.12);
      }
  },
  brick: (p) => {
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const mortar = y % 4 === 3 || (x + (Math.floor(y / 4) % 2) * 4) % 8 === 7;
        p.px(x, y, mortar ? hex(0xc9bfb4) : shade(hex(0xa4493d), 0.82 + p.r() * 0.28));
      }
  },
  planks: (p) => {
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const seam = y % 4 === 3 || (y % 8 < 4 ? x === 5 : x === 12);
        p.px(x, y, seam ? hex(0x7d5a33) : shade(hex(0xb78a52), 0.88 + p.r() * 0.16));
      }
  },
  crystal: (p) => {
    p.noise(hex(0xb57cff), 0.15);
    for (let i = 0; i < 16; i++) p.px(i, i, hex(0xf1e3ff));
    for (let i = 0; i < 16; i++) p.px(15 - i, i, hex(0xdcc4ff));
  },
  beacon: (p) => {
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const d = Math.hypot(x - 7.5, y - 7.5);
        p.px(x, y, d < 4 ? hex(0xffffff) : d < 6.5 ? hex(0x7ef9ff) : hex(0x2d8a99));
      }
  },
  obsidian: (p) => {
    p.noise(hex(0x241a38), 0.25);
    for (let i = 0; i < 5; i++) p.px(Math.floor(p.r() * 16), Math.floor(p.r() * 16), hex(0x5b3f8f));
  },
  path: (p) => {
    p.noise(hex(0xc2a36b), 0.14);
    for (let i = 0; i < 10; i++) p.px(Math.floor(p.r() * 16), Math.floor(p.r() * 16), hex(0xa88a55));
  },
  path_side: (p) => {
    p.noise(hex(0x8a5a3b), 0.2);
    for (let x = 0; x < 16; x++) for (let y = 0; y < 3; y++) p.px(x, y, shade(hex(0xc2a36b), 0.9 + p.r() * 0.2));
  },
  red: (p) => p.noise(hex(0xe5484d), 0.06),
  orange: (p) => p.noise(hex(0xf76b15), 0.06),
  yellow: (p) => p.noise(hex(0xffd23f), 0.06),
  green: (p) => p.noise(hex(0x30a46c), 0.06),
  cyan: (p) => p.noise(hex(0x05a2c2), 0.06),
  blue: (p) => p.noise(hex(0x3e63dd), 0.06),
  purple: (p) => p.noise(hex(0x8e4ec6), 0.06),
  pink: (p) => p.noise(hex(0xd6409f), 0.06),
  white: (p) => p.noise(hex(0xf4f4f5), 0.03),
  black: (p) => p.noise(hex(0x1c1c1f), 0.2),
  gold: (p) => {
    p.noise(hex(0xffc53d), 0.08);
    for (let x = 1; x < 15; x++) p.px(x, 1, hex(0xfff1b8));
    for (let y = 1; y < 15; y++) p.px(1, y, hex(0xffe08a));
  },
  ice: (p) => {
    p.noise(hex(0x9fd8ff), 0.06);
    for (let i = 2; i < 14; i++) p.px(i, 15 - i, hex(0xe6f6ff));
    for (let i = 5; i < 11; i++) p.px(i, 16 - i, hex(0xe6f6ff));
  },
  magma: (p) => {
    p.noise(hex(0x7a1f0a), 0.2);
    for (let i = 0; i < 22; i++) p.px(Math.floor(p.r() * 16), Math.floor(p.r() * 16), hex(0xffb13d));
    for (let i = 0; i < 8; i++) p.px(Math.floor(p.r() * 16), Math.floor(p.r() * 16), hex(0xfff0a0));
  },
  quartz: (p) => {
    p.noise(hex(0xece6dc), 0.04);
    for (let x = 0; x < 16; x++) { p.px(x, 0, hex(0xd6cfc3)); p.px(x, 15, hex(0xd6cfc3)); }
  },
  quartz_side: (p) => {
    p.noise(hex(0xe6dfd2), 0.04);
    for (let y = 0; y < 16; y++) { p.px(0, y, hex(0xd0c8ba)); p.px(15, y, hex(0xd0c8ba)); p.px(7, y, hex(0xdcd4c7)); }
  },
  portal: (p) => {
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const w = Math.sin((x + y) * 0.8) * 0.5 + 0.5;
        p.px(x, y, shade(hex(0x9b5cff), 0.7 + w * 0.5));
      }
  },
  bedrock: (p) => p.noise(hex(0x333338), 0.4),
  lamp: (p) => {
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const frame = x < 2 || y < 2 || x > 13 || y > 13 || x === 7 || x === 8 || y === 7 || y === 8;
        p.px(x, y, frame ? hex(0x5a4430) : shade(hex(0xffd08a), 0.9 + p.r() * 0.2));
      }
  },
  tall_grass: (p) => {
    for (let i = 0; i < 9; i++) {
      const x0 = 1 + Math.floor(p.r() * 14);
      const h = 6 + Math.floor(p.r() * 9);
      const lean = (p.r() - 0.5) * 0.5;
      for (let y = 0; y < h; y++) p.px(Math.round(x0 + lean * y), 15 - y, shade(hex(0x6cbf4f), 0.75 + (y / h) * 0.45));
    }
  },
  flower_red: (p) => {
    for (let y = 6; y < 16; y++) p.px(7, y, hex(0x3f8a3a));
    p.px(6, 11, hex(0x4d9a41)); p.px(5, 10, hex(0x4d9a41)); p.px(8, 12, hex(0x4d9a41)); p.px(9, 11, hex(0x4d9a41));
    for (let y = 2; y < 7; y++) for (let x = 5; x < 10; x++) if (Math.hypot(x - 7, y - 4) < 2.6) p.px(x, y, shade(hex(0xe5484d), 0.85 + p.r() * 0.3));
    p.px(7, 4, hex(0x2a1a10));
  },
  flower_yellow: (p) => {
    for (let y = 7; y < 16; y++) p.px(8, y, hex(0x3f8a3a));
    p.px(9, 12, hex(0x4d9a41)); p.px(10, 11, hex(0x4d9a41)); p.px(7, 13, hex(0x4d9a41));
    for (let y = 3; y < 8; y++) for (let x = 6; x < 11; x++) if (Math.hypot(x - 8, y - 5) < 2.4) p.px(x, y, shade(hex(0xffd23f), 0.9 + p.r() * 0.2));
    p.px(8, 5, hex(0xf7a21b));
  },
  flower_blue: (p) => {
    for (let y = 6; y < 16; y++) p.px(7, y, hex(0x3f8a3a));
    p.px(6, 12, hex(0x4d9a41)); p.px(8, 10, hex(0x4d9a41));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      p.px(Math.round(7 + Math.cos(a) * 2.2), Math.round(4 + Math.sin(a) * 2.2), hex(0x4f7cff));
      p.px(Math.round(7 + Math.cos(a) * 1.2), Math.round(4 + Math.sin(a) * 1.2), hex(0x6f96ff));
    }
    p.px(7, 4, hex(0xffffff));
  },
  fern: (p) => {
    for (let f = 0; f < 3; f++) {
      const x0 = 3 + f * 5;
      for (let y = 2 + f; y < 16; y++) {
        const x = Math.round(x0 + Math.sin(y * 0.3) * 1.2);
        p.px(x, y, shade(hex(0x5aa845), 0.8 + p.r() * 0.3));
        if (y % 2 === 0) { p.px(x - 1, y, hex(0x4d9a41)); p.px(x + 1, y, hex(0x4d9a41)); }
      }
    }
  },
  dead_bush: (p) => {
    const branch = (x: number, y: number, dx: number, len: number) => {
      for (let i = 0; i < len; i++) p.px(Math.round(x + dx * i), y - i, shade(hex(0x8f6a3a), 0.85 + p.r() * 0.3));
    };
    branch(7, 15, 0, 7);
    branch(7, 11, -0.7, 6);
    branch(7, 10, 0.8, 7);
    branch(7, 13, 0.5, 4);
  },
  mushroom: (p) => {
    for (let y = 10; y < 16; y++) { p.px(7, y, hex(0xf0e8da)); p.px(8, y, hex(0xe6dccb)); }
    for (let y = 5; y < 10; y++) for (let x = 3; x < 13; x++) if (Math.hypot((x - 7.5) / 1.3, y - 9) < 4) p.px(x, y, hex(0xd9433b));
    p.px(5, 7, hex(0xffffff)); p.px(9, 6, hex(0xffffff)); p.px(10, 8, hex(0xffffff)); p.px(7, 8, hex(0xffffff));
  },
  birch_side: (p) => {
    p.noise(hex(0xe8e2d4), 0.06);
    for (let i = 0; i < 7; i++) {
      const y = Math.floor(p.r() * 15), x = Math.floor(p.r() * 12), len = 2 + Math.floor(p.r() * 4);
      for (let k = 0; k < len; k++) p.px(x + k, y, hex(0x2f2a26));
    }
  },
  birch_top: (p) => {
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
        p.px(x, y, d > 6.5 ? hex(0xe8e2d4) : shade(hex(0xd9c49a), Math.floor(d) % 3 === 0 ? 0.85 : 1));
      }
  },
  birch_leaves: (p) => {
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        if (p.r() < 0.16) continue;
        p.px(x, y, shade(hex(0x8fc25a), 0.72 + p.r() * 0.45));
      }
  },
  spruce_side: (p) => {
    for (let x = 0; x < 16; x++) {
      const k = x % 3 === 0 ? 0.7 : 0.95 + p.r() * 0.1;
      for (let y = 0; y < 16; y++) p.px(x, y, shade(hex(0x4a3322), k * (0.9 + p.r() * 0.15)));
    }
  },
  spruce_leaves: (p) => {
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        if (p.r() < 0.1) continue;
        p.px(x, y, shade(hex(0x2e5a3f), 0.7 + p.r() * 0.5));
      }
  },
  cherry_leaves: (p) => {
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const r = p.r();
        if (r < 0.12) continue;
        p.px(x, y, r > 0.9 ? hex(0xffffff) : r > 0.8 ? hex(0xff8fbf) : shade(hex(0xf5a3c7), 0.85 + p.r() * 0.25));
      }
  },
  cactus_side: (p) => {
    p.noise(hex(0x3f8f45), 0.12);
    for (let y = 0; y < 16; y++) { p.px(0, y, hex(0x2c6e33)); p.px(15, y, hex(0x2c6e33)); p.px(5, y, hex(0x357d3c)); p.px(10, y, hex(0x357d3c)); }
    for (let i = 0; i < 8; i++) p.px(Math.floor(p.r() * 16), Math.floor(p.r() * 16), hex(0xe8e0b0));
  },
  cactus_top: (p) => {
    p.noise(hex(0x4f9f55), 0.1);
    for (let i = 0; i < 16; i++) { p.px(i, 0, hex(0x2c6e33)); p.px(i, 15, hex(0x2c6e33)); p.px(0, i, hex(0x2c6e33)); p.px(15, i, hex(0x2c6e33)); }
  },
  basalt_side: (p) => {
    for (let x = 0; x < 16; x++) {
      const k = x % 4 === 0 ? 0.65 : 0.9 + p.r() * 0.15;
      for (let y = 0; y < 16; y++) p.px(x, y, shade(hex(0x3a3a42), k * (0.9 + p.r() * 0.2)));
    }
  },
  basalt_top: (p) => {
    p.noise(hex(0x45454e), 0.25);
    for (let i = 0; i < 16; i++) { p.px(i, (i * 7) % 16, hex(0x2c2c33)); p.px((i * 5) % 16, i, hex(0x2c2c33)); }
  },
  glow_shroom: (p) => {
    for (let y = 9; y < 16; y++) p.px(8, y, hex(0x9fe8ff));
    for (let y = 11; y < 16; y++) p.px(4, y, hex(0x9fe8ff));
    for (let y = 4; y < 9; y++) for (let x = 5; x < 12; x++) if (Math.hypot(x - 8, (y - 8) * 1.4) < 3.4) p.px(x, y, shade(hex(0x40e0ff), 0.9 + p.r() * 0.2));
    for (let y = 8; y < 11; y++) for (let x = 2; x < 7; x++) if (Math.hypot(x - 4, (y - 11) * 1.5) < 2.3) p.px(x, y, hex(0x7ff0ff));
  },
  gravel: (p) => {
    p.noise(hex(0x8d8680), 0.25);
    for (let i = 0; i < 14; i++) {
      const x = Math.floor(p.r() * 15), y = Math.floor(p.r() * 15);
      const c = p.r() > 0.5 ? hex(0x6b655f) : hex(0xaaa49e);
      p.px(x, y, c); p.px(x + 1, y, c); p.px(x, y + 1, c);
    }
  },
  sandstone_side: (p) => {
    p.noise(hex(0xd9c08a), 0.06);
    for (let x = 0; x < 16; x++) { p.px(x, 4, hex(0xc4a96f)); p.px(x, 11, hex(0xc4a96f)); p.px(x, 15, hex(0xb89c62)); }
  },
  sandstone_top: (p) => p.noise(hex(0xe0c994), 0.06),
};

/** Paint every tile into one canvas and wrap it as a pixel-art texture. */
export function createAtlas(): { texture: THREE.CanvasTexture; canvas: HTMLCanvasElement } {
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_COLS * TILE_PX;
  canvas.height = ATLAS_ROWS * TILE_PX;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(canvas.width, canvas.height);

  TILE_NAMES.forEach((name, i) => {
    const ox = (i % ATLAS_COLS) * TILE_PX;
    const oy = Math.floor(i / ATLAS_COLS) * TILE_PX;
    const r = rng(i * 7919 + 17);
    const painter: Painter = {
      r,
      px(x, y, c, a = 1) {
        if (x < 0 || y < 0 || x >= TILE_PX || y >= TILE_PX) return;
        const o = ((oy + y) * canvas.width + ox + x) * 4;
        img.data[o] = c[0];
        img.data[o + 1] = c[1];
        img.data[o + 2] = c[2];
        img.data[o + 3] = Math.round(a * 255);
      },
      noise(base, amount) {
        for (let y = 0; y < TILE_PX; y++)
          for (let x = 0; x < TILE_PX; x++) painter.px(x, y, shade(base, 1 - amount / 2 + r() * amount));
      },
    };
    PAINTERS[name](painter);
  });

  ctx.putImageData(img, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  return { texture, canvas };
}

/** UV rectangle [u0, v0, u1, v1] of a tile, inset by a fraction of a texel to avoid bleeding. */
export function tileUV(tile: number): [number, number, number, number] {
  const col = tile % ATLAS_COLS;
  const row = Math.floor(tile / ATLAS_COLS);
  const eps = 0.01 / TILE_PX;
  const u0 = col / ATLAS_COLS + eps;
  const u1 = (col + 1) / ATLAS_COLS - eps;
  const v1 = 1 - row / ATLAS_ROWS - eps;
  const v0 = 1 - (row + 1) / ATLAS_ROWS + eps;
  return [u0, v0, u1, v1];
}

/** Draw one block's side tile into a small canvas (hotbar / palette icons). */
export function tileIcon(atlas: HTMLCanvasElement, tile: number, size = 32): string {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  const sx = (tile % ATLAS_COLS) * TILE_PX;
  const sy = Math.floor(tile / ATLAS_COLS) * TILE_PX;
  ctx.drawImage(atlas, sx, sy, TILE_PX, TILE_PX, 0, 0, size, size);
  return c.toDataURL();
}
