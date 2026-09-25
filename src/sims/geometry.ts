import { GROUND, HUB, LAB_BY_KIND, type LabKind, type LabSite } from '../world/layout';

/**
 * Local frame for axis-aligned lab structures. `u` runs to the viewer's right,
 * `w` runs away from the viewer (into the structure) and `v` is up, with the
 * viewer standing on the hub-facing side of the lab.
 */
export interface LabFrame {
  lab: LabSite;
  /** Unit vector (x, z) pointing towards the viewer / hub. */
  toViewer: { x: number; z: number };
  right: { x: number; z: number };
  world(u: number, v: number, w: number): { x: number; y: number; z: number };
  /** Rotation (radians about Y) that turns a structure's +Z (towards viewer) to face the viewer. */
  yaw: number;
}

export function labFrame(kind: LabKind): LabFrame {
  const lab = LAB_BY_KIND.get(kind)!;
  const f = lab.face;
  // The viewer looks along −f, so their right-hand side is (−f) × up = (f.z, −f.x).
  const right = { x: f.z, z: -f.x };
  return {
    lab,
    toViewer: f,
    right,
    world: (u, v, w) => ({
      x: lab.x + right.x * u - f.x * w,
      y: GROUND + v,
      z: lab.z + right.z * u - f.z * w,
    }),
    yaw: Math.atan2(f.x, f.z),
  };
}

// ---------------------------------------------------------------- Galton board

export const GALTON = {
  halfWidth: 17,
  height: 46,
  rows: 14,
  pegTop: 40,
  pegDy: 1.8,
  pegDx: 2,
  pegR: 0.3,
  ballR: 0.28,
  binTop: 15,
  sepThickness: 0.2,
  dropV: 44,
};

// ---------------------------------------------------------------- Q-learning maze

/** 13×13 cells of 2×2 blocks. # wall, ~ lava, S start, G goal. */
export const MAZE_MAP = [
  'S....#.......',
  '.###.#.#####.',
  '.#...#.....#.',
  '.#.#####.#.#.',
  '.#.......#...',
  '.#####.###.##',
  '.....#...#...',
  '.###.###.#.#.',
  '...#.....#.#.',
  '##.#.#####.#.',
  '...#.#~~...#.',
  '.###.#~~.###.',
  '.....#.....#G',
];
export const MAZE_N = 13;
export const MAZE_CELL = 2;

/** World x/z of the top-left block of a maze cell (row r, column c). */
export function mazeCellOrigin(r: number, c: number) {
  const lab = LAB_BY_KIND.get('maze')!;
  const half = (MAZE_N * MAZE_CELL) / 2;
  return { x: lab.x - half + c * MAZE_CELL, z: lab.z - half + r * MAZE_CELL };
}

// ---------------------------------------------------------------- Gradient valley

/** The loss landscape is sunk into a pit: column bases sit on `floor`, the highest tops just below the plaza. */
export const VALLEY = { half: 18, maxH: 14, floor: GROUND - 16 };

// ---------------------------------------------------------------- Neural cathedral

export const CATHEDRAL = {
  halfWidth: 12,
  depth: 32,
  height: 24,
  /** Drawing canvas: 16×16 cells of 0.5 blocks, bottom edge `canvasV` above the floor. */
  canvasW: 4,
  canvasV: 1.4,
  cell: 0.5,
  layers: [
    { n: 32, cols: 8, w: 11, v: 13, gap: 1.5 },
    { n: 16, cols: 4, w: 18, v: 15, gap: 1.7 },
    { n: 10, cols: 10, w: 25, v: 13.5, gap: 1.9 },
  ],
};

// ---------------------------------------------------------------- Embedding galaxy

export const GALAXY = { platformV: 16, centerV: 34, radius: 17 };

// ---------------------------------------------------------------- Hub extras

export const FLOCK_CONSOLE = { x: HUB.x + 15, z: HUB.z };
