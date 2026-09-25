import * as THREE from 'three';
import { LESSON_BY_ID, REALM_BY_ID } from '../curriculum';
import type { RealmId } from '../curriculum/types';
import { B, BLOCKS, type BlockId } from './blocks';
import { makeLabel, updateLabel } from './labels';
import {
  CHUNK, GROUND, HUB, HUB_PORTALS, HUB_SPAWN, PAD_HALF, REALM_RADIUS, REALM_SITES, SITE_BY_REALM, STATIONS, SX, SZ,
  type Station,
} from './layout';
import { meshChunk } from './mesher';
import type { VoxelOp } from './ops';
import { Player, type MoveInput } from './player';
import { createAtlas, tileIcon } from './textures';
import { World } from './world';

const SKY = new THREE.Color('#9fd3ff');
const SAVE_KEY = 'nc.world.v1';
const REACH = 7;

export const HOTBAR: BlockId[] = [B.GRASS, B.STONE, B.PLANKS, B.BRICK, B.GLASS, B.CRYSTAL, B.GOLD, B.BLUE, B.RED];

export type Place = RealmId | 'hub' | 'wilds';

interface EngineEvents {
  near: (s: Station | null) => void;
  interact: (s: Station) => void;
  lock: (locked: boolean) => void;
  place: (p: Place) => void;
  hotbar: (i: number) => void;
  loading: (done: number, total: number) => void;
  fly: (on: boolean) => void;
  builder: () => void;
}

interface QueuedOp {
  x: number;
  y: number;
  z: number;
  b: BlockId;
  record: boolean;
}

export class Engine {
  readonly world = new World();
  readonly player: Player;
  readonly atlas: HTMLCanvasElement;
  readonly input: MoveInput = { forward: 0, strafe: 0, jump: false, descend: false, sprint: false };
  hotbarIndex = 0;
  readonly hotbar = HOTBAR;
  private icons = new Map<number, string>();

  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(72, 1, 0.1, 420);
  private materials: Record<'opaque' | 'cutout' | 'translucent', THREE.Material>;
  private chunks = new Map<number, THREE.Mesh[]>();
  private pendingChunks: [number, number][] = [];
  private totalChunks = 0;
  private queue: QueuedOp[] = [];
  private padCells = new Map<RealmId, Set<number>>();
  private highlight: THREE.LineSegments;
  private clouds: THREE.Mesh;
  private labels = new Map<string, THREE.Sprite>();
  private listeners: { [K in keyof EngineEvents]?: EngineEvents[K][] } = {};
  private keys = new Set<string>();
  private running = false;
  private last = 0;
  private nearStation: Station | null = null;
  private portalTimer = 0;
  private portalCooldown = 0;
  private currentPlace: Place = 'hub';
  private saveTimer = -2;
  private cloudDrift = 0;
  private lastBuild: { x: number; y: number; z: number; prev: BlockId }[] = [];
  private raf = 0;
  private isDone: (lessonId: string) => boolean;
  private lastSpace = 0;

  constructor(private container: HTMLElement, isDone: (lessonId: string) => boolean) {
    this.isDone = isDone;
    this.player = new Player(this.world);

    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.className = 'nc-canvas';
    this.renderer.domElement.setAttribute('aria-label', 'NeuralCraft 3D world');
    container.appendChild(this.renderer.domElement);

    this.scene.background = SKY;
    this.scene.fog = new THREE.Fog(SKY, 70, 190);

    const { texture, canvas } = createAtlas();
    this.atlas = canvas;
    this.materials = {
      opaque: new THREE.MeshBasicMaterial({ map: texture, vertexColors: true }),
      cutout: new THREE.MeshBasicMaterial({ map: texture, vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide }),
      translucent: new THREE.MeshBasicMaterial({ map: texture, vertexColors: true, transparent: true, opacity: 0.72, depthWrite: false }),
    };

    this.highlight = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004, 1.004, 1.004)),
      new THREE.LineBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.7 }),
    );
    this.highlight.visible = false;
    this.scene.add(this.highlight);

    this.clouds = this.makeClouds();
    this.scene.add(this.clouds);

    this.world.generate();
    this.loadEdits();
    for (let cz = 0; cz < SZ / CHUNK; cz++) for (let cx = 0; cx < SX / CHUNK; cx++) this.pendingChunks.push([cx, cz]);
    this.totalChunks = this.pendingChunks.length;
    this.world.onDirty((cx, cz) => this.pendingChunks.push([cx, cz]));

    this.player.teleport(HUB_SPAWN.x, GROUND + 1.01, HUB_SPAWN.z, HUB_SPAWN.yaw);
    this.sortPending();
    this.addLabels();
    this.bindInput();
    this.resize();
    new ResizeObserver(() => this.resize()).observe(container);
  }

  // ------------------------------------------------------------------ events

  on<K extends keyof EngineEvents>(ev: K, fn: EngineEvents[K]) {
    ((this.listeners[ev] ??= []) as EngineEvents[K][]).push(fn);
  }

  private emit<K extends keyof EngineEvents>(ev: K, ...args: Parameters<EngineEvents[K]>) {
    for (const fn of this.listeners[ev] ?? []) (fn as (...a: Parameters<EngineEvents[K]>) => void)(...args);
  }

  // ------------------------------------------------------------------ lifecycle

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const loop = (t: number) => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (t - this.last) / 1000);
      this.last = t;
      this.tick(dt);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.keys.clear();
    this.syncKeys();
    if (document.pointerLockElement === this.renderer.domElement) document.exitPointerLock();
    this.flushSave();
  }

  get canvas(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  get locked(): boolean {
    return document.pointerLockElement === this.renderer.domElement;
  }

  lock() {
    const el = this.renderer.domElement as HTMLCanvasElement & { requestPointerLock(o?: object): Promise<void> | void };
    try {
      const r = el.requestPointerLock({ unadjustedMovement: true });
      if (r instanceof Promise) r.catch(() => el.requestPointerLock());
    } catch {
      el.requestPointerLock();
    }
  }

  unlock() {
    if (this.locked) document.exitPointerLock();
  }

  private resize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // ------------------------------------------------------------------ frame

  private tick(dt: number) {
    const blocking = this.pendingChunks.length > 0 && this.chunks.size < 9;
    if (!blocking) this.player.update(dt, this.input);

    this.checkPortal(dt);
    this.checkPlace();
    this.checkNear();
    this.updateHighlight();
    this.drainQueue();
    this.remesh();

    this.player.eye(this.camera.position);
    this.camera.rotation.set(this.player.pitch, this.player.yaw, 0, 'YXZ');
    this.clouds.position.x = this.player.pos.x;
    this.clouds.position.z = this.player.pos.z;
    // The cloud plane follows the player; shift its texture so clouds stay put in the world and drift slowly.
    this.cloudDrift += dt * 0.002;
    const tex = (this.clouds.material as THREE.MeshBasicMaterial).map!;
    tex.offset.set(this.player.pos.x / 300 + this.cloudDrift, -this.player.pos.z / 300);

    this.saveTimer -= dt;
    if (this.saveTimer < 0 && this.saveTimer > -1) this.flushSave();

    this.renderer.render(this.scene, this.camera);
  }

  private sortPending() {
    const px = this.player.pos.x / CHUNK, pz = this.player.pos.z / CHUNK;
    this.pendingChunks.sort((a, b) => Math.hypot(b[0] + 0.5 - px, b[1] + 0.5 - pz) - Math.hypot(a[0] + 0.5 - px, a[1] + 0.5 - pz));
  }

  private remesh() {
    if (!this.pendingChunks.length) return;
    const start = performance.now();
    const seen = new Set<number>();
    const initial = this.chunks.size < this.totalChunks;
    while (this.pendingChunks.length && performance.now() - start < (initial ? 14 : 8)) {
      const [cx, cz] = this.pendingChunks.pop()!;
      const key = cz * 1000 + cx;
      if (seen.has(key)) continue;
      seen.add(key);
      this.buildChunk(cx, cz);
    }
    // Drop duplicates of chunks we just rebuilt.
    this.pendingChunks = this.pendingChunks.filter(([cx, cz]) => !seen.has(cz * 1000 + cx));
    if (initial) this.emit('loading', this.chunks.size, this.totalChunks);
  }

  private buildChunk(cx: number, cz: number) {
    const key = cz * 1000 + cx;
    for (const m of this.chunks.get(key) ?? []) {
      this.scene.remove(m);
      m.geometry.dispose();
    }
    const geo = meshChunk(this.world, cx, cz);
    const meshes: THREE.Mesh[] = [];
    for (const pass of ['opaque', 'cutout', 'translucent'] as const) {
      const g = geo[pass];
      if (!g) continue;
      const m = new THREE.Mesh(g, this.materials[pass]);
      m.matrixAutoUpdate = false;
      if (pass === 'translucent') m.renderOrder = 1;
      this.scene.add(m);
      meshes.push(m);
    }
    this.chunks.set(key, meshes);
  }

  private drainQueue() {
    let n = 0;
    while (this.queue.length && n < 320) {
      const op = this.queue.shift()!;
      this.world.set(op.x, op.y, op.z, op.b, op.record);
      n++;
    }
    if (n) this.scheduleSave();
  }

  // ------------------------------------------------------------------ world features

  private makeClouds(): THREE.Mesh {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d')!;
    let s = 7;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 26; i++) {
      const x = Math.floor(r() * 16) * 8, y = Math.floor(r() * 16) * 8;
      const w = 8 * (2 + Math.floor(r() * 4)), h = 8 * (1 + Math.floor(r() * 3));
      ctx.fillRect(x, y, w, h);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.magFilter = THREE.NearestFilter;
    tex.repeat.set(3, 3);
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(900, 900),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide, fog: false }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 92;
    return mesh;
  }

  private addLabels() {
    for (const s of STATIONS) {
      const sprite = makeLabel(this.stationLines(s), { accent: REALM_BY_ID.get(s.realm)!.color });
      sprite.position.set(s.x + 0.5, s.y + 2.4, s.z + 0.5);
      this.scene.add(sprite);
      this.labels.set(s.id, sprite);
    }
    for (const p of HUB_PORTALS) {
      const realm = REALM_BY_ID.get(p.realm)!;
      const sprite = makeLabel([realm.name, 'Step on the portal ✦'], { accent: realm.color, scale: 0.75 });
      sprite.position.set(p.x + 0.5, GROUND + 3.2, p.z + 0.5);
      this.scene.add(sprite);
    }
    for (const site of REALM_SITES) {
      const realm = REALM_BY_ID.get(site.id)!;
      const back = makeLabel(['⟵ Back to the Hub'], { accent: '#ffc53d', scale: 0.9 });
      back.position.set(site.portal.x + 0.5, GROUND + 2.8, site.portal.z + 0.5);
      this.scene.add(back);
      const title = makeLabel([realm.name, realm.tagline], { accent: realm.color, scale: 2.2 });
      title.position.set(site.x + 0.5, GROUND + 19, site.z + 0.5);
      this.scene.add(title);
    }
    const hub = makeLabel(['NeuralCraft Hub', 'Pick a realm portal to start learning'], { accent: '#7ef9ff', scale: 1.6 });
    hub.position.set(HUB.x + 0.5, GROUND + 11.5, HUB.z + 0.5);
    this.scene.add(hub);
  }

  private stationLines(s: Station): string[] {
    if (s.kind === 'forge') return ['⚒ Neural Forge', 'Train a neural net live · press E'];
    const lesson = LESSON_BY_ID.get(s.lessonId!)!;
    const done = this.isDone(lesson.id);
    return [lesson.title, done ? '✓ Completed' : `${lesson.level} · +${lesson.xp} XP · press E`];
  }

  refreshStation(lessonId: string) {
    const s = STATIONS.find((x) => x.lessonId === lessonId);
    const sprite = s && this.labels.get(s.id);
    if (!s || !sprite) return;
    updateLabel(sprite, this.stationLines(s), { accent: REALM_BY_ID.get(s.realm)!.color });
    const done = this.isDone(lessonId);
    this.world.set(s.x, s.y, s.z, done ? B.GOLD : B.BEACON, false);
  }

  refreshAllStations() {
    for (const s of STATIONS) if (s.lessonId) this.refreshStation(s.lessonId);
  }

  private checkPortal(dt: number) {
    this.portalCooldown = Math.max(0, this.portalCooldown - dt);
    const p = this.player.pos;
    const under = this.world.get(Math.floor(p.x), Math.floor(p.y - 0.05), Math.floor(p.z));
    if (under !== B.PORTAL || this.portalCooldown > 0) {
      this.portalTimer = 0;
      return;
    }
    this.portalTimer += dt;
    if (this.portalTimer < 0.45) return;
    this.portalTimer = 0;
    this.portalCooldown = 1.5;
    const inHub = Math.hypot(p.x - HUB.x, p.z - HUB.z) < HUB.radius + 2;
    if (!inHub) {
      this.teleport('hub');
      return;
    }
    let best = HUB_PORTALS[0], bd = Infinity;
    for (const hp of HUB_PORTALS) {
      const d = Math.hypot(p.x - hp.x - 0.5, p.z - hp.z - 0.5);
      if (d < bd) { bd = d; best = hp; }
    }
    this.teleport(best.realm);
  }

  private checkPlace() {
    const p = this.player.pos;
    let place: Place = 'wilds';
    if (Math.hypot(p.x - HUB.x, p.z - HUB.z) < HUB.radius + 6) place = 'hub';
    for (const s of REALM_SITES) if (Math.hypot(p.x - s.x, p.z - s.z) < REALM_RADIUS + 6) place = s.id;
    if (place !== this.currentPlace) {
      this.currentPlace = place;
      this.emit('place', place);
    }
  }

  get place(): Place {
    return this.currentPlace;
  }

  private checkNear() {
    const p = this.player.pos;
    let best: Station | null = null, bd = 3.6;
    for (const s of STATIONS) {
      const d = Math.hypot(p.x - (s.x + 0.5), p.z - (s.z + 0.5));
      if (d < bd && Math.abs(p.y - s.y) < 4) { bd = d; best = s; }
    }
    if (best !== this.nearStation) {
      this.nearStation = best;
      this.emit('near', best);
    }
  }

  private target() {
    const eye = this.player.eye();
    const dir = this.player.lookDir();
    return this.world.raycast(eye.x, eye.y, eye.z, dir.x, dir.y, dir.z, REACH);
  }

  private updateHighlight() {
    const hit = this.target();
    this.highlight.visible = !!hit;
    if (hit) this.highlight.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
  }

  // ------------------------------------------------------------------ actions

  interact() {
    if (this.nearStation) this.emit('interact', this.nearStation);
  }

  breakBlock() {
    const hit = this.target();
    if (!hit) return;
    const station = STATIONS.find((s) => s.x === hit.x && s.y === hit.y && s.z === hit.z);
    if (station) {
      this.emit('interact', station);
      return;
    }
    if (this.world.isProtected(hit.x, hit.y, hit.z) || hit.block === B.BEDROCK) return;
    this.world.set(hit.x, hit.y, hit.z, B.AIR);
    this.scheduleSave();
  }

  placeBlock() {
    const hit = this.target();
    if (!hit) return;
    const station = STATIONS.find((s) => s.x === hit.x && s.y === hit.y && s.z === hit.z);
    if (station) {
      this.emit('interact', station);
      return;
    }
    const x = hit.x + hit.nx, y = hit.y + hit.ny, z = hit.z + hit.nz;
    if (this.player.overlapsBlock(x, y, z)) return;
    if (this.world.get(x, y, z) !== B.AIR && this.world.get(x, y, z) !== B.WATER) return;
    this.world.set(x, y, z, HOTBAR[this.hotbarIndex]);
    this.scheduleSave();
  }

  pickBlock() {
    const hit = this.target();
    if (!hit) return;
    const i = HOTBAR.indexOf(hit.block);
    if (i >= 0) this.selectHotbar(i);
    else if (BLOCKS[hit.block]?.placeable) {
      HOTBAR[this.hotbarIndex] = hit.block;
      this.emit('hotbar', this.hotbarIndex);
    }
  }

  selectHotbar(i: number) {
    this.hotbarIndex = ((i % HOTBAR.length) + HOTBAR.length) % HOTBAR.length;
    this.emit('hotbar', this.hotbarIndex);
  }

  toggleFly() {
    this.player.flying = !this.player.flying;
    this.player.vel.y = 0;
    this.emit('fly', this.player.flying);
  }

  teleport(where: Place | string) {
    const lesson = STATIONS.find((s) => s.id === where || s.lessonId === where);
    if (lesson) {
      const site = SITE_BY_REALM.get(lesson.realm)!;
      // Stand between the station and the pad, facing the station.
      const dx = site.x - lesson.x, dz = site.z - lesson.z;
      const len = Math.hypot(dx, dz) || 1;
      const x = lesson.x + 0.5 + (dx / len) * 3, z = lesson.z + 0.5 + (dz / len) * 3;
      this.player.teleport(x, GROUND + 1.01, z, Math.atan2(-(lesson.x + 0.5 - x), -(lesson.z + 0.5 - z)));
    } else if (where === 'hub' || where === 'wilds') {
      this.player.teleport(HUB_SPAWN.x, GROUND + 1.01, HUB_SPAWN.z, HUB_SPAWN.yaw);
    } else {
      const site = SITE_BY_REALM.get(where as RealmId);
      if (!site) return;
      this.player.teleport(site.spawn.x, GROUND + 1.01, site.spawn.z, site.spawn.yaw);
    }
    this.portalCooldown = 1.5;
    this.sortPending();
  }

  // ------------------------------------------------------------------ visualisation & building

  /** Replace whatever is on a realm's display pad with new voxels (pad-relative coordinates). */
  showOnPad(realm: RealmId, ops: VoxelOp[], animate = true) {
    const site = SITE_BY_REALM.get(realm);
    if (!site) return;
    const cells = this.padCells.get(realm) ?? new Set<number>();
    this.queue = this.queue.filter((q) => q.record || Math.hypot(q.x - site.x, q.z - site.z) > PAD_HALF * 1.5);
    for (const i of cells) {
      const x = i % SX, z = Math.floor(i / SX) % SZ, y = Math.floor(i / (SX * SZ));
      this.world.set(x, y, z, B.AIR, false);
    }
    cells.clear();
    const placed: QueuedOp[] = [];
    for (const o of ops) {
      if (Math.abs(o.x) > PAD_HALF || Math.abs(o.z) > PAD_HALF || o.y < 0 || o.y > 24) continue;
      const x = site.x + o.x, y = GROUND + 1 + o.y, z = site.z + o.z;
      cells.add(World.index(x, y, z));
      placed.push({ x, y, z, b: o.b, record: false });
    }
    this.padCells.set(realm, cells);
    if (animate) {
      placed.sort((a, b) => a.y - b.y || a.x - b.x || a.z - b.z);
      this.queue.push(...placed);
    } else {
      for (const p of placed) this.world.set(p.x, p.y, p.z, p.b, false);
    }
  }

  /** Where code-built structures start: 3 blocks in front of the player, on their feet level. */
  buildFrame() {
    const yaw = this.player.yaw;
    const fx0 = -Math.sin(yaw), fz0 = -Math.cos(yaw);
    // Snap facing to the nearest axis so builds are grid-aligned.
    const [fx, fz] = Math.abs(fx0) > Math.abs(fz0) ? [Math.sign(fx0), 0] : [0, Math.sign(fz0)];
    const rx = -fz, rz = fx;
    const ox = Math.floor(this.player.pos.x) + fx * 3;
    const oz = Math.floor(this.player.pos.z) + fz * 3;
    const oy = Math.floor(this.player.pos.y);
    return { ox, oy, oz, fx, fz, rx, rz };
  }

  /** Apply learner-built ops (local coords: x = right, y = up, z = forward). Returns how many blocks were queued. */
  build(ops: VoxelOp[]): number {
    const f = this.buildFrame();
    this.lastBuild = [];
    const placed: QueuedOp[] = [];
    const seen = new Set<number>();
    for (const o of ops) {
      const x = f.ox + o.x * f.rx + o.z * f.fx;
      const z = f.oz + o.x * f.rz + o.z * f.fz;
      const y = f.oy + o.y;
      if (!this.world.inBounds(x, y, z) || y === 0 || this.world.isProtected(x, y, z)) continue;
      const i = World.index(x, y, z);
      if (seen.has(i)) {
        const existing = placed.find((p) => p.x === x && p.y === y && p.z === z);
        if (existing) existing.b = o.b;
        continue;
      }
      seen.add(i);
      this.lastBuild.push({ x, y, z, prev: this.world.get(x, y, z) });
      placed.push({ x, y, z, b: o.b, record: true });
    }
    placed.sort((a, b) => a.y - b.y);
    this.queue.push(...placed);
    return placed.length;
  }

  undoBuild(): number {
    const n = this.lastBuild.length;
    for (const c of this.lastBuild) this.queue.push({ x: c.x, y: c.y, z: c.z, b: c.prev, record: true });
    this.lastBuild = [];
    return n;
  }

  resetWorld() {
    localStorage.removeItem(SAVE_KEY);
    location.reload();
  }

  // ------------------------------------------------------------------ persistence

  private scheduleSave() {
    if (this.saveTimer <= 0) this.saveTimer = 2;
  }

  private flushSave() {
    this.saveTimer = -2;
    try {
      const edits = this.world.serializeEdits();
      if (edits.length > 400_000) return; // keep localStorage usage sane
      localStorage.setItem(SAVE_KEY, JSON.stringify(edits));
    } catch {
      /* storage full or unavailable — the world simply isn't saved */
    }
  }

  private loadEdits() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) this.world.applyEdits(JSON.parse(raw));
    } catch {
      /* ignore corrupt saves */
    }
  }

  // ------------------------------------------------------------------ input

  private syncKeys() {
    const k = this.keys;
    this.input.forward = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    this.input.strafe = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    this.input.jump = k.has('Space');
    this.input.descend = k.has('ShiftLeft') || k.has('ShiftRight');
    this.input.sprint = k.has('ControlLeft') || (!this.player.flying && this.input.descend);
  }

  private bindInput() {
    const typing = () => {
      const a = document.activeElement as HTMLElement | null;
      return !!a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT' || a.isContentEditable);
    };

    window.addEventListener('keydown', (e) => {
      if (!this.running || typing() || e.metaKey || e.altKey) return;
      if (document.querySelector('.panel.open, dialog[open]') && !this.locked) return;
      const code = e.code;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(code)) e.preventDefault();
      if (code === 'Space' && !e.repeat) {
        const now = performance.now();
        if (now - this.lastSpace < 280) this.toggleFly();
        this.lastSpace = now;
      }
      this.keys.add(code);
      this.syncKeys();
      if (e.repeat) return;
      if (code === 'KeyE') this.interact();
      if (code === 'KeyF') this.toggleFly();
      if (code === 'KeyH') this.teleport('hub');
      if (code === 'KeyB') this.emit('builder');
      if (code.startsWith('Digit')) {
        const n = Number(code.slice(5));
        if (n >= 1 && n <= 9) this.selectHotbar(n - 1);
      }
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      this.syncKeys();
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.syncKeys();
    });

    const canvas = this.renderer.domElement;
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      if (e.button === 0) this.breakBlock();
      if (e.button === 2) this.placeBlock();
      if (e.button === 1) this.pickBlock();
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.player.look(e.movementX * 0.0022, e.movementY * 0.0022);
    });
    canvas.addEventListener('wheel', (e) => {
      if (!this.locked) return;
      this.selectHotbar(this.hotbarIndex + (e.deltaY > 0 ? 1 : -1));
    }, { passive: true });
    document.addEventListener('pointerlockchange', () => {
      this.emit('lock', this.locked);
      if (!this.locked) {
        this.keys.clear();
        this.syncKeys();
      }
    });
  }

  /** Data-URL icon for an atlas tile (hotbar / palette). */
  icon(tile: number): string {
    if (!this.icons.has(tile)) this.icons.set(tile, tileIcon(this.atlas, tile));
    return this.icons.get(tile)!;
  }

  /** Touch controls feed look deltas here. */
  lookBy(dx: number, dy: number) {
    this.player.look(dx, dy);
  }

  get lessonPlace(): RealmId | null {
    return this.currentPlace === 'hub' || this.currentPlace === 'wilds' ? null : this.currentPlace;
  }
}
