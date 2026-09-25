import * as THREE from 'three';
import { B, BLOCKS } from '../world/blocks';
import type { Player } from '../world/player';
import type { World } from '../world/world';
import type { ParticleSystem } from './particles';

interface Emitter {
  x: number;
  y: number;
  z: number;
  color: THREE.Color;
}

const LEAF = new Set<number>([B.LEAVES, B.BIRCH_LEAVES, B.CHERRY_LEAVES, B.SPRUCE_LEAVES]);
const rand = (a: number, b: number) => a + Math.random() * (b - a);

/**
 * Spawns ambient particles around the player: fireflies at night, falling
 * leaves and petals, snow in the peaks, lava embers, beacon motes, portal
 * swirls, pollen in the sunshine, rain splashes and bubbles underwater.
 */
export class AmbientLife {
  private acc: Record<string, number> = {};
  beacons: Emitter[] = [];
  portals: Emitter[] = [];

  constructor(private world: World, private glow: ParticleSystem, private solid: ParticleSystem) {}

  private rate(key: string, perSec: number, dt: number): number {
    const v = (this.acc[key] ?? 0) + perSec * dt;
    const n = Math.floor(v);
    this.acc[key] = v - n;
    return n;
  }

  update(dt: number, player: Player, night: number, daylight: number, rain: number, budget: number) {
    const p = player.pos;
    const w = this.world;
    const biome = w.biomeAt(p.x, p.z);

    // Fireflies over grass on calm nights.
    if (night > 0.35 && rain < 0.2 && biome !== 'data' && biome !== 'neural') {
      for (let i = this.rate('fly', 14 * budget * night, dt); i > 0; i--) {
        const x = p.x + rand(-22, 22), z = p.z + rand(-22, 22);
        const top = w.topCached(Math.floor(x), Math.floor(z));
        const b = w.get(Math.floor(x), top, Math.floor(z));
        if (b !== B.GRASS && !LEAF.has(b)) continue;
        this.glow.spawn({ x, y: top + 1.2 + Math.random() * 2.5, z, vx: rand(-0.4, 0.4), vy: rand(-0.1, 0.2), vz: rand(-0.4, 0.4), r: 2.2, g: 2.6, b: 0.6, size: 0.13, life: rand(4, 8), flutter: 0.6, blink: true, drag: 0.3 });
      }
    }

    // Leaves and petals drifting down from canopies.
    for (let i = this.rate('leaf', 8 * budget, dt); i > 0; i--) {
      const x = Math.floor(p.x + rand(-18, 18)), z = Math.floor(p.z + rand(-18, 18));
      const top = w.topCached(x, z);
      const b = w.get(x, top, z);
      if (!LEAF.has(b)) continue;
      const c = new THREE.Color(BLOCKS[b].color);
      if (b !== B.CHERRY_LEAVES) c.multiplyScalar(0.85 + Math.random() * 0.3);
      this.solid.spawn({ x: x + Math.random(), y: top - 0.2, z: z + Math.random(), vy: -0.6, r: c.r, g: c.g, b: c.b, size: 0.09, life: 7, gravity: 0.15, drag: 0.8, flutter: 1.4, collide: true });
    }

    // Snow in the peaks (heavier when the weather turns).
    if (biome === 'neural') {
      for (let i = this.rate('snow', (30 + rain * 90) * budget, dt); i > 0; i--) {
        this.solid.spawn({ x: p.x + rand(-26, 26), y: p.y + rand(8, 22), z: p.z + rand(-26, 26), vy: -1.6, r: 0.97, g: 0.98, b: 1, size: 0.08, life: 12, drag: 0.1, flutter: 0.9, collide: true });
      }
    }

    // Embers rising from lava.
    if (biome === 'agents') {
      for (let i = this.rate('ember', 20 * budget, dt); i > 0; i--) {
        const x = Math.floor(p.x + rand(-20, 20)), z = Math.floor(p.z + rand(-20, 20));
        const top = w.topCached(x, z);
        if (w.get(x, top, z) !== B.MAGMA) continue;
        this.glow.spawn({ x: x + Math.random(), y: top + 1.1, z: z + Math.random(), vy: rand(1, 2.6), r: 4, g: 1.3, b: 0.2, size: 0.08, life: rand(1.2, 2.5), flutter: 0.7, drag: 0.3 });
      }
    }

    // Pollen / dust motes in sunlight.
    if (daylight > 0.6 && rain < 0.1 && (biome === 'foundations' || biome === 'hub' || biome === 'classic' || biome === 'tokens')) {
      for (let i = this.rate('pollen', 6 * budget, dt); i > 0; i--) {
        this.glow.spawn({ x: p.x + rand(-10, 10), y: p.y + rand(0.5, 4), z: p.z + rand(-10, 10), vx: rand(-0.2, 0.2), vy: rand(-0.05, 0.1), vz: rand(-0.2, 0.2), r: 0.9, g: 0.85, b: 0.6, size: 0.035, life: 5, flutter: 0.3, blink: true });
      }
    }

    // Motes spiralling up beacon beams.
    for (const e of this.beacons) {
      const d = Math.hypot(e.x - p.x, e.z - p.z);
      if (d > 32) continue;
      for (let i = this.rate(`b${e.x},${e.z}`, 3 * budget, dt); i > 0; i--) {
        const a = Math.random() * Math.PI * 2;
        this.glow.spawn({ x: e.x + 0.5 + Math.cos(a) * 0.7, y: e.y + 1, z: e.z + 0.5 + Math.sin(a) * 0.7, vy: rand(1.2, 2.4), vx: -Math.sin(a) * 0.6, vz: Math.cos(a) * 0.6, r: e.color.r * 2.5, g: e.color.g * 2.5, b: e.color.b * 2.5, size: 0.07, life: 2.5, drag: 0.2 });
      }
    }

    // Portal vortices.
    for (const e of this.portals) {
      const d = Math.hypot(e.x - p.x, e.z - p.z);
      if (d > 28) continue;
      for (let i = this.rate(`p${e.x},${e.z}`, 10 * budget, dt); i > 0; i--) {
        const a = Math.random() * Math.PI * 2;
        this.glow.spawn({ x: e.x + 0.5 + Math.cos(a) * 1.6, y: e.y + 0.4, z: e.z + 0.5 + Math.sin(a) * 1.6, vx: -Math.cos(a) * 0.7, vy: rand(1, 2), vz: -Math.sin(a) * 0.7, r: e.color.r * 3, g: e.color.g * 3, b: e.color.b * 3, size: 0.09, life: 1.4, drag: 0.1 });
      }
    }

    // Rain splashes on open ground.
    if (rain > 0.1) {
      for (let i = this.rate('splash', 60 * rain * budget, dt); i > 0; i--) {
        const x = p.x + rand(-14, 14), z = p.z + rand(-14, 14);
        const top = w.topCached(Math.floor(x), Math.floor(z));
        this.solid.spawn({ x, y: top + 1.02, z, vy: 1.5, r: 0.75, g: 0.82, b: 0.95, size: 0.04, life: 0.22, gravity: 12 });
      }
    }

    // Bubbles when your head is underwater.
    if (player.headUnderwater) {
      for (let i = this.rate('bubble', 4, dt); i > 0; i--) {
        this.glow.spawn({ x: p.x + rand(-0.3, 0.3), y: p.y + 1.5, z: p.z + rand(-0.3, 0.3), vy: 1.2, r: 0.6, g: 0.8, b: 1, size: 0.06, life: 1.5, flutter: 0.4 });
      }
    }
  }
}
