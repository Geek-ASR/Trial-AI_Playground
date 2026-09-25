import { LESSONS, REALMS } from '../curriculum';
import type { RealmId } from '../curriculum/types';

/** World dimensions in blocks. */
export const SX = 224;
export const SY = 64;
export const SZ = 224;
export const CHUNK = 16;

export const GROUND = 24; // plaza floor height
export const WATER_LEVEL = 20;

export const HUB = { x: SX / 2, z: SZ / 2, radius: 15 };
const REALM_DISTANCE = 70;
export const REALM_RADIUS = 23;
const STATION_RING = 19;
export const PAD_HALF = 12;

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

export const HUB_PORTALS: HubPortal[] = REALM_SITES.map((s) => ({
  realm: s.id,
  x: Math.round(HUB.x + Math.cos(s.angle) * 10),
  z: Math.round(HUB.z + Math.sin(s.angle) * 10),
}));

// Spawn between the spire and the Foundations portal, facing the portal (north, −Z).
export const HUB_SPAWN = { x: HUB.x + 0.5, z: HUB.z - 3.5, yaw: 0 };

/** Yaw (radians) that makes the camera look from (x,z) towards (tx,tz). three.js cameras look down −Z at yaw 0. */
export function yawTowards(x: number, z: number, tx: number, tz: number): number {
  return Math.atan2(-(tx - x), -(tz - z));
}

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
    // Spread stations over the far ~300° of the ring, leaving the hub-facing side open for arrivals.
    const start = site.angle + Math.PI + 0.55;
    const span = Math.PI * 2 - 1.1;
    items.forEach((it, i) => {
      const a = start + (span * (i + 0.5)) / items.length;
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
