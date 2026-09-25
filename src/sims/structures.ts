import { LANDSCAPE_BY_ID, type Landscape } from '../ai/optimizers';
import { REALM_BY_ID } from '../curriculum';
import { B, type BlockId } from '../world/blocks';
import { GROUND, LAB_BY_KIND, LAB_RADIUS, LAB_SITES, MAZE_DECK, type LabSite } from '../world/layout';
import type { World } from '../world/world';
import { CATHEDRAL, FLOCK_CONSOLE, GALAXY, labFrame, MAZE_CELL, MAZE_MAP, MAZE_N, mazeCellOrigin, VALLEY } from './geometry';

/** Static voxel parts of every simulation lab, built once during world generation. */
export function buildLabStructures(world: World) {
  for (const lab of LAB_SITES) buildPlaza(world, lab);
  buildValley(world, LANDSCAPE_BY_ID.get('himmelblau')!, true);
  buildGaltonBase(world);
  buildObservatory(world);
  buildCathedral(world);
  buildGalaxyTower(world);
  buildMaze(world);
  // Consoles go last so no structure can overwrite them.
  for (const lab of LAB_SITES) buildConsole(world, lab.console.x, lab.console.z, lab.floorY);
  buildConsole(world, FLOCK_CONSOLE.x, FLOCK_CONSOLE.z);
}

function buildPlaza(world: World, lab: LabSite) {
  const realm = REALM_BY_ID.get(lab.realm)!;
  world.disc(lab.x, lab.z, LAB_RADIUS, GROUND, (x, z, d) => {
    if (d > LAB_RADIUS - 1.2) return realm.accent;
    if (realm.floor === B.GRASS) return (x * 7 + z * 3) % 5 === 0 ? B.PATH : B.GRASS;
    return realm.floor;
  }, 50);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.2;
    const rel = Math.atan2(Math.sin(a - lab.angle - Math.PI), Math.cos(a - lab.angle - Math.PI));
    if (Math.abs(rel) < 0.4) continue; // keep the road entrance clear
    const lx = Math.round(lab.x + Math.cos(a) * (LAB_RADIUS - 2)), lz = Math.round(lab.z + Math.sin(a) * (LAB_RADIUS - 2));
    if (lab.kind === 'valley' && Math.abs(lx - lab.x) <= VALLEY.half + 2 && Math.abs(lz - lab.z) <= VALLEY.half + 2) continue;
    world.lampPost(lx, GROUND + 1, lz, 3);
  }
}

export function buildConsole(world: World, x: number, z: number, y = GROUND + 1) {
  world.setRaw(x, y, z, B.QUARTZ);
  world.setRaw(x, y + 1, z, B.CRYSTAL);
  world.protect(x, y, z);
  world.protect(x, y + 1, z);
}

// ---------------------------------------------------------------- gradient valley

const BANDS: BlockId[] = [B.BLUE, B.BLUE, B.CYAN, B.CYAN, B.GREEN, B.GREEN, B.GREEN, B.YELLOW, B.YELLOW, B.ORANGE, B.ORANGE, B.ORANGE, B.RED, B.RED, B.RED];

/** Map between valley columns (i, j ∈ [−half, half]) and landscape coordinates. */
export function valleyToDomain(land: Landscape, i: number, j: number): [number, number] {
  const [x0, x1, y0, y1] = land.domain;
  const n = VALLEY.half * 2;
  return [x0 + ((i + VALLEY.half) / n) * (x1 - x0), y0 + ((j + VALLEY.half) / n) * (y1 - y0)];
}

export function domainToValley(land: Landscape, x: number, y: number): [number, number] {
  const [x0, x1, y0, y1] = land.domain;
  const n = VALLEY.half * 2;
  return [((x - x0) / (x1 - x0)) * n - VALLEY.half, ((y - y0) / (y1 - y0)) * n - VALLEY.half];
}

/** Column height (1…maxH+1) above the valley floor for a landscape value. */
export function valleyHeight(land: Landscape, f: number): number {
  return 1 + Math.round(land.display(f) * VALLEY.maxH);
}

/** Build (or rebuild) the valley terrain. At generation time `raw` writes directly; later it goes through world.set. */
export function buildValley(world: World, land: Landscape, raw = false) {
  const lab = LAB_BY_KIND.get('valley')!;
  const put = (x: number, y: number, z: number, b: BlockId) => (raw ? world.setRaw(x, y, z, b) : world.set(x, y, z, b, false));
  const base = VALLEY.floor;
  for (let i = -VALLEY.half - 1; i <= VALLEY.half + 1; i++) {
    for (let j = -VALLEY.half - 1; j <= VALLEY.half + 1; j++) {
      const x = lab.x + i, z = lab.z + j;
      const rim = Math.abs(i) > VALLEY.half || Math.abs(j) > VALLEY.half;
      if (rim) {
        // A stone retaining wall with a quartz kerb and a low glass parapet you can see through.
        if (raw) {
          for (let y = base; y <= GROUND; y++) world.setRaw(x, y, z, y === GROUND ? B.QUARTZ : B.STONE);
          world.setRaw(x, GROUND + 1, z, B.GLASS);
          for (let y = GROUND; y <= GROUND + 1; y++) world.protect(x, y, z);
        }
        continue;
      }
      const [dx, dy] = valleyToDomain(land, i, j);
      const h = valleyHeight(land, land.f(dx, dy));
      if (raw) world.setRaw(x, base, z, B.STONE);
      for (let v = 1; base + v <= GROUND + 6; v++) {
        put(x, base + v, z, v <= h ? BANDS[Math.min(BANDS.length - 1, v - 1)] : B.AIR);
        if (raw && v <= VALLEY.maxH + 2) world.protect(x, base + v, z);
      }
    }
  }
}

// ---------------------------------------------------------------- galton board

function buildGaltonBase(world: World) {
  const fr = labFrame('galton');
  for (let u = -19; u <= 19; u++)
    for (let w = -2; w <= 3; w++) {
      const p = fr.world(u, 1, w);
      world.setRaw(p.x, p.y, p.z, w === 3 || Math.abs(u) === 19 ? B.GOLD : B.QUARTZ);
      world.protect(p.x, p.y, p.z);
    }
}

// ---------------------------------------------------------------- k-means observatory

function buildObservatory(world: World) {
  const lab = LAB_BY_KIND.get('kmeans')!;
  for (let x = lab.x - 5; x <= lab.x + 5; x++)
    for (let z = lab.z - 5; z <= lab.z + 5; z++) {
      const d = Math.hypot(x - lab.x, z - lab.z);
      if (d <= 4.6) world.setRaw(x, GROUND, z, d < 1 ? B.CRYSTAL : d > 3.6 ? B.QUARTZ : B.OBSIDIAN);
    }
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const x = Math.round(lab.x + Math.cos(a) * 13), z = Math.round(lab.z + Math.sin(a) * 13);
    for (let v = 1; v <= 4; v++) world.setRaw(x, GROUND + v, z, v === 4 ? B.CRYSTAL : B.QUARTZ);
    world.protect(x, GROUND + 4, z);
  }
  // A ring of birches around the dome of data.
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.35;
    const x = Math.round(lab.x + Math.cos(a) * 19.5), z = Math.round(lab.z + Math.sin(a) * 19.5);
    const rel = Math.atan2(Math.sin(a - lab.angle - Math.PI), Math.cos(a - lab.angle - Math.PI));
    if (Math.abs(rel) < 0.5) continue;
    world.birch(x, GROUND + 1, z);
  }
}

// ---------------------------------------------------------------- neural cathedral

function buildCathedral(world: World) {
  const fr = labFrame('cathedral');
  const { halfWidth: hw, depth, height } = CATHEDRAL;
  const put = (u: number, v: number, w: number, b: BlockId) => {
    const p = fr.world(u, v, w);
    world.setRaw(p.x, p.y, p.z, b);
    world.protect(p.x, p.y, p.z);
  };
  for (let u = -hw; u <= hw; u++)
    for (let w = 0; w <= depth; w++) {
      put(u, 0, w, (u + w) % 2 === 0 ? B.QUARTZ : B.OBSIDIAN);
      for (let v = 1; v < height; v++) {
        const p = fr.world(u, v, w);
        world.setRaw(p.x, p.y, p.z, B.AIR);
      }
    }
  for (let w = 0; w <= depth; w++) {
    for (const u of [-hw, hw]) {
      const pillar = w % 4 === 0;
      for (let v = 1; v < height; v++) put(u, v, w, pillar || v === 1 || v === height - 1 ? B.QUARTZ : B.GLASS);
      if (pillar) put(u, height - 2, w, B.CRYSTAL);
    }
  }
  // Back wall with a rose window.
  for (let u = -hw; u <= hw; u++)
    for (let v = 1; v < height; v++) {
      const d = Math.hypot(u, v - 14);
      put(u, v, depth, d < 5.5 ? (Math.abs(d - 3) < 0.6 || u === 0 || v === 14 ? B.CRYSTAL : B.GLASS) : B.QUARTZ);
    }
  // Glass roof on quartz beams.
  for (let u = -hw; u <= hw; u++)
    for (let w = 0; w <= depth; w++) put(u, height, w, w % 4 === 0 || Math.abs(u) === hw ? B.QUARTZ : B.GLASS);
  // Front arch lintel.
  for (let u = -hw; u <= hw; u++)
    for (let v = height - 4; v < height; v++) put(u, v, 0, Math.abs(u) === 9 - (v - (height - 4)) * 2 ? B.CRYSTAL : B.QUARTZ);
  // Low plinth the drawing canvas stands on, and wall lamps.
  for (let u = -5; u <= 4; u++) put(u, 1, CATHEDRAL.canvasW, B.QUARTZ);
  for (const w of [2, 10, 18, 26]) {
    put(-hw + 1, 11, w, B.LAMP);
    put(hw - 1, 11, w, B.LAMP);
  }
}

// ---------------------------------------------------------------- embedding galaxy tower

export function galaxyStairs(): { x: number; z: number; v: number }[] {
  const lab = LAB_BY_KIND.get('galaxy')!;
  const steps: { x: number; z: number; v: number }[] = [];
  const a0 = lab.angle + Math.PI + 0.9;
  for (let k = 0; k < GALAXY.platformV; k++) {
    const a = a0 + (k * 1.0) / 5.5;
    for (const r of [5, 6]) steps.push({ x: Math.round(lab.x + Math.cos(a) * r), z: Math.round(lab.z + Math.sin(a) * r), v: k + 1 });
  }
  return steps;
}

function buildGalaxyTower(world: World) {
  const lab = LAB_BY_KIND.get('galaxy')!;
  const top = GALAXY.platformV;
  for (let x = lab.x - 5; x <= lab.x + 5; x++)
    for (let z = lab.z - 5; z <= lab.z + 5; z++) {
      const d = Math.hypot(x - lab.x, z - lab.z);
      if (d > 4.5) continue;
      for (let v = 1; v <= top; v++) {
        const window = d > 3.6 && v % 5 === 3 && (x + z) % 3 === 0;
        world.setRaw(x, GROUND + v, z, d < 1 ? B.CRYSTAL : window ? B.GLASS : v === top ? B.QUARTZ : d > 3.6 ? B.QUARTZ : B.AIR);
        world.protect(x, GROUND + v, z);
      }
      if (d > 3.8) {
        world.setRaw(x, GROUND + top + 1, z, B.GLASS);
        world.protect(x, GROUND + top + 1, z);
      }
    }
  world.setRaw(lab.x, GROUND + top, lab.z, B.BEACON);
  for (const s of galaxyStairs()) {
    for (let v = 1; v <= s.v; v++) {
      world.setRaw(s.x, GROUND + v, s.z, v === s.v ? B.QUARTZ : B.SANDSTONE);
      world.protect(s.x, GROUND + v, s.z);
    }
    for (let v = s.v + 1; v <= s.v + 3; v++) if (world.get(s.x, GROUND + v, s.z) === B.GLASS) world.setRaw(s.x, GROUND + v, s.z, B.AIR);
  }
}

// ---------------------------------------------------------------- q-learning maze

function buildMaze(world: World) {
  const lab = LAB_BY_KIND.get('maze')!;
  const half = (MAZE_N * MAZE_CELL) / 2;
  for (let r = 0; r < MAZE_N; r++)
    for (let c = 0; c < MAZE_N; c++) {
      const o = mazeCellOrigin(r, c);
      const ch = MAZE_MAP[r][c];
      for (let dx = 0; dx < MAZE_CELL; dx++)
        for (let dz = 0; dz < MAZE_CELL; dz++) {
          const x = o.x + dx, z = o.z + dz;
          const floor = ch === '~' ? B.MAGMA : ch === 'G' ? B.GOLD : ch === 'S' ? B.CYAN : (r + c) % 2 ? B.QUARTZ : B.WHITE;
          world.setRaw(x, GROUND, z, floor);
          world.protect(x, GROUND, z);
          for (let v = 1; v <= 6; v++) world.setRaw(x, GROUND + v, z, ch === '#' && v === 1 ? B.BRICK : B.AIR);
        }
    }
  buildMazeDeck(world);
  // Border wall with an entrance on the console side.
  const x0 = lab.x - half - 1, x1 = lab.x + half, z0 = lab.z - half - 1, z1 = lab.z + half;
  const f = lab.face;
  for (let x = x0; x <= x1; x++)
    for (let z = z0; z <= z1; z++) {
      if (x !== x0 && x !== x1 && z !== z0 && z !== z1) continue;
      const along = f.x !== 0 ? z - lab.z : x - lab.x;
      const onEntrySide = (f.x > 0 && x === x1) || (f.x < 0 && x === x0) || (f.z > 0 && z === z1) || (f.z < 0 && z === z0);
      if (onEntrySide && Math.abs(along + 0.5) < 2) continue;
      for (let v = 0; v <= 1; v++) {
        world.setRaw(x, GROUND + v, z, v === 0 ? B.QUARTZ : B.BRICK);
        world.protect(x, GROUND + v, z);
      }
    }
}

/** A raised quartz deck with a glass rail and a staircase, for watching the agent learn from above. */
function buildMazeDeck(world: World) {
  const fr = labFrame('maze');
  const { uHalf, w0, w1, v: top } = MAZE_DECK;
  const put = (u: number, v: number, w: number, b: BlockId) => {
    const p = fr.world(u, v, w);
    world.setRaw(p.x, p.y, p.z, b);
    world.protect(p.x, p.y, p.z);
  };
  for (let u = -uHalf; u <= uHalf; u++)
    for (let w = w0; w <= w1; w++) {
      const corner = (Math.abs(u) === uHalf || u === 0) && (w === w0 || w === w1);
      for (let v = 1; v < top; v++) put(u, v, w, corner ? B.QUARTZ : B.AIR);
      put(u, top, w, B.QUARTZ);
      const edge = w === w1 || Math.abs(u) === uHalf;
      const stairLanding = u === uHalf && w <= w0 + 1;
      put(u, top + 1, w, edge && !stairLanding ? B.GLASS : B.AIR);
      for (let v = top + 2; v <= top + 4; v++) put(u, v, w, B.AIR);
    }
  // Steps down the right-hand side, one block at a time.
  for (let k = 1; k <= top; k++)
    for (let w = w0; w <= w0 + 1; w++) {
      const u = uHalf + k;
      for (let v = 1; v <= top + 3; v++) put(u, v, w, v < top - k + 1 ? B.SANDSTONE : v === top - k + 1 ? B.QUARTZ : B.AIR);
    }
}
