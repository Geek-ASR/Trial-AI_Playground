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
  grass_top: (p) => p.noise(hex(0x5fb04a), 0.18),
  grass_side: (p) => {
    p.noise(hex(0x8a5a3b), 0.2);
    for (let x = 0; x < 16; x++) {
      const h = 3 + Math.floor(p.r() * 3);
      for (let y = 0; y < h; y++) p.px(x, y, shade(hex(0x5fb04a), 0.85 + p.r() * 0.3));
    }
  },
  dirt: (p) => p.noise(hex(0x8a5a3b), 0.22),
  stone: (p) => {
    p.noise(hex(0x8b8f96), 0.14);
    for (let i = 0; i < 6; i++) {
      const x = Math.floor(p.r() * 14), y = Math.floor(p.r() * 14);
      p.px(x, y, hex(0x6d7178));
      p.px(x + 1, y, hex(0x6d7178));
    }
  },
  sand: (p) => p.noise(hex(0xe3cf8f), 0.08),
  water: (p) => {
    p.noise(hex(0x3a7bd5), 0.1);
    for (let y = 2; y < 16; y += 5) for (let x = 0; x < 16; x++) if ((x + y) % 7 < 3) p.px(x, y, hex(0x6aa5ef));
  },
  log_side: (p) => {
    for (let x = 0; x < 16; x++) {
      const k = x % 4 === 0 ? 0.75 : 0.95 + p.r() * 0.1;
      for (let y = 0; y < 16; y++) p.px(x, y, shade(hex(0x6b4a2b), k * (0.95 + p.r() * 0.1)));
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
        if (p.r() < 0.12) continue; // holes for the cut-out look
        p.px(x, y, shade(hex(0x3f8f3a), 0.75 + p.r() * 0.45));
      }
  },
  snow: (p) => p.noise(hex(0xf2f6fb), 0.04),
  snow_side: (p) => {
    p.noise(hex(0x8a5a3b), 0.2);
    for (let x = 0; x < 16; x++) {
      const h = 4 + Math.floor(p.r() * 3);
      for (let y = 0; y < h; y++) p.px(x, y, shade(hex(0xf2f6fb), 0.95 + p.r() * 0.05));
    }
  },
  glass: (p) => {
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const edge = x === 0 || y === 0 || x === 15 || y === 15;
        const glint = (x === 3 && y > 2 && y < 7) || (y === 3 && x > 2 && x < 7);
        if (edge) p.px(x, y, hex(0xcfeefe));
        else if (glint) p.px(x, y, hex(0xffffff), 0.9);
      }
  },
  brick: (p) => {
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const mortar = y % 4 === 3 || (x + (Math.floor(y / 4) % 2) * 4) % 8 === 7;
        p.px(x, y, mortar ? hex(0xc9bfb4) : shade(hex(0xa4493d), 0.85 + p.r() * 0.25));
      }
  },
  planks: (p) => {
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const seam = y % 4 === 3 || (y % 8 < 4 ? x === 5 : x === 12);
        p.px(x, y, seam ? hex(0x7d5a33) : shade(hex(0xb78a52), 0.9 + p.r() * 0.15));
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
  path: (p) => p.noise(hex(0xc2a36b), 0.14),
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
  },
  ice: (p) => {
    p.noise(hex(0x9fd8ff), 0.06);
    for (let i = 2; i < 14; i++) p.px(i, 15 - i, hex(0xe6f6ff));
  },
  magma: (p) => {
    p.noise(hex(0x7a1f0a), 0.2);
    for (let i = 0; i < 20; i++) p.px(Math.floor(p.r() * 16), Math.floor(p.r() * 16), hex(0xffb13d));
  },
  quartz: (p) => {
    p.noise(hex(0xece6dc), 0.04);
    for (let x = 0; x < 16; x++) { p.px(x, 0, hex(0xd6cfc3)); p.px(x, 15, hex(0xd6cfc3)); }
  },
  portal: (p) => {
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const w = Math.sin((x + y) * 0.8) * 0.5 + 0.5;
        p.px(x, y, shade(hex(0x9b5cff), 0.7 + w * 0.5));
      }
  },
  bedrock: (p) => p.noise(hex(0x333338), 0.4),
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
