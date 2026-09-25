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
  LAMP: 32,
  TALL_GRASS: 33,
  FLOWER_RED: 34,
  FLOWER_YELLOW: 35,
  FLOWER_BLUE: 36,
  FERN: 37,
  DEAD_BUSH: 38,
  MUSHROOM: 39,
  BIRCH_LOG: 40,
  BIRCH_LEAVES: 41,
  SPRUCE_LOG: 42,
  SPRUCE_LEAVES: 43,
  CHERRY_LEAVES: 44,
  CACTUS: 45,
  BASALT: 46,
  GLOW_SHROOM: 47,
  GRAVEL: 48,
  SANDSTONE: 49,
} as const;

export type BlockId = number;

/** Which mesh (and material) a block's faces go into. */
export type RenderPass = 'opaque' | 'cutout' | 'water' | 'translucent';

/** Wind response in the vertex shader: none, whole-block (leaves) or tip-only (plants). */
export type Sway = 0 | 1 | 2;

export interface BlockDef {
  id: BlockId;
  name: string;
  /** Tile indices in the texture atlas: [top, side, bottom]. */
  tiles: [number, number, number];
  pass: RenderPass;
  /** 'cube' blocks are full voxels; 'cross' blocks are two crossed quads (plants). */
  shape: 'cube' | 'cross';
  solid: boolean;
  /** Emitted block light per channel (0–15). */
  light?: [number, number, number];
  /** Emissive strength in the shader (0–9); feeds the bloom pass. */
  glow?: number;
  /** Extra sky-light attenuation when light passes through (leaves, water). */
  dim?: number;
  /** Colour tinted by biome (grass tops, leaves, plants). */
  tinted?: 'top' | 'all';
  sway?: Sway;
  /** Base colour used to paint the procedural texture and particles (hex). */
  color: number;
  /** Shown in the hotbar / builder palette. */
  placeable: boolean;
  /** Footstep / break sound family. */
  sound?: 'grass' | 'stone' | 'sand' | 'wood' | 'snow' | 'glass' | 'soft';
}

// Tile indices are assigned in textures.ts in the same order as TILE_NAMES.
export const TILE_NAMES = [
  'grass_top', 'grass_side', 'dirt', 'stone', 'sand', 'water', 'log_side', 'log_top',
  'leaves', 'snow', 'glass', 'brick', 'planks', 'crystal', 'beacon', 'obsidian',
  'path', 'red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple',
  'pink', 'white', 'black', 'gold', 'ice', 'magma', 'quartz', 'portal',
  'bedrock', 'snow_side', 'lamp', 'tall_grass', 'flower_red', 'flower_yellow', 'flower_blue', 'fern',
  'dead_bush', 'mushroom', 'birch_side', 'birch_top', 'birch_leaves', 'spruce_side', 'spruce_leaves', 'cherry_leaves',
  'cactus_side', 'cactus_top', 'basalt_side', 'basalt_top', 'glow_shroom', 'gravel', 'sandstone_side', 'sandstone_top',
  'path_side', 'quartz_side',
] as const;

export type TileName = (typeof TILE_NAMES)[number];
const T = (n: TileName) => TILE_NAMES.indexOf(n);
const same = (n: TileName): [number, number, number] => [T(n), T(n), T(n)];

type Def = Omit<BlockDef, 'shape' | 'pass'> & { shape?: BlockDef['shape']; pass?: RenderPass };

const defs: Def[] = [
  { id: B.AIR, name: 'air', tiles: same('dirt'), solid: false, color: 0, placeable: false },
  { id: B.GRASS, name: 'grass', tiles: [T('grass_top'), T('grass_side'), T('dirt')], solid: true, tinted: 'top', color: 0x6cbf4f, placeable: true, sound: 'grass' },
  { id: B.DIRT, name: 'dirt', tiles: same('dirt'), solid: true, color: 0x8a5a3b, placeable: true, sound: 'grass' },
  { id: B.STONE, name: 'stone', tiles: same('stone'), solid: true, color: 0x8b8f96, placeable: true, sound: 'stone' },
  { id: B.SAND, name: 'sand', tiles: same('sand'), solid: true, color: 0xe3cf8f, placeable: true, sound: 'sand' },
  { id: B.WATER, name: 'water', tiles: same('water'), pass: 'water', solid: false, dim: 1, color: 0x2f6fb8, placeable: true },
  { id: B.LOG, name: 'log', tiles: [T('log_top'), T('log_side'), T('log_top')], solid: true, color: 0x6b4a2b, placeable: true, sound: 'wood' },
  { id: B.LEAVES, name: 'leaves', tiles: same('leaves'), pass: 'cutout', solid: true, dim: 1, tinted: 'all', sway: 1, color: 0x3f8f3a, placeable: true, sound: 'grass' },
  { id: B.SNOW, name: 'snow', tiles: [T('snow'), T('snow_side'), T('dirt')], solid: true, color: 0xf2f6fb, placeable: true, sound: 'snow' },
  { id: B.GLASS, name: 'glass', tiles: same('glass'), pass: 'translucent', solid: true, color: 0xcfeefe, placeable: true, sound: 'glass' },
  { id: B.BRICK, name: 'brick', tiles: same('brick'), solid: true, color: 0xa4493d, placeable: true, sound: 'stone' },
  { id: B.PLANKS, name: 'planks', tiles: same('planks'), solid: true, color: 0xb78a52, placeable: true, sound: 'wood' },
  { id: B.CRYSTAL, name: 'crystal', tiles: same('crystal'), solid: true, light: [11, 5, 15], glow: 5, color: 0xb57cff, placeable: true, sound: 'glass' },
  { id: B.BEACON, name: 'beacon', tiles: same('beacon'), solid: true, light: [5, 14, 15], glow: 8, color: 0x7ef9ff, placeable: true, sound: 'glass' },
  { id: B.OBSIDIAN, name: 'obsidian', tiles: same('obsidian'), solid: true, color: 0x241a38, placeable: true, sound: 'stone' },
  { id: B.PATH, name: 'path', tiles: [T('path'), T('path_side'), T('dirt')], solid: true, color: 0xc2a36b, placeable: true, sound: 'sand' },
  { id: B.RED, name: 'red', tiles: same('red'), solid: true, color: 0xe5484d, placeable: true, sound: 'soft' },
  { id: B.ORANGE, name: 'orange', tiles: same('orange'), solid: true, color: 0xf76b15, placeable: true, sound: 'soft' },
  { id: B.YELLOW, name: 'yellow', tiles: same('yellow'), solid: true, color: 0xffd23f, placeable: true, sound: 'soft' },
  { id: B.GREEN, name: 'green', tiles: same('green'), solid: true, color: 0x30a46c, placeable: true, sound: 'soft' },
  { id: B.CYAN, name: 'cyan', tiles: same('cyan'), solid: true, color: 0x05a2c2, placeable: true, sound: 'soft' },
  { id: B.BLUE, name: 'blue', tiles: same('blue'), solid: true, color: 0x3e63dd, placeable: true, sound: 'soft' },
  { id: B.PURPLE, name: 'purple', tiles: same('purple'), solid: true, color: 0x8e4ec6, placeable: true, sound: 'soft' },
  { id: B.PINK, name: 'pink', tiles: same('pink'), solid: true, color: 0xd6409f, placeable: true, sound: 'soft' },
  { id: B.WHITE, name: 'white', tiles: same('white'), solid: true, color: 0xf4f4f5, placeable: true, sound: 'soft' },
  { id: B.BLACK, name: 'black', tiles: same('black'), solid: true, color: 0x1c1c1f, placeable: true, sound: 'soft' },
  { id: B.GOLD, name: 'gold', tiles: same('gold'), solid: true, light: [12, 9, 3], glow: 2, color: 0xffc53d, placeable: true, sound: 'stone' },
  { id: B.ICE, name: 'ice', tiles: same('ice'), pass: 'translucent', solid: true, dim: 1, color: 0x9fd8ff, placeable: true, sound: 'glass' },
  { id: B.MAGMA, name: 'magma', tiles: same('magma'), solid: true, light: [15, 6, 1], glow: 6, color: 0xff5a1f, placeable: true, sound: 'stone' },
  { id: B.QUARTZ, name: 'quartz', tiles: [T('quartz'), T('quartz_side'), T('quartz')], solid: true, color: 0xece6dc, placeable: true, sound: 'stone' },
  { id: B.PORTAL, name: 'portal', tiles: same('portal'), solid: true, light: [10, 4, 15], glow: 7, color: 0x9b5cff, placeable: false, sound: 'glass' },
  { id: B.BEDROCK, name: 'bedrock', tiles: same('bedrock'), solid: true, color: 0x333338, placeable: false, sound: 'stone' },
  { id: B.LAMP, name: 'lamp', tiles: same('lamp'), solid: true, light: [15, 12, 7], glow: 7, color: 0xffd08a, placeable: true, sound: 'glass' },
  { id: B.TALL_GRASS, name: 'tall grass', tiles: same('tall_grass'), shape: 'cross', pass: 'cutout', solid: false, tinted: 'all', sway: 2, color: 0x5daa45, placeable: true, sound: 'grass' },
  { id: B.FLOWER_RED, name: 'poppy', tiles: same('flower_red'), shape: 'cross', pass: 'cutout', solid: false, sway: 2, color: 0xe5484d, placeable: true, sound: 'grass' },
  { id: B.FLOWER_YELLOW, name: 'dandelion', tiles: same('flower_yellow'), shape: 'cross', pass: 'cutout', solid: false, sway: 2, color: 0xffd23f, placeable: true, sound: 'grass' },
  { id: B.FLOWER_BLUE, name: 'cornflower', tiles: same('flower_blue'), shape: 'cross', pass: 'cutout', solid: false, sway: 2, color: 0x4f7cff, placeable: true, sound: 'grass' },
  { id: B.FERN, name: 'fern', tiles: same('fern'), shape: 'cross', pass: 'cutout', solid: false, tinted: 'all', sway: 2, color: 0x3f8a3a, placeable: true, sound: 'grass' },
  { id: B.DEAD_BUSH, name: 'dead bush', tiles: same('dead_bush'), shape: 'cross', pass: 'cutout', solid: false, sway: 2, color: 0x8f6a3a, placeable: true, sound: 'wood' },
  { id: B.MUSHROOM, name: 'mushroom', tiles: same('mushroom'), shape: 'cross', pass: 'cutout', solid: false, color: 0xd9433b, placeable: true, sound: 'soft' },
  { id: B.BIRCH_LOG, name: 'birch log', tiles: [T('birch_top'), T('birch_side'), T('birch_top')], solid: true, color: 0xe8e2d4, placeable: true, sound: 'wood' },
  { id: B.BIRCH_LEAVES, name: 'birch leaves', tiles: same('birch_leaves'), pass: 'cutout', solid: true, dim: 1, tinted: 'all', sway: 1, color: 0x7fb34f, placeable: true, sound: 'grass' },
  { id: B.SPRUCE_LOG, name: 'spruce log', tiles: [T('log_top'), T('spruce_side'), T('log_top')], solid: true, color: 0x4a3322, placeable: true, sound: 'wood' },
  { id: B.SPRUCE_LEAVES, name: 'spruce leaves', tiles: same('spruce_leaves'), pass: 'cutout', solid: true, dim: 1, sway: 1, color: 0x2e5a3f, placeable: true, sound: 'grass' },
  { id: B.CHERRY_LEAVES, name: 'cherry blossom', tiles: same('cherry_leaves'), pass: 'cutout', solid: true, dim: 1, sway: 1, color: 0xf5a3c7, placeable: true, sound: 'grass' },
  { id: B.CACTUS, name: 'cactus', tiles: [T('cactus_top'), T('cactus_side'), T('cactus_top')], solid: true, color: 0x3f8f45, placeable: true, sound: 'soft' },
  { id: B.BASALT, name: 'basalt', tiles: [T('basalt_top'), T('basalt_side'), T('basalt_top')], solid: true, color: 0x3a3a42, placeable: true, sound: 'stone' },
  { id: B.GLOW_SHROOM, name: 'glow shroom', tiles: same('glow_shroom'), shape: 'cross', pass: 'cutout', solid: false, light: [3, 11, 14], glow: 6, color: 0x40e0ff, placeable: true, sound: 'soft' },
  { id: B.GRAVEL, name: 'gravel', tiles: same('gravel'), solid: true, color: 0x8d8680, placeable: true, sound: 'sand' },
  { id: B.SANDSTONE, name: 'sandstone', tiles: [T('sandstone_top'), T('sandstone_side'), T('sandstone_top')], solid: true, color: 0xd9c08a, placeable: true, sound: 'stone' },
];

export const BLOCKS: BlockDef[] = [];
for (const d of defs) BLOCKS[d.id] = { shape: 'cube', pass: 'opaque', ...d } as BlockDef;

export const BLOCK_BY_NAME = new Map<string, BlockDef>();
for (const d of BLOCKS) {
  if (!d) continue;
  BLOCK_BY_NAME.set(d.name, d);
  BLOCK_BY_NAME.set(d.name.replace(/\s+/g, '_'), d);
}

export function blockDef(id: BlockId): BlockDef {
  return BLOCKS[id] ?? BLOCKS[B.STONE];
}

// Fast lookup tables used by the mesher and light engine (hot loops).
export const OPAQUE = new Uint8Array(256);
export const SOLID = new Uint8Array(256);
export const EMIT = new Uint16Array(256); // packed r<<8 | g<<4 | b
export const DIM = new Uint8Array(256);
for (const d of BLOCKS) {
  if (!d) continue;
  OPAQUE[d.id] = d.id !== B.AIR && d.pass === 'opaque' && d.shape === 'cube' ? 1 : 0;
  SOLID[d.id] = d.id !== B.AIR && d.solid ? 1 : 0;
  if (d.light) EMIT[d.id] = (d.light[0] << 8) | (d.light[1] << 4) | d.light[2];
  DIM[d.id] = d.dim ?? 0;
}

export function isOpaque(id: BlockId): boolean {
  return OPAQUE[id] === 1;
}

export function isSolid(id: BlockId): boolean {
  return SOLID[id] === 1;
}

/** Resolve a user-supplied block name (from code or blocks) to an id; unknown names become stone. */
export function blockIdFromName(name: unknown): BlockId {
  if (typeof name === 'number' && BLOCKS[name]) return name;
  if (typeof name !== 'string') return B.STONE;
  const key = name.trim().toLowerCase();
  if (key === 'air' || key === 'empty' || key === 'none') return B.AIR;
  return BLOCK_BY_NAME.get(key)?.id ?? BLOCK_BY_NAME.get(key.replace(/\s+/g, '_'))?.id ?? B.STONE;
}

export const PLACEABLE_NAMES = BLOCKS.filter((d) => d?.placeable).map((d) => d.name.replace(/\s+/g, '_'));

/** A 10-step colour ramp used by visualisations (low → high). */
export const HEAT_RAMP: BlockId[] = [
  B.BLUE, B.CYAN, B.GREEN, B.YELLOW, B.ORANGE, B.RED, B.MAGMA, B.PINK, B.PURPLE, B.WHITE,
];

/** Distinct colours for categorical data (cluster ids, class labels). */
export const CATEGORY_BLOCKS: BlockId[] = [
  B.BLUE, B.ORANGE, B.GREEN, B.PINK, B.YELLOW, B.CYAN, B.PURPLE, B.RED,
];
