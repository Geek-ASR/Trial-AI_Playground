import * as THREE from 'three';
import { audio } from '../audio/audio';
import { astar, type SearchResult } from '../ai/astar';
import { B, isSolid } from '../world/blocks';
import { makeLabel, updateLabel } from '../world/labels';
import { SX, SZ } from '../world/layout';
import type { FrameInfo, SimContext, SimSystem } from './sim';

const MAX_TILES = 16000;

export interface GuideStats {
  target: string;
  explored: number;
  dijkstra: number;
  length: number;
}

/**
 * Nova, the guide robot. Ask for directions and she plans a route with A*,
 * replays the search so you can watch it spread over the landscape, then flies
 * ahead of you along the path.
 */
export class Nova implements SimSystem {
  readonly id = 'nova';
  readonly group = new THREE.Group();
  private bubble: THREE.Sprite;
  private bubbleTimer = 0;
  private tiles: THREE.InstancedMesh;
  private crumbs: THREE.InstancedMesh;
  private search: SearchResult | null = null;
  private reveal = 0;
  private pathWorld: THREE.Vector3[] = [];
  private goal: THREE.Vector3 | null = null;
  private guiding = false;
  private t = 0;
  onArrive: (() => void) | null = null;
  onStats: ((s: GuideStats) => void) | null = null;

  constructor(private ctx: SimContext) {
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.34, 20, 14), new THREE.MeshLambertMaterial({ color: 0xeef2fa }));
    const visor = new THREE.Mesh(new THREE.SphereGeometry(0.3, 20, 10, Math.PI * 1.15, Math.PI * 0.7, Math.PI * 0.35, Math.PI * 0.3), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 2.8, 3.2) }));
    visor.position.z = 0.06;
    visor.rotation.y = Math.PI;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.04, 8, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.2, 0.8, 2.6) }));
    ring.rotation.x = Math.PI / 2;
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.3), new THREE.MeshLambertMaterial({ color: 0xaab }));
    antenna.position.y = 0.45;
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.06), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.2, 0.5) }));
    tip.position.y = 0.62;
    this.group.add(body, visor, ring, antenna, tip);
    this.group.scale.setScalar(0.8);
    this.group.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
    this.bubble = makeLabel(['Hi, I\'m Nova!', 'Press G and I\'ll guide you'], { accent: '#7ef9ff', scale: 0.5 });
    this.bubble.position.y = 0.95;
    this.group.add(this.bubble);
    this.bubbleTimer = 10;

    this.tiles = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.92, 0.92).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }), MAX_TILES);
    this.tiles.count = 0;
    this.tiles.frustumCulled = false;
    this.crumbs = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.16), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.3, 0.6) }), 2000);
    this.crumbs.count = 0;
    this.crumbs.frustumCulled = false;
    ctx.scene.add(this.group, this.tiles, this.crumbs);
  }

  say(lines: string[], seconds = 6) {
    updateLabel(this.bubble, lines, { accent: '#7ef9ff', scale: 0.5 });
    this.bubble.visible = true;
    this.bubbleTimer = seconds;
  }

  private surface = (x: number, z: number): number => {
    const w = this.ctx.world;
    const top = w.topCached(x, z);
    const b = w.get(x, top, z);
    if (b === B.WATER || b === B.MAGMA || b === B.LEAVES || b === B.BIRCH_LEAVES || b === B.SPRUCE_LEAVES || b === B.CHERRY_LEAVES || b === B.CACTUS) return -1;
    if (isSolid(w.get(x, top + 1, z)) || isSolid(w.get(x, top + 2, z))) return -1;
    // Standing on top of a pond? The top solid block may be under water.
    if (w.get(x, top + 1, z) === B.WATER) return -1;
    return top;
  };

  /** Plan a route from the player to (x, z) and start the show. */
  guide(from: THREE.Vector3, to: { x: number; z: number }, name: string) {
    const grid = { w: SX, h: SZ, height: this.surface };
    const start: [number, number] = [Math.floor(from.x), Math.floor(from.z)];
    let goal: [number, number] = [Math.floor(to.x), Math.floor(to.z)];
    // Stations and consoles are solid: aim for the nearest walkable cell next to them.
    if (this.surface(goal[0], goal[1]) < 0) {
      let best: [number, number] = goal, bd = Infinity;
      for (let dx = -3; dx <= 3; dx++)
        for (let dz = -3; dz <= 3; dz++) {
          const x = goal[0] + dx, z = goal[1] + dz;
          if (this.surface(x, z) < 0) continue;
          const d = Math.hypot(dx, dz);
          if (d < bd) { bd = d; best = [x, z]; }
        }
      goal = best;
    }
    const res = astar(grid, start, goal, { climb: 1 });
    if (!res.found) {
      this.say(['Hmm, I can\'t find a walking route there.', 'Try the map to teleport!'], 6);
      audio.beep(false);
      return;
    }
    const dijkstra = astar(grid, start, goal, { climb: 1, weight: 0, maxExpand: 400_000 });
    this.search = res;
    this.reveal = 0;
    this.tiles.count = 0;
    this.crumbs.count = 0;
    this.pathWorld = res.path.map(([x, z]) => new THREE.Vector3(x + 0.5, this.surface(x, z) + 1.35, z + 0.5));
    this.goal = this.pathWorld[this.pathWorld.length - 1];
    this.guiding = true;
    this.say([`Route to ${name}`, `${res.path.length} steps · A* explored ${res.expanded.length} cells`], 8);
    audio.beep(true);
    this.onStats?.({ target: name, explored: res.expanded.length, dijkstra: dijkstra.expanded.length, length: res.path.length });
  }

  cancel() {
    this.guiding = false;
    this.search = null;
    this.tiles.count = 0;
    this.crumbs.count = 0;
  }

  update(f: FrameInfo) {
    this.t += f.dt;
    const p = f.player.pos;
    // Where should Nova be? Ahead on the path while guiding, otherwise hovering off your left shoulder,
    // far enough from the camera that she never fills the screen.
    let target = new THREE.Vector3(p.x - Math.sin(f.player.yaw + 0.45) * 4.2, p.y + 2.05, p.z - Math.cos(f.player.yaw + 0.45) * 4.2);
    if (this.guiding && this.pathWorld.length) {
      let nearestI = 0, nd = Infinity;
      this.pathWorld.forEach((q, i) => {
        const d = Math.hypot(q.x - p.x, q.z - p.z);
        if (d < nd) { nd = d; nearestI = i; }
      });
      const ahead = this.pathWorld[Math.min(this.pathWorld.length - 1, nearestI + 6)];
      target = ahead.clone().add(new THREE.Vector3(0, 1.2, 0));
      if (this.goal && Math.hypot(this.goal.x - p.x, this.goal.z - p.z) < 3.5) {
        this.guiding = false;
        this.say(['We\'re here! 🎉'], 4);
        audio.success();
        this.onArrive?.();
        setTimeout(() => this.cancel(), 1500);
      }
    }
    // After a teleport, pop over instead of flying through the camera.
    if (this.group.position.distanceTo(target) > 14) this.group.position.copy(target);
    else this.group.position.lerp(target, Math.min(1, f.dt * 2.2));
    this.group.position.y += Math.sin(this.t * 2.2) * 0.004;
    this.group.rotation.y = f.player.yaw + Math.sin(this.t * 0.7) * 0.3;
    this.group.children[2].rotation.z += f.dt * 2;

    this.bubbleTimer -= f.dt;
    this.bubble.visible = this.bubbleTimer > 0;

    // Replay the A* search: explored cells light up in order, then the path appears.
    if (this.search) {
      const m = new THREE.Matrix4();
      const c = new THREE.Color();
      const total = this.search.expanded.length;
      const shown = Math.min(total, Math.floor(this.reveal));
      this.reveal += Math.max(60, total / 2.2) * f.dt;
      const step = Math.max(1, Math.ceil(total / MAX_TILES));
      let n = 0;
      for (let i = 0; i < shown && n < MAX_TILES; i += step) {
        const [x, z] = this.search.expanded[i];
        const y = Math.max(0, this.surface(x, z)) + 1.04;
        this.tiles.setMatrixAt(n, m.makeTranslation(x + 0.5, y, z + 0.5));
        const age = (shown - i) / Math.max(1, shown);
        c.setRGB(0.1 + (1 - age) * 0.5, 0.6 + (1 - age) * 1.2, 1.2 + (1 - age) * 1.2).multiplyScalar(this.guiding ? 0.55 : 0.2);
        this.tiles.setColorAt(n, c);
        n++;
      }
      this.tiles.count = n;
      this.tiles.instanceMatrix.needsUpdate = true;
      if (this.tiles.instanceColor) this.tiles.instanceColor.needsUpdate = true;
      if (shown >= total) {
        const k = Math.min(this.pathWorld.length, 2000);
        for (let i = 0; i < k; i++) {
          const q = this.pathWorld[i];
          const s = 0.7 + 0.5 * Math.max(0, Math.sin(this.t * 6 - i * 0.35));
          m.compose(q, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.t * 2 + i), new THREE.Vector3(s, s, s));
          this.crumbs.setMatrixAt(i, m);
        }
        this.crumbs.count = k;
        this.crumbs.instanceMatrix.needsUpdate = true;
      }
    }
  }
}
