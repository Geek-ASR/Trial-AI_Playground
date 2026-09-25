import * as THREE from 'three';
import type { RenderPass } from './blocks';
import { CHUNK, SX, SZ } from './layout';
import { meshChunk } from './mesher';
import type { World } from './world';

/**
 * Owns the chunk meshes: builds them nearest-first within a per-frame time
 * budget, rebuilds dirty chunks, and hides chunks beyond the render distance.
 */
export class ChunkRenderer {
  private meshes = new Map<number, THREE.Mesh[]>();
  private pending: [number, number][] = [];
  private pendingSet = new Set<number>();
  readonly total = (SX / CHUNK) * (SZ / CHUNK);
  renderDistance = 160;
  shadows = true;

  constructor(
    private world: World,
    private scene: THREE.Scene,
    private materials: Record<RenderPass, THREE.Material>,
    private cutoutDepth: THREE.Material,
  ) {
    for (let cz = 0; cz < SZ / CHUNK; cz++) for (let cx = 0; cx < SX / CHUNK; cx++) this.enqueue(cx, cz);
    world.onDirty((cx, cz) => this.enqueue(cx, cz));
  }

  get built() {
    return this.meshes.size;
  }

  get queued() {
    return this.pending.length;
  }

  private enqueue(cx: number, cz: number) {
    const key = cz * 1000 + cx;
    if (this.pendingSet.has(key)) return;
    this.pendingSet.add(key);
    this.pending.push([cx, cz]);
  }

  /** Build or rebuild pending chunks, closest to `focus` first, within `budgetMs`. */
  update(focus: THREE.Vector3, budgetMs: number) {
    if (this.pending.length) {
      const fx = focus.x / CHUNK, fz = focus.z / CHUNK;
      const d = (c: [number, number]) => (c[0] + 0.5 - fx) ** 2 + (c[1] + 0.5 - fz) ** 2;
      this.pending.sort((a, b) => d(b) - d(a));
      const start = performance.now();
      while (this.pending.length && performance.now() - start < budgetMs) {
        const [cx, cz] = this.pending.pop()!;
        this.pendingSet.delete(cz * 1000 + cx);
        this.build(cx, cz);
      }
    }
    this.cull(focus);
  }

  private build(cx: number, cz: number) {
    const key = cz * 1000 + cx;
    for (const m of this.meshes.get(key) ?? []) {
      this.scene.remove(m);
      m.geometry.dispose();
    }
    const geo = meshChunk(this.world, cx, cz);
    const out: THREE.Mesh[] = [];
    for (const pass of ['opaque', 'cutout', 'water', 'translucent'] as const) {
      const g = geo[pass];
      if (!g) continue;
      const m = new THREE.Mesh(g, this.materials[pass]);
      m.matrixAutoUpdate = false;
      m.userData.chunk = [cx, cz];
      if (pass === 'opaque' || pass === 'cutout') {
        m.castShadow = this.shadows;
        m.receiveShadow = true;
      }
      if (pass === 'cutout') m.customDepthMaterial = this.cutoutDepth;
      if (pass === 'water') m.renderOrder = 3;
      if (pass === 'translucent') m.renderOrder = 4;
      this.scene.add(m);
      out.push(m);
    }
    this.meshes.set(key, out);
  }

  private cull(focus: THREE.Vector3) {
    const r2 = (this.renderDistance + CHUNK) ** 2;
    for (const list of this.meshes.values()) {
      for (const m of list) {
        const [cx, cz] = m.userData.chunk as [number, number];
        const dx = cx * CHUNK + CHUNK / 2 - focus.x, dz = cz * CHUNK + CHUNK / 2 - focus.z;
        m.visible = dx * dx + dz * dz < r2;
      }
    }
  }

  setShadows(on: boolean) {
    this.shadows = on;
    for (const list of this.meshes.values()) for (const m of list) if (m.material === this.materials.opaque || m.material === this.materials.cutout) m.castShadow = on;
  }

  /** Is every chunk within `radius` of the focus built? */
  readyAround(focus: THREE.Vector3, radius: number): boolean {
    for (let cz = Math.floor((focus.z - radius) / CHUNK); cz <= Math.floor((focus.z + radius) / CHUNK); cz++)
      for (let cx = Math.floor((focus.x - radius) / CHUNK); cx <= Math.floor((focus.x + radius) / CHUNK); cx++) {
        if (cx < 0 || cz < 0 || cx >= SX / CHUNK || cz >= SZ / CHUNK) continue;
        if (!this.meshes.has(cz * 1000 + cx)) return false;
      }
    return true;
  }
}

