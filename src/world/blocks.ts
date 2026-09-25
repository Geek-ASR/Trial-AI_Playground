/**
 * Block registry. Ids are stored as bytes in the world array, so keep them < 256
 * and never renumber an existing id (saved worlds reference them).
 */
export const B = {
  AIR: 0,
  GRASS: 1,
  DIRT: 2,
  STONE: 3,
  SAND: 4,
  WATER: 5,
  LOG: 6,
  LEAVES: 7,
  SNOW: 8,
  GLASS: 9,
  BRICK: 10,
  PLANKS: 11,
  CRYSTAL: 12,
  BEACON: 13,
  OBSIDIAN: 14,
  PATH: 15,
  RED: 16,
  ORANGE: 17,
  YELLOW: 18,
  GREEN: 19,
  CYAN: 20,
  BLUE: 21,
  PURPLE: 22,
  PINK: 23,
  WHITE: 24,
  BLACK: 25,
  GOLD: 26,
  ICE: 27,
  MAGMA: 28,
  QUARTZ: 29,
  PORTAL: 30,
  BEDROCK: 31,
} as const;

export type BlockId = number;

export type RenderPass = 'opaque' | 'cutout' | 'translucent';

export interface BlockDef {
  id: BlockId;
  name: string;
  /** Tile indices in the texture atlas: [top, side, bottom]. */
  tiles: [number, number, number];
  pass: RenderPass;
  solid: boolean;
  /** Emissive blocks ignore face shading and ambient occlusion. */
  glow?: boolean;
  /** Base colour used to paint the procedural texture (hex). */
  color: number;
  /** Shown in the hotbar / builder palette. */
  placeable: boolean;
}

// Tile indices are assigned in textures.ts in the same order as TILE_NAMES.
export const TILE_NAMES = [
  'grass_top', 'grass_side', 'dirt', 'stone', 'sand', 'water', 'log_side', 'log_top',
  'leaves', 'snow', 'glass', 'brick', 'planks', 'crystal', 'beacon', 'obsidian',
  'path', 'red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple',
  'pink', 'white', 'black', 'gold', 'ice', 'magma', 'quartz', 'portal',
  'bedrock', 'snow_side',
] as const;

export type TileName = (typeof TILE_NAMES)[number];
const T = (n: TileName) => TILE_NAMES.indexOf(n);
const same = (n: TileName): [number, number, number] => [T(n), T(n), T(n)];

const defs: BlockDef[] = [
  { id: B.AIR, name: 'air', tiles: same('dirt'), pass: 'opaque', solid: false, color: 0, placeable: false },
  { id: B.GRASS, name: 'grass', tiles: [T('grass_top'), T('grass_side'), T('dirt')], pass: 'opaque', solid: true, color: 0x5fb04a, placeable: true },
  { id: B.DIRT, name: 'dirt', tiles: same('dirt'), pass: 'opaque', solid: true, color: 0x8a5a3b, placeable: true },
  { id: B.STONE, name: 'stone', tiles: same('stone'), pass: 'opaque', solid: true, color: 0x8b8f96, placeable: true },
  { id: B.SAND, name: 'sand', tiles: same('sand'), pass: 'opaque', solid: true, color: 0xe3cf8f, placeable: true },
  { id: B.WATER, name: 'water', tiles: same('water'), pass: 'translucent', solid: false, color: 0x3a7bd5, placeable: true },
  { id: B.LOG, name: 'log', tiles: [T('log_top'), T('log_side'), T('log_top')], pass: 'opaque', solid: true, color: 0x6b4a2b, placeable: true },
  { id: B.LEAVES, name: 'leaves', tiles: same('leaves'), pass: 'cutout', solid: true, color: 0x3f8f3a, placeable: true },
  { id: B.SNOW, name: 'snow', tiles: [T('snow'), T('snow_side'), T('dirt')], pass: 'opaque', solid: true, color: 0xf2f6fb, placeable: true },
  { id: B.GLASS, name: 'glass', tiles: same('glass'), pass: 'cutout', solid: true, color: 0xcfeefe, placeable: true },
  { id: B.BRICK, name: 'brick', tiles: same('brick'), pass: 'opaque', solid: true, color: 0xa4493d, placeable: true },
  { id: B.PLANKS, name: 'planks', tiles: same('planks'), pass: 'opaque', solid: true, color: 0xb78a52, placeable: true },
  { id: B.CRYSTAL, name: 'crystal', tiles: same('crystal'), pass: 'opaque', solid: true, glow: true, color: 0xb57cff, placeable: true },
  { id: B.BEACON, name: 'beacon', tiles: same('beacon'), pass: 'opaque', solid: true, glow: true, color: 0x7ef9ff, placeable: true },
  { id: B.OBSIDIAN, name: 'obsidian', tiles: same('obsidian'), pass: 'opaque', solid: true, color: 0x241a38, placeable: true },
  { id: B.PATH, name: 'path', tiles: same('path'), pass: 'opaque', solid: true, color: 0xc2a36b, placeable: true },
  { id: B.RED, name: 'red', tiles: same('red'), pass: 'opaque', solid: true, color: 0xe5484d, placeable: true },
  { id: B.ORANGE, name: 'orange', tiles: same('orange'), pass: 'opaque', solid: true, color: 0xf76b15, placeable: true },
  { id: B.YELLOW, name: 'yellow', tiles: same('yellow'), pass: 'opaque', solid: true, color: 0xffd23f, placeable: true },
  { id: B.GREEN, name: 'green', tiles: same('green'), pass: 'opaque', solid: true, color: 0x30a46c, placeable: true },
  { id: B.CYAN, name: 'cyan', tiles: same('cyan'), pass: 'opaque', solid: true, color: 0x05a2c2, placeable: true },
  { id: B.BLUE, name: 'blue', tiles: same('blue'), pass: 'opaque', solid: true, color: 0x3e63dd, placeable: true },
  { id: B.PURPLE, name: 'purple', tiles: same('purple'), pass: 'opaque', solid: true, color: 0x8e4ec6, placeable: true },
  { id: B.PINK, name: 'pink', tiles: same('pink'), pass: 'opaque', solid: true, color: 0xd6409f, placeable: true },
  { id: B.WHITE, name: 'white', tiles: same('white'), pass: 'opaque', solid: true, color: 0xf4f4f5, placeable: true },
  { id: B.BLACK, name: 'black', tiles: same('black'), pass: 'opaque', solid: true, color: 0x1c1c1f, placeable: true },
  { id: B.GOLD, name: 'gold', tiles: same('gold'), pass: 'opaque', solid: true, glow: true, color: 0xffc53d, placeable: true },
  { id: B.ICE, name: 'ice', tiles: same('ice'), pass: 'translucent', solid: true, color: 0x9fd8ff, placeable: true },
  { id: B.MAGMA, name: 'magma', tiles: same('magma'), pass: 'opaque', solid: true, glow: true, color: 0xff5a1f, placeable: true },
  { id: B.QUARTZ, name: 'quartz', tiles: same('quartz'), pass: 'opaque', solid: true, color: 0xece6dc, placeable: true },
  { id: B.PORTAL, name: 'portal', tiles: same('portal'), pass: 'opaque', solid: true, glow: true, color: 0x9b5cff, placeable: false },
  { id: B.BEDROCK, name: 'bedrock', tiles: same('bedrock'), pass: 'opaque', solid: true, color: 0x333338, placeable: false },
];

export const BLOCKS: BlockDef[] = [];
for (const d of defs) BLOCKS[d.id] = d;

export const BLOCK_BY_NAME = new Map<string, BlockDef>(defs.map((d) => [d.name, d]));

export function blockDef(id: BlockId): BlockDef {
  return BLOCKS[id] ?? BLOCKS[B.STONE];
}

export function isOpaque(id: BlockId): boolean {
  if (id === B.AIR) return false;
  return blockDef(id).pass === 'opaque';
}

export function isSolid(id: BlockId): boolean {
  return id !== B.AIR && blockDef(id).solid;
}

/** Resolve a user-supplied block name (from code or blocks) to an id; unknown names become stone. */
export function blockIdFromName(name: unknown): BlockId {
  if (typeof name === 'number' && BLOCKS[name]) return name;
  if (typeof name !== 'string') return B.STONE;
  const key = name.trim().toLowerCase();
  if (key === 'air' || key === 'empty' || key === 'none') return B.AIR;
  return BLOCK_BY_NAME.get(key)?.id ?? B.STONE;
}

export const PLACEABLE_NAMES = defs.filter((d) => d.placeable).map((d) => d.name);

/** A 10-step colour ramp used by visualisations (low → high). */
export const HEAT_RAMP: BlockId[] = [
  B.BLUE, B.CYAN, B.GREEN, B.YELLOW, B.ORANGE, B.RED, B.MAGMA, B.PINK, B.PURPLE, B.WHITE,
];

/** Distinct colours for categorical data (cluster ids, class labels). */
export const CATEGORY_BLOCKS: BlockId[] = [
  B.BLUE, B.ORANGE, B.GREEN, B.PINK, B.YELLOW, B.CYAN, B.PURPLE, B.RED,
];
