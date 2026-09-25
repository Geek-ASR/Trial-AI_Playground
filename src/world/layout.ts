import { LESSONS, REALMS } from '../curriculum';
import type { RealmId } from '../curriculum/types';

/** World dimensions in blocks. */
export const SX = 320;
export const SY = 80;
export const SZ = 320;
export const CHUNK = 16;

export const GROUND = 24; // plaza floor height
export const WATER_LEVEL = 20;

export const HUB = { x: SX / 2, z: SZ / 2, radius: 18 };
const REALM_DISTANCE = 76;
export const REALM_RADIUS = 24;
const STATION_RING = 20;
export const PAD_HALF = 12;
const LAB_DISTANCE = 128;
export const LAB_RADIUS = 24;

export type LabKind = 'valley' | 'galton' | 'kmeans' | 'cathedral' | 'galaxy' | 'maze';

export const LAB_BY_REALM: Record<RealmId, LabKind> = {
  foundations: 'valley',
  data: 'galton',
  classic: 'kmeans',
  neural: 'cathedral',
  tokens: 'galaxy',
  agents: 'maze',
};

export interface RealmSite {
  id: RealmId;
  x: number;
  z: number;
  /** Angle from the hub, used to point portals and paths. */
  angle: number;
  /** Where a player arrives when teleporting to this realm. */
  spawn: { x: number; z: number; yaw: number };
  /** Return portal centre (leads back to the hub). */
  portal: { x: number; z: number };
}

export interface LabSite {
  kind: LabKind;
  realm: RealmId;
  x: number;
  z: number;
  angle: number;
  /** Cardinal unit vector pointing from the lab towards the hub (for axis-aligned structures). */
  face: { x: number; z: number };
  /** The console (info + controls) sits where the path from the realm arrives. */
  console: { x: number; z: number };
  spawn: { x: number; z: number; yaw: number; pitch: number };
  /** Lowest air cell where visitors stand at the console and spawn (a deck for the maze). */
  floorY: number;
}

/**
 * The maze is watched from a raised deck in front of its entrance. Lab-frame
 * coordinates: u runs to the viewer's right, w into the lab (negative = towards the hub).
 */
export const MAZE_DECK = { uHalf: 4, w0: -18, w1: -15, v: 7 };

export type StationKind = 'lesson' | 'forge';

export interface Station {
  id: string;
  kind: StationKind;
  realm: RealmId;
  lessonId?: string;
  x: number;
  y: number; // y of the beacon block
  z: number;
  title: string;
}

export interface HubPortal {
  realm: RealmId;
  x: number;
  z: number;
  angle: number;
}

/** Yaw (radians) that makes the camera look from (x,z) towards (tx,tz). three.js cameras look down −Z at yaw 0. */
export function yawTowards(x: number, z: number, tx: number, tz: number): number {
  return Math.atan2(-(tx - x), -(tz - z));
}

export const REALM_SITES: RealmSite[] = REALMS.map((r, i) => {
  const angle = (i / REALMS.length) * Math.PI * 2 - Math.PI / 2;
  const x = Math.round(HUB.x + Math.cos(angle) * REALM_DISTANCE);
  const z = Math.round(HUB.z + Math.sin(angle) * REALM_DISTANCE);
  // Arrive on the hub-facing edge of the plaza, looking at the display pad.
  const ax = Math.round(x - Math.cos(angle) * (REALM_RADIUS - 5));
  const az = Math.round(z - Math.sin(angle) * (REALM_RADIUS - 5));
  const px = Math.round(x - Math.cos(angle) * (REALM_RADIUS - 1.5));
  const pz = Math.round(z - Math.sin(angle) * (REALM_RADIUS - 1.5));
  return {
    id: r.id,
    x,
    z,
    angle,
    spawn: { x: ax + 0.5, z: az + 0.5, yaw: yawTowards(ax, az, x, z) },
    portal: { x: px, z: pz },
  };
});

export const SITE_BY_REALM = new Map(REALM_SITES.map((s) => [s.id, s]));

export const LAB_SITES: LabSite[] = REALM_SITES.map((s) => {
  const x = Math.round(HUB.x + Math.cos(s.angle) * LAB_DISTANCE);
  const z = Math.round(HUB.z + Math.sin(s.angle) * LAB_DISTANCE);
  const back = s.angle + Math.PI;
  const fx = Math.cos(back), fz = Math.sin(back);
  const face = Math.abs(fx) > Math.abs(fz) ? { x: Math.sign(fx), z: 0 } : { x: 0, z: Math.sign(fz) };
  // Visitors arrive on the plaza edge looking at the lab; the console stands a
  // few steps ahead and to their right, so it never blocks the view.
  const kind = LAB_BY_REALM[s.id];
  // The valley is a pit: arrive right at its rim, looking down, with the console behind you.
  const pit = kind === 'valley';
  const cx = Math.round(x + fx * (LAB_RADIUS - (pit ? 1 : 5)) + fz * (pit ? 3 : 2.5));
  const cz = Math.round(z + fz * (LAB_RADIUS - (pit ? 1 : 5)) - fx * (pit ? 3 : 2.5));
  const sx = Math.round(x + fx * (LAB_RADIUS - (pit ? 3 : 1)));
  const sz = Math.round(z + fz * (LAB_RADIUS - (pit ? 3 : 1)));
  if (kind === 'maze') {
    // Arrive on the viewing deck, console at its back-left corner.
    const at = (u: number, w: number) => ({ x: x + face.z * u - face.x * w, z: z - face.x * u - face.z * w });
    const c = at(-3, MAZE_DECK.w0), sp = at(0, MAZE_DECK.w1 - 1);
    return {
      kind, realm: s.id, x, z, angle: s.angle, face,
      console: c,
      spawn: { x: sp.x + 0.5, z: sp.z + 0.5, yaw: yawTowards(sp.x, sp.z, x, z), pitch: -0.5 },
      floorY: GROUND + MAZE_DECK.v + 1,
    };
  }
  const pitch = pit ? -0.5 : kind === 'galton' ? 0.3 : kind === 'galaxy' ? 0.5 : kind === 'kmeans' ? 0.22 : 0.05;
  return {
    kind,
    realm: s.id,
    x,
    z,
    angle: s.angle,
    face,
    console: { x: cx, z: cz },
    spawn: { x: sx + 0.5, z: sz + 0.5, yaw: yawTowards(sx, sz, x, z), pitch },
    floorY: GROUND + 1,
  };
});

export const LAB_BY_KIND = new Map(LAB_SITES.map((l) => [l.kind, l]));

export const HUB_PORTALS: HubPortal[] = REALM_SITES.map((s) => ({
  realm: s.id,
  x: Math.round(HUB.x + Math.cos(s.angle) * 12),
  z: Math.round(HUB.z + Math.sin(s.angle) * 12),
  angle: s.angle,
}));

// Spawn between two portal rings, behind a flower planter, looking at the fountain and spire.
const SPAWN_ANGLE = Math.PI / 3;
const spawnX = Math.round(HUB.x + Math.cos(SPAWN_ANGLE) * 14);
const spawnZ = Math.round(HUB.z + Math.sin(SPAWN_ANGLE) * 14);
export const HUB_SPAWN = { x: spawnX + 0.5, z: spawnZ + 0.5, yaw: yawTowards(spawnX, spawnZ, HUB.x, HUB.z) };

function buildStations(): Station[] {
  const out: Station[] = [];
  for (const site of REALM_SITES) {
    const items: Omit<Station, 'x' | 'y' | 'z'>[] = LESSONS.filter((l) => l.realm === site.id).map((l) => ({
      id: `lesson:${l.id}`,
      kind: 'lesson' as const,
      realm: site.id,
      lessonId: l.id,
      title: l.title,
    }));
    if (site.id === 'neural') items.push({ id: 'forge', kind: 'forge', realm: site.id, title: 'Neural Forge' });
    // Two arcs either side of the pad: the hub-facing side (arrivals) and the
    // lab-facing side (path onwards) stay open.
    const start = site.angle + Math.PI + 0.62;
    const span = Math.PI - 1.24;
    const perSide = Math.ceil(items.length / 2);
    items.forEach((it, i) => {
      const side = i < perSide ? 0 : 1;
      const k = side === 0 ? i : i - perSide;
      const n = side === 0 ? perSide : items.length - perSide;
      const a = start + side * Math.PI + (span * (k + 0.5)) / n;
      out.push({
        ...it,
        x: Math.round(site.x + Math.cos(a) * STATION_RING),
        y: GROUND + 2,
        z: Math.round(site.z + Math.sin(a) * STATION_RING),
      });
    });
  }
  return out;
}

export const STATIONS: Station[] = buildStations();
export const STATION_BY_LESSON = new Map(STATIONS.filter((s) => s.lessonId).map((s) => [s.lessonId!, s]));
