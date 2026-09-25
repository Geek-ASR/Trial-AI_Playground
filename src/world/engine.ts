import * as THREE from 'three';
import { audio, type Material } from '../audio/audio';
import { LESSON_BY_ID, REALM_BY_ID } from '../curriculum';
import type { RealmId } from '../curriculum/types';
import { AmbientLife } from '../render/ambient';
import { Avatar } from '../render/avatar';
import { Clouds } from '../render/clouds';
import { BeamField, PortalRing } from '../render/effects';
import { createCutoutDepthMaterial, createSharedUniforms, createVoxelMaterial, createWaterMaterial, type SharedUniforms } from '../render/materials';
import { firework, ParticleSystem } from '../render/particles';
import { PostFX } from '../render/post';
import { PropField } from '../render/propField';
import { blockCost, credits, refund, spend } from '../progress/credits';
import { guessQuality, onSettings, PRESETS, QUALITY_ORDER, settings, updateSettings, type QualityLevel, type Settings } from '../render/settings';
import { SkySystem } from '../render/sky';
import { Weather, type WeatherKind } from '../render/weather';
import { FLOCK_CONSOLE } from '../sims/geometry';
import type { FrameInfo, Interactable, SimContext, SimSystem } from '../sims/sim';
import { B, BLOCKS, type BlockId } from './blocks';
import { ChunkRenderer } from './chunks';
import { makeLabel, updateLabel } from './labels';
import {
  GROUND, HUB, HUB_PORTALS, HUB_SPAWN, LAB_RADIUS, LAB_SITES, PAD_HALF, PLAYGROUND, REALM_RADIUS, REALM_SITES, SITE_BY_REALM,
  STATIONS, SX, SZ, type LabKind,
} from './layout';
import type { VoxelOp } from './ops';
import { Player, type MoveInput } from './player';
import { shapeCost, type Prop } from './shapes';
import { createAtlas, tileIcon } from './textures';
import { World } from './world';

const SAVE_KEY = 'nc.world.v2';
const REACH = 7;

export const HOTBAR: BlockId[] = [B.GRASS, B.STONE, B.PLANKS, B.BRICK, B.GLASS, B.LAMP, B.CRYSTAL, B.GOLD, B.CHERRY_LEAVES];

export type Place = RealmId | LabKind | 'hub' | 'wilds' | 'playground';

/** What a code build did (or why it couldn't). */
export interface BuildResult {
  blocks: number;
  shapes: number;
  cost: number;
  /** Set when the build was refused for lack of credits. */
  short?: number;
}

export const LAB_NAMES: Record<LabKind, string> = {
  valley: 'Gradient Descent Valley',
  galton: 'The Galton Board',
  kmeans: 'K-Means Nebula',
  cathedral: 'The Neural Cathedral',
  galaxy: 'Embedding Galaxy',
  maze: 'Q-Learning Maze',
};

interface EngineEvents {
  near: (s: Interactable | null) => void;
  interact: (s: Interactable) => void;
  lock: (locked: boolean) => void;
  place: (p: Place) => void;
  hotbar: (i: number) => void;
  fly: (on: boolean) => void;
  builder: () => void;
  guide: () => void;
  photo: () => void;
  quality: (level: QualityLevel, auto: boolean) => void;
  weather: (kind: WeatherKind) => void;
  /** Tried to build without enough block credits. */
  needCredits: (need: number, have: number) => void;
  /** Free-cursor mode (Shift+M) switched on or off. */
  cursor: (free: boolean) => void;
  credits: () => void;
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
  readonly hotbar = HOTBAR;
  hotbarIndex = 0;
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(74, 1, 0.1, 2400);
  readonly shared: SharedUniforms = createSharedUniforms();
  readonly sky: SkySystem;
  readonly weather: Weather;
  readonly glow: ParticleSystem;
  readonly solid: ParticleSystem;
  readonly interactables: Interactable[] = [];
  readonly systems: SimSystem[] = [];
  /** While set, drives the camera each frame (the cinematic tour). Return false when finished. */
  cinematic: ((dt: number, cam: THREE.PerspectiveCamera) => boolean) | null = null;
  cameraMode: 'first' | 'third' = 'first';
  quality: QualityLevel = 'medium';
  fps = 60;

  private atlasTexture: THREE.Texture;
  readonly post: PostFX;
  private clouds = new Clouds();
  private ambient: AmbientLife;
  private beams!: BeamField;
  private portals: PortalRing[] = [];
  private avatar = new Avatar();
  private chunks!: ChunkRenderer;
  private highlight: THREE.LineSegments;
  private labels = new Map<string, THREE.Sprite>();
  private listeners: { [K in keyof EngineEvents]?: EngineEvents[K][] } = {};
  private keys = new Set<string>();
  private running = false;
  private ready = false;
  private last = 0;
  private time = 0;
  private near: Interactable | null = null;
  private portalTimer = 0;
  private portalCooldown = 0;
  private currentPlace: Place = 'hub';
  private saveTimer = -2;
  private queue: QueuedOp[] = [];
  private padCells = new Map<RealmId, Set<number>>();
  private lastBuild: { x: number; y: number; z: number; prev: BlockId }[] = [];
  private lastBuildCost = 0;
  /** Shapes built with code. */
  readonly props: PropField;
  /** Shift+M: a normal mouse cursor instead of mouse-look. */
  freeCursor = false;
  /** In free-cursor mode, the ray under the mouse replaces the crosshair. */
  private aim: THREE.Ray | null = null;
  private freeDrag: { x: number; y: number; moved: boolean } | null = null;
  private raf = 0;
  private lastSpace = 0;
  private icons = new Map<number, string>();
  private fovNow = 74;
  private bob = 0;
  private dip = 0;
  private lastStride = 0;
  private wasInWater = false;
  private pointerDown = -1;
  private ambTimer = 0;
  private fpsFrames = 0;
  private fpsTime = 0;
  private fpsLow = 0;
  private autoQuality = true;
  private thirdDist = 4.2;
  private unsubSettings: () => void;
  private readonly ctx: SimContext;
  private underwater = false;

  static async create(container: HTMLElement, isDone: (lessonId: string) => boolean, onProgress: (label: string, frac: number) => void): Promise<Engine> {
    const e = new Engine(container, isDone);
    await e.world.generateAsync(onProgress);
    e.loadEdits();
    e.finishSetup();
    onProgress('Meshing chunks…', 0.92);
    return e;
  }

  private constructor(private container: HTMLElement, private isDone: (lessonId: string) => boolean) {
    this.player = new Player(this.world);
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.domElement.className = 'nc-canvas';
    this.renderer.domElement.setAttribute('aria-label', 'NeuralCraft 3D world');
    this.renderer.domElement.tabIndex = 0;

    this.scene.fog = new THREE.Fog(0xa9d2f2, 70, 170);
    const { texture, canvas } = createAtlas();
    this.atlas = canvas;
    this.atlasTexture = texture;
    this.sky = new SkySystem(this.scene, this.shared);
    this.post = new PostFX(this.renderer, this.scene, this.camera);
    this.scene.add(this.clouds.mesh);

    this.glow = new ParticleSystem(4000, 'glow');
    this.solid = new ParticleSystem(3000, 'solid', (x, y, z) => this.world.solidAt(x, y, z));
    this.scene.add(this.glow.points, this.solid.points);
    this.ambient = new AmbientLife(this.world, this.glow, this.solid);
    this.props = new PropField(this.scene);

    this.weather = new Weather((x, z) => this.world.topCached(x, z));
    this.weather.onThunder = (d) => audio.thunder(d);
    this.weather.onChange = (k) => this.emit('weather', k);
    this.scene.add(this.weather.rainMesh, this.weather.bolt);

    this.highlight = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004, 1.004, 1.004)),
      new THREE.LineBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.65 }),
    );
    this.highlight.visible = false;
    this.scene.add(this.highlight, this.avatar.group);

    this.ctx = {
      scene: this.scene,
      world: this.world,
      glow: this.glow,
      solid: this.solid,
      setBlocks: (ops, animate = false) => {
        if (animate) this.queue.push(...ops.map((o) => ({ ...o, record: false })));
        else for (const o of ops) this.world.set(o.x, o.y, o.z, o.b, false);
      },
    };

    this.unsubSettings = onSettings((s) => this.applySettings(s));
  }

  get simContext(): SimContext {
    return this.ctx;
  }

  private finishSetup() {
    const mats = {
      opaque: createVoxelMaterial(this.atlasTexture, this.shared, 'opaque'),
      cutout: createVoxelMaterial(this.atlasTexture, this.shared, 'cutout'),
      translucent: createVoxelMaterial(this.atlasTexture, this.shared, 'translucent'),
      water: createWaterMaterial(this.shared),
    };
    this.chunks = new ChunkRenderer(this.world, this.scene, mats, createCutoutDepthMaterial(this.atlasTexture));

    this.player.teleport(HUB_SPAWN.x, GROUND + 1.01, HUB_SPAWN.z, HUB_SPAWN.yaw);
    this.buildInteractables();
    this.addLabels();
    this.addBeamsAndPortals();
    this.bindInput();
    const s = settings();
    this.autoQuality = s.quality === 'auto';
    this.quality = s.quality === 'auto' ? guessQuality(this.renderer) : s.quality;
    this.applySettings(s);
    this.resize();
    new ResizeObserver(() => this.resize()).observe(this.container);
    this.ready = true;
  }

  // ------------------------------------------------------------------ events

  on<K extends keyof EngineEvents>(ev: K, fn: EngineEvents[K]) {
    ((this.listeners[ev] ??= []) as EngineEvents[K][]).push(fn);
  }

  private emit<K extends keyof EngineEvents>(ev: K, ...args: Parameters<EngineEvents[K]>) {
    for (const fn of this.listeners[ev] ?? []) (fn as (...a: Parameters<EngineEvents[K]>) => void)(...args);
  }

  addSystem(s: SimSystem) {
    this.systems.push(s);
  }

  // ------------------------------------------------------------------ lifecycle

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const loop = (t: number) => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(loop);
      const raw = Math.max(0, (t - this.last) / 1000);
      this.last = t;
      this.tick(Math.min(0.05, raw), raw);
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

  /** Is the terrain around the player meshed yet? (loading screen) */
  get worldReady(): boolean {
    return this.ready && this.chunks.readyAround(this.player.pos, 48);
  }

  lock() {
    audio.unlock();
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

  /** Shift+M: swap mouse-look for a normal cursor (and back). */
  setFreeCursor(on: boolean) {
    if (on === this.freeCursor) return;
    this.freeCursor = on;
    this.aim = null;
    this.freeDrag = null;
    this.renderer.domElement.classList.toggle('free-cursor', on);
    if (on) this.unlock();
    else this.lock();
    this.emit('cursor', on);
  }

  private mouseRay(e: MouseEvent): THREE.Ray {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    const rc = new THREE.Raycaster();
    rc.setFromCamera(ndc, this.camera);
    return rc.ray.clone();
  }

  private resize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.post.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const px = h * this.renderer.getPixelRatio();
    this.glow.setViewportScale(px, this.camera.fov);
    this.solid.setViewportScale(px, this.camera.fov);
  }

  // ------------------------------------------------------------------ settings & quality

  private applySettings(s: Settings) {
    this.autoQuality = s.quality === 'auto';
    if (!this.autoQuality) this.quality = s.quality as QualityLevel;
    const q = PRESETS[this.quality];
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.pixelRatio));
    this.renderer.shadowMap.enabled = q.shadows;
    this.sky.sun.castShadow = q.shadows;
    if (this.sky.sun.shadow.mapSize.x !== q.shadowMap) this.sky.setShadowMapSize(q.shadowMap);
    this.sky.setShadowRadius(q.shadowRadius);
    this.chunks?.setShadows(q.shadows);
    this.post.enabled = q.post;
    this.post.apply({ bloom: q.bloom, aa: q.aa });
    if (this.chunks) this.chunks.renderDistance = q.renderDistance;
    this.glow.budget = this.solid.budget = q.particles;
    this.clouds.mesh.visible = q.clouds;
    this.sky.dayLengthSec = s.dayMinutes * 60;
    const fixed: Record<string, number> = { dawn: 0.285, noon: 0.5, sunset: 0.718, night: 0.92 };
    if (s.timeMode === 'cycle') this.sky.paused = false;
    else {
      this.sky.paused = true;
      this.sky.time = fixed[s.timeMode];
    }
    this.weather.setMode(s.weather);
    this.cameraMode = s.camera;
    audio.setVolumes({ master: s.master, music: s.music, sfx: s.sfx, ambience: s.ambience });
    this.resize();
  }

  /** Frame rate from wall-clock time (the simulation dt is clamped, so it can't be used here). */
  private trackFps(wall: number) {
    this.fpsFrames++;
    this.fpsTime += Math.min(wall, 1);
    if (this.fpsTime < 2) return;
    this.fps = this.fpsFrames / this.fpsTime;
    this.fpsFrames = 0;
    this.fpsTime = 0;
    if (!this.autoQuality || this.time < 8 || this.cinematic) return;
    this.fpsLow = this.fps < 30 ? this.fpsLow + 1 : 0;
    const i = QUALITY_ORDER.indexOf(this.quality);
    if (this.fpsLow >= 2 && i > 0) {
      this.quality = QUALITY_ORDER[i - 1];
      this.fpsLow = 0;
      this.applySettings(settings());
      this.emit('quality', this.quality, true);
    }
  }

  // ------------------------------------------------------------------ frame

  private tick(dt: number, wall = dt) {
    this.time += dt;
    this.shared.uTime.value = this.time;
    const loading = !this.chunks.readyAround(this.player.pos, 40);

    if (!loading && !this.cinematic) this.player.update(dt, this.input);
    this.afterMove(dt);
    this.checkPortal(dt);
    this.checkPlace();
    this.checkNear();
    this.updateHighlight();
    this.drainQueue();
    this.world.flushLight();
    this.chunks.update(this.cinematic ? this.camera.position : this.player.pos, loading ? 24 : 7);

    // Atmosphere.
    const s = settings();
    const biome = this.world.biomeAt(this.player.pos.x, this.player.pos.z);
    const precip = biome === 'neural' ? 'snow' : biome === 'data' ? 'none' : 'rain';
    this.weather.update(dt, this.player.pos, s.weather, precip);
    this.sky.overcast = this.weather.overcast;
    this.sky.lightning = this.weather.flash;
    this.sky.update(dt, this.camera, this.cinematic ? this.camera.position : this.player.pos, this.scene.fog as THREE.Fog);
    this.shared.uWind.value = 1 + this.weather.overcast * 1.4;
    this.shared.uWetness.value += (this.weather.rain - this.shared.uWetness.value) * Math.min(1, dt * 0.3);
    this.clouds.setWeather(this.weather.overcast);
    this.clouds.update(dt, this.camera.position, this.sky.sun.color, this.shared.uSkyAmbient.value, this.weather.overcast);

    this.updateCamera(dt);
    this.updateFog();

    this.ambient.update(dt, this.player, this.sky.night, this.sky.daylight, this.weather.rain, PRESETS[this.quality].particles);
    this.glow.update(dt, this.time);
    this.solid.update(dt, this.time);
    this.beams.update(this.time, this.sky.night, this.camera.position);
    for (const p of this.portals) p.update(this.time, this.camera.position);

    const focus = this.cinematic ? this.camera.position : this.player.pos;
    const frame: FrameInfo = { dt, time: this.time, camera: this.camera, player: this.player, focus, daylight: this.sky.daylight, night: this.sky.night };
    for (const sys of this.systems) sys.update(frame);

    this.ambTimer -= dt;
    if (this.ambTimer <= 0) {
      this.ambTimer = 0.25;
      audio.updateAmbience(this.ambienceState(biome), 0.25);
    }

    this.saveTimer -= dt;
    if (this.saveTimer < 0 && this.saveTimer > -1) this.flushSave();

    const grade = this.post.grade.uniforms;
    grade.uUnderwater.value = this.underwater ? 1 : 0;
    grade.uFlash.value = this.weather.flash * 0.35;
    grade.uTime.value = this.time;
    if (this.post.enabled) this.post.render(dt);
    else this.renderer.render(this.scene, this.camera);
    this.trackFps(wall);
  }

  /** Fast-forward every simulation without rendering (used by the smoke test and for screenshots). */
  fastForward(seconds: number, step = 1 / 30) {
    for (let t = 0; t < seconds; t += step) {
      this.time += step;
      const focus = this.cinematic ? this.camera.position : this.player.pos;
      const frame: FrameInfo = { dt: step, time: this.time, camera: this.camera, player: this.player, focus, daylight: this.sky.daylight, night: this.sky.night };
      for (const sys of this.systems) sys.update(frame);
      this.glow.update(step, this.time);
      this.solid.update(step, this.time);
    }
  }

  private ambienceState(biome: string) {
    const p = this.player.pos;
    let water = 0, lava = 0;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const x = Math.floor(p.x + Math.cos(a) * 7), z = Math.floor(p.z + Math.sin(a) * 7);
      const top = this.world.surfaceY(x, z);
      const b = this.world.get(x, top, z);
      if (b === B.WATER) water++;
      if (b === B.MAGMA) lava++;
    }
    return {
      daylight: this.sky.daylight,
      night: this.sky.night,
      biome,
      rain: this.weather.rain,
      storm: this.weather.kind === 'storm',
      altitude: p.y,
      nearWater: Math.min(1, water / 6),
      nearLava: Math.min(1, lava / 4),
      underwater: this.player.headUnderwater,
    };
  }

  private afterMove(dt: number) {
    const p = this.player;
    if (p.onGround && p.stride - this.lastStride > 2.1) {
      this.lastStride = p.stride;
      const under = this.world.get(Math.floor(p.pos.x), Math.floor(p.pos.y - 0.1), Math.floor(p.pos.z));
      audio.step((BLOCKS[under]?.sound ?? 'stone') as Material);
    }
    if (p.landed) {
      audio.land(p.landed);
      this.dip = Math.min(0.25, p.landed * 0.012);
      p.landed = 0;
    }
    if (p.inWater && !this.wasInWater && p.vel.y < -3) {
      audio.splash();
      for (let i = 0; i < 16; i++) this.solid.spawn({ x: p.pos.x + (Math.random() - 0.5), y: p.pos.y + 0.8, z: p.pos.z + (Math.random() - 0.5), vx: (Math.random() - 0.5) * 3, vy: 3 + Math.random() * 3, vz: (Math.random() - 0.5) * 3, r: 0.7, g: 0.85, b: 1, size: 0.06, life: 0.8, gravity: 18 });
    }
    this.wasInWater = p.inWater;
    this.dip = Math.max(0, this.dip - dt * 1.2);
  }

  private updateCamera(dt: number) {
    const p = this.player;
    const cam = this.camera;
    if (this.cinematic) {
      this.avatar.group.visible = true;
      this.avatar.update(dt, p.pos, p.yaw, p.pitch, 0, true, false, false);
      if (!this.cinematic(dt, cam)) this.cinematic = null;
      return;
    }
    const speed = Math.hypot(p.vel.x, p.vel.z);
    const s = settings();
    const moving = p.onGround && speed > 0.5;
    this.bob += moving ? dt * speed * 1.85 : 0;
    const bobY = s.headBob && moving ? Math.sin(this.bob * 2) * 0.045 : 0;
    const bobX = s.headBob && moving ? Math.cos(this.bob) * 0.028 : 0;
    const eye = p.eye();
    eye.y += bobY - this.dip;

    const third = this.cameraMode === 'third';
    this.avatar.group.visible = third;
    this.avatar.update(dt, p.pos, p.yaw, p.pitch, speed, p.onGround, p.inWater && !p.flying, p.flying);

    const targetFov = s.fov + (this.input.sprint && speed > 6 ? 8 : 0) + (p.flying && speed > 8 ? 5 : 0);
    this.fovNow += (targetFov - this.fovNow) * Math.min(1, dt * 6);
    if (Math.abs(cam.fov - this.fovNow) > 0.01) {
      cam.fov = this.fovNow;
      cam.updateProjectionMatrix();
    }

    cam.rotation.set(p.pitch, p.yaw, 0, 'YXZ');
    if (!third) {
      const right = new THREE.Vector3(Math.cos(p.yaw), 0, -Math.sin(p.yaw));
      cam.position.copy(eye).addScaledVector(right, bobX);
      return;
    }
    // Third person: pull back behind the head, stopping short of walls.
    const back = p.lookDir().multiplyScalar(-1);
    const head = p.eye();
    let d = 0;
    while (d < this.thirdDist) {
      const q = head.clone().addScaledVector(back, d + 0.3);
      if (this.world.solidAt(q.x, q.y, q.z)) break;
      d += 0.2;
    }
    cam.position.copy(head).addScaledVector(back, Math.max(0.6, d)).add(new THREE.Vector3(0, 0.25, 0));
  }

  private updateFog() {
    const fog = this.scene.fog as THREE.Fog;
    const q = PRESETS[this.quality];
    const cam = this.camera.position;
    this.underwater = this.world.get(Math.floor(cam.x), Math.floor(cam.y), Math.floor(cam.z)) === B.WATER;
    if (this.underwater) {
      fog.near = 0.5;
      fog.far = 26;
      fog.color.setRGB(0.04, 0.2, 0.33).multiplyScalar(0.3 + this.sky.daylight * 0.7);
      return;
    }
    const oc = this.weather.overcast;
    fog.far = q.renderDistance * (1 - oc * 0.35);
    fog.near = fog.far * (0.35 - oc * 0.15);
  }

  private drainQueue() {
    let n = 0;
    while (this.queue.length && n < 400) {
      const op = this.queue.shift()!;
      if (this.world.set(op.x, op.y, op.z, op.b, op.record)) for (const s of this.systems) s.onEdit?.(op.x, op.y, op.z);
      n++;
    }
    if (n) this.scheduleSave();
  }

  // ------------------------------------------------------------------ world features

  private buildInteractables() {
    for (const s of STATIONS) {
      this.interactables.push({
        id: s.id, kind: s.kind, x: s.x, y: s.y, z: s.z, title: s.title, realm: s.realm, lessonId: s.lessonId,
      });
    }
    for (const l of LAB_SITES) {
      this.interactables.push({ id: `lab:${l.kind}`, kind: 'lab', x: l.console.x, y: l.floorY + 1, z: l.console.z, title: LAB_NAMES[l.kind], realm: l.realm, lab: l.kind });
    }
    this.interactables.push({ id: 'flock', kind: 'flock', x: FLOCK_CONSOLE.x, y: GROUND + 2, z: FLOCK_CONSOLE.z, title: 'Flock Lab: boids' });
    this.interactables.push({ id: 'kiosk', kind: 'kiosk', x: PLAYGROUND.kiosk.x, y: GROUND + 2, z: PLAYGROUND.kiosk.z, title: 'Earn block credits' });
  }

  private addLabels() {
    for (const s of STATIONS) {
      const sprite = makeLabel(this.stationLines(s.id), { accent: REALM_BY_ID.get(s.realm)!.color });
      sprite.position.set(s.x + 0.5, s.y + 2.4, s.z + 0.5);
      this.scene.add(sprite);
      this.labels.set(s.id, sprite);
    }
    for (const p of HUB_PORTALS) {
      const realm = REALM_BY_ID.get(p.realm)!;
      const sprite = makeLabel([realm.name, 'Walk through the ring ✦'], { accent: realm.color, scale: 0.75 });
      sprite.position.set(p.x + 0.5, GROUND + 5.6, p.z + 0.5);
      this.scene.add(sprite);
    }
    for (const site of REALM_SITES) {
      const realm = REALM_BY_ID.get(site.id)!;
      const back = makeLabel(['⟵ Back to the Hub'], { accent: '#ffc53d', scale: 0.8 });
      back.position.set(site.portal.x + 0.5, GROUND + 5.4, site.portal.z + 0.5);
      this.scene.add(back);
      const title = makeLabel([realm.name, realm.tagline], { accent: realm.color, scale: 2.2 });
      title.position.set(site.x + 0.5, GROUND + 19, site.z + 0.5);
      this.scene.add(title);
    }
    for (const l of LAB_SITES) {
      const realm = REALM_BY_ID.get(l.realm)!;
      const sign = makeLabel([`🔬 ${LAB_NAMES[l.kind]}`, 'Live simulation · press E here'], { accent: realm.color, scale: 0.6 });
      sign.position.set(l.console.x + 0.5, l.floorY + 3.1, l.console.z + 0.5);
      this.scene.add(sign);
    }
    const flock = makeLabel(['🐦 Flock Lab', 'Boids: press E'], { accent: '#7ef9ff', scale: 0.9 });
    flock.position.set(FLOCK_CONSOLE.x + 0.5, GROUND + 4.2, FLOCK_CONSOLE.z + 0.5);
    this.scene.add(flock);
    const kiosk = makeLabel(['⚡ Earn blocks', 'Quizzes · maths · code — press E'], { accent: '#ffc53d', scale: 0.7 });
    kiosk.position.set(PLAYGROUND.kiosk.x + 0.5, GROUND + 4.2, PLAYGROUND.kiosk.z + 0.5);
    const plot = makeLabel(['🏗 Your Playground', 'Build anything · B = code builder · Q = earn blocks'], { accent: '#ffc53d', scale: 1.4 });
    plot.position.set(PLAYGROUND.x + 0.5, GROUND + 16, PLAYGROUND.z + 0.5);
    this.scene.add(kiosk, plot);
    const hub = makeLabel(['NeuralCraft Hub', 'Walk through a portal ring to start learning'], { accent: '#7ef9ff', scale: 1.6 });
    hub.position.set(HUB.x + 0.5, GROUND + 14, HUB.z + 0.5);
    this.scene.add(hub);
  }

  private addBeamsAndPortals() {
    const beams = STATIONS.map((s) => ({
      id: s.id,
      x: s.x,
      y: s.y + 1,
      z: s.z,
      color: s.lessonId && this.isDone(s.lessonId) ? new THREE.Color(1, 0.78, 0.25) : new THREE.Color(REALM_BY_ID.get(s.realm)!.color),
    }));
    for (const l of LAB_SITES) beams.push({ id: `lab:${l.kind}`, x: l.console.x, y: l.floorY + 2, z: l.console.z, color: new THREE.Color(0.85, 0.9, 1) });
    beams.push({ id: 'hub', x: HUB.x, y: GROUND + 10, z: HUB.z, color: new THREE.Color(0.5, 0.95, 1) });
    this.beams = new BeamField(beams);
    this.scene.add(this.beams.mesh);
    this.ambient.beacons = STATIONS.map((s) => ({ x: s.x, y: s.y, z: s.z, color: new THREE.Color(REALM_BY_ID.get(s.realm)!.color) }));

    for (const p of HUB_PORTALS) {
      const color = new THREE.Color(REALM_BY_ID.get(p.realm)!.color);
      const ring = new PortalRing(p.x, GROUND, p.z, p.angle, color);
      this.portals.push(ring);
      this.scene.add(ring.group);
      this.ambient.portals.push({ x: p.x, y: GROUND + 1, z: p.z, color });
    }
    for (const s of REALM_SITES) {
      const ring = new PortalRing(s.portal.x, GROUND, s.portal.z, s.angle, new THREE.Color(1, 0.78, 0.3));
      this.portals.push(ring);
      this.scene.add(ring.group);
      this.ambient.portals.push({ x: s.portal.x, y: GROUND + 1, z: s.portal.z, color: new THREE.Color(1, 0.78, 0.3) });
    }
  }

  private stationLines(id: string): string[] {
    const s = STATIONS.find((x) => x.id === id)!;
    if (s.kind === 'forge') return ['⚒ Neural Forge', 'Train a neural net live · press E'];
    const lesson = LESSON_BY_ID.get(s.lessonId!)!;
    const done = this.isDone(lesson.id);
    return [lesson.title, done ? '✓ Completed' : `${lesson.level} · +${lesson.xp} XP · press E`];
  }

  refreshStation(lessonId: string) {
    const s = STATIONS.find((x) => x.lessonId === lessonId);
    const sprite = s && this.labels.get(s.id);
    if (!s || !sprite) return;
    updateLabel(sprite, this.stationLines(s.id), { accent: REALM_BY_ID.get(s.realm)!.color });
    const done = this.isDone(lessonId);
    this.world.set(s.x, s.y, s.z, done ? B.GOLD : B.BEACON, false);
    this.beams.setColor(s.id, done ? new THREE.Color(1, 0.78, 0.25) : new THREE.Color(REALM_BY_ID.get(s.realm)!.color));
  }

  refreshAllStations() {
    for (const s of STATIONS) if (s.lessonId) this.refreshStation(s.lessonId);
  }

  /** Fireworks over a point in the world. */
  celebrate(x: number, y: number, z: number, color = new THREE.Color(1, 0.8, 0.3), count = 3) {
    for (let i = 0; i < count; i++) {
      setTimeout(() => {
        const fx = x + (Math.random() - 0.5) * 8, fz = z + (Math.random() - 0.5) * 8;
        firework(this.glow, fx, y, fz, i % 2 ? color : new THREE.Color().setHSL(Math.random(), 0.9, 0.6), 12 + Math.random() * 8);
        const d = Math.hypot(fx - this.player.pos.x, fz - this.player.pos.z);
        audio.firework(d, 0);
      }, i * 380);
    }
  }

  celebrateStation(lessonId: string) {
    const s = STATIONS.find((x) => x.lessonId === lessonId);
    if (!s) return;
    this.celebrate(s.x + 0.5, s.y + 1, s.z + 0.5, new THREE.Color(REALM_BY_ID.get(s.realm)!.color), 4);
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
    if (this.portalTimer < 0.35) return;
    this.portalTimer = 0;
    this.portalCooldown = 1.5;
    audio.portal();
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
    for (const l of LAB_SITES) if (Math.hypot(p.x - l.x, p.z - l.z) < LAB_RADIUS + 6) place = l.kind;
    if (Math.hypot(p.x - PLAYGROUND.x, p.z - PLAYGROUND.z) < PLAYGROUND.radius + 4) place = 'playground';
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
    let best: Interactable | null = null, bd = 3.8;
    for (const s of this.interactables) {
      const d = Math.hypot(p.x - (s.x + 0.5), p.z - (s.z + 0.5));
      if (d < bd && Math.abs(p.y - s.y) < 4) { bd = d; best = s; }
    }
    if (best !== this.near) {
      this.near = best;
      this.emit('near', best);
    }
  }

  private target() {
    if (this.aim) {
      const { origin: o, direction: d } = this.aim;
      return this.world.raycast(o.x, o.y, o.z, d.x, d.y, d.z, REACH * 3);
    }
    const eye = this.player.eye();
    const dir = this.player.lookDir();
    return this.world.raycast(eye.x, eye.y, eye.z, dir.x, dir.y, dir.z, REACH);
  }

  private pointerRay(): THREE.Ray {
    return this.aim ?? this.crosshairRay();
  }

  private updateHighlight() {
    const hit = this.cinematic ? null : this.target();
    this.highlight.visible = !!hit && (this.cameraMode === 'first' || this.freeCursor);
    if (hit) this.highlight.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
  }

  // ------------------------------------------------------------------ actions

  interact() {
    if (this.near) {
      audio.click();
      this.emit('interact', this.near);
    }
  }

  private interactableAt(x: number, y: number, z: number) {
    return this.interactables.find((s) => s.x === x && Math.abs(s.y - y) <= 1 && s.z === z);
  }

  breakBlock() {
    const hit = this.target();
    // A code-built shape in front of the block? Remove that instead (and refund it).
    const ray = this.pointerRay();
    const prop = this.props.pick(ray, this.aim ? REACH * 3 : REACH + 1);
    if (prop && (!hit || prop.distance < ray.origin.distanceTo(new THREE.Vector3(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5)) - 0.4)) {
      this.props.remove(prop.prop);
      refund(shapeCost(prop.prop));
      audio.breakBlock('glass');
      const p = ray.at(prop.distance, new THREE.Vector3());
      const c = new THREE.Color(prop.prop.color);
      for (let i = 0; i < 20; i++) this.solid.spawn({ x: p.x, y: p.y, z: p.z, vx: (Math.random() - 0.5) * 4, vy: 1 + Math.random() * 3, vz: (Math.random() - 0.5) * 4, r: c.r, g: c.g, b: c.b, size: 0.12, life: 0.9, gravity: 16, drag: 0.5, collide: true });
      this.emit('credits');
      return;
    }
    if (!hit) return;
    const it = this.interactableAt(hit.x, hit.y, hit.z);
    if (it && this.world.isProtected(hit.x, hit.y, hit.z)) {
      this.emit('interact', it);
      return;
    }
    if (this.world.isProtected(hit.x, hit.y, hit.z) || hit.block === B.BEDROCK) return;
    const def = BLOCKS[hit.block];
    // Blocks you placed yourself give their credits back; natural terrain doesn't.
    const mine = this.world.edits.get(World.index(hit.x, hit.y, hit.z)) === hit.block;
    this.world.set(hit.x, hit.y, hit.z, B.AIR);
    if (mine) {
      refund(blockCost(hit.block));
      this.emit('credits');
    }
    for (const s of this.systems) s.onEdit?.(hit.x, hit.y, hit.z);
    audio.breakBlock((def.sound ?? 'stone') as Material);
    const c = new THREE.Color(def.color);
    for (let i = 0; i < 16; i++) {
      this.solid.spawn({
        x: hit.x + 0.2 + Math.random() * 0.6, y: hit.y + 0.2 + Math.random() * 0.6, z: hit.z + 0.2 + Math.random() * 0.6,
        vx: (Math.random() - 0.5) * 4, vy: 1 + Math.random() * 3, vz: (Math.random() - 0.5) * 4,
        r: c.r * (0.8 + Math.random() * 0.3), g: c.g * (0.8 + Math.random() * 0.3), b: c.b * (0.8 + Math.random() * 0.3),
        size: 0.1 + Math.random() * 0.06, life: 0.9 + Math.random() * 0.5, gravity: 16, drag: 0.5, collide: true,
      });
    }
    this.scheduleSave();
  }

  placeBlock() {
    const hit = this.target();
    if (!hit) return;
    const it = this.interactableAt(hit.x, hit.y, hit.z);
    if (it && this.world.isProtected(hit.x, hit.y, hit.z)) {
      this.emit('interact', it);
      return;
    }
    const plantHit = BLOCKS[hit.block].shape === 'cross';
    const x = plantHit ? hit.x : hit.x + hit.nx, y = plantHit ? hit.y : hit.y + hit.ny, z = plantHit ? hit.z : hit.z + hit.nz;
    if (this.player.overlapsBlock(x, y, z) && BLOCKS[HOTBAR[this.hotbarIndex]].solid) return;
    const cur = this.world.get(x, y, z);
    if (cur !== B.AIR && cur !== B.WATER && BLOCKS[cur].shape !== 'cross') return;
    if (this.world.isProtected(x, y, z)) return;
    const cost = blockCost(HOTBAR[this.hotbarIndex]);
    if (!spend(cost)) {
      this.emit('needCredits', cost, credits());
      return;
    }
    this.emit('credits');
    this.world.set(x, y, z, HOTBAR[this.hotbarIndex]);
    for (const s of this.systems) s.onEdit?.(x, y, z);
    audio.place();
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

  toggleCamera() {
    updateSettings({ camera: this.cameraMode === 'first' ? 'third' : 'first' });
  }

  teleport(where: Place | string) {
    const station = STATIONS.find((s) => s.id === where || s.lessonId === where);
    const lab = LAB_SITES.find((l) => l.kind === where);
    if (station) {
      const site = SITE_BY_REALM.get(station.realm)!;
      const dx = site.x - station.x, dz = site.z - station.z;
      const len = Math.hypot(dx, dz) || 1;
      const x = station.x + 0.5 + (dx / len) * 3, z = station.z + 0.5 + (dz / len) * 3;
      this.player.teleport(x, GROUND + 1.01, z, Math.atan2(-(station.x + 0.5 - x), -(station.z + 0.5 - z)));
    } else if (lab) {
      this.player.teleport(lab.spawn.x, lab.floorY + 0.01, lab.spawn.z, lab.spawn.yaw, lab.spawn.pitch);
    } else if (where === 'playground') {
      this.player.teleport(PLAYGROUND.spawn.x, GROUND + 1.01, PLAYGROUND.spawn.z, PLAYGROUND.spawn.yaw);
    } else if (where === 'hub' || where === 'wilds') {
      this.player.teleport(HUB_SPAWN.x, GROUND + 1.01, HUB_SPAWN.z, HUB_SPAWN.yaw);
    } else {
      const site = SITE_BY_REALM.get(where as RealmId);
      if (!site) return;
      this.player.teleport(site.spawn.x, GROUND + 1.01, site.spawn.z, site.spawn.yaw);
    }
    this.player.flying = false;
    this.emit('fly', false);
    this.portalCooldown = 1.5;
  }

  /** Point the camera at a world position. */
  lookAt(x: number, y: number, z: number) {
    const e = this.player.eye();
    this.player.yaw = Math.atan2(-(x - e.x), -(z - e.z));
    this.player.pitch = Math.atan2(y - e.y, Math.hypot(x - e.x, z - e.z));
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
    const [fx, fz] = Math.abs(fx0) > Math.abs(fz0) ? [Math.sign(fx0), 0] : [0, Math.sign(fz0)];
    const rx = -fz, rz = fx;
    const ox = Math.floor(this.player.pos.x) + fx * 3;
    const oz = Math.floor(this.player.pos.z) + fz * 3;
    const oy = Math.floor(this.player.pos.y);
    return { ox, oy, oz, fx, fz, rx, rz };
  }

  /**
   * Apply learner-built ops and shapes (local coords: x = right, y = up, z = forward).
   * Costs block credits; refuses the whole build if there aren't enough.
   */
  build(ops: VoxelOp[], shapes: Prop[] = []): BuildResult {
    const f = this.buildFrame();
    const placed: QueuedOp[] = [];
    const prev: { x: number; y: number; z: number; prev: BlockId }[] = [];
    const seen = new Map<number, QueuedOp>();
    for (const o of ops) {
      const x = f.ox + o.x * f.rx + o.z * f.fx;
      const z = f.oz + o.x * f.rz + o.z * f.fz;
      const y = f.oy + o.y;
      if (!this.world.inBounds(x, y, z) || y === 0 || this.world.isProtected(x, y, z)) continue;
      const i = World.index(x, y, z);
      const existing = seen.get(i);
      if (existing) {
        existing.b = o.b;
        continue;
      }
      prev.push({ x, y, z, prev: this.world.get(x, y, z) });
      const op = { x, y, z, b: o.b, record: true };
      seen.set(i, op);
      placed.push(op);
    }
    // The local frame is mirrored (x = right, z = forward), so turns flip sign.
    const frameYaw = THREE.MathUtils.radToDeg(Math.atan2(f.fx, f.fz));
    const world: Prop[] = shapes.map((p) => ({
      ...p,
      x: f.ox + p.x * f.rx + p.z * f.fx,
      z: f.oz + p.x * f.rz + p.z * f.fz,
      y: f.oy + p.y,
      ry: frameYaw - p.ry,
    }));
    // placed[] and prev[] are filled in lockstep; unchanged cells and erasing (air) are free.
    const cost = placed.reduce((s, o, i) => s + (o.b !== prev[i].prev ? blockCost(o.b) : 0), 0) + world.reduce((s, p) => s + shapeCost(p), 0);
    if (!spend(cost)) {
      this.emit('needCredits', cost, credits());
      return { blocks: 0, shapes: 0, cost, short: cost - credits() };
    }
    this.lastBuild = prev;
    this.lastBuildCost = cost;
    placed.sort((a, b) => a.y - b.y);
    this.queue.push(...placed);
    const n = world.length ? this.props.add(world) : 0;
    this.emit('credits');
    return { blocks: placed.length, shapes: n, cost };
  }

  /** Undo the last code build (blocks and shapes) and refund its credits. */
  undoBuild(): number {
    const n = this.lastBuild.length;
    for (const c of this.lastBuild) this.queue.push({ x: c.x, y: c.y, z: c.z, b: c.prev, record: true });
    this.lastBuild = [];
    const shapes = this.props.undo();
    if (this.lastBuildCost) refund(this.lastBuildCost);
    this.lastBuildCost = 0;
    this.emit('credits');
    return n + shapes.length;
  }

  resetWorld() {
    localStorage.removeItem(SAVE_KEY);
    location.reload();
  }

  /** Cinematic letterbox bars (fraction of screen height each). */
  setLetterbox(v: number) {
    this.post.grade.uniforms.uBars.value = v;
  }

  /** Grab the current frame as a PNG data URL (photo mode). */
  screenshot(): string {
    if (this.post.enabled) this.post.render(0);
    else this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL('image/png');
  }

  // ------------------------------------------------------------------ persistence

  private scheduleSave() {
    if (this.saveTimer <= 0) this.saveTimer = 2;
  }

  private flushSave() {
    this.saveTimer = -2;
    try {
      const edits = this.world.serializeEdits();
      if (edits.length > 400_000) return;
      localStorage.setItem(SAVE_KEY, JSON.stringify(edits));
    } catch {
      /* storage full or unavailable — the world simply isn't saved */
    }
  }

  private loadEdits() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        this.world.applyEdits(JSON.parse(raw));
        this.world.relightAll();
      }
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
    this.input.sprint = k.has('ControlLeft') || (!this.player.flying && !this.player.inWater && this.input.descend);
  }

  private crosshairRay(): THREE.Ray {
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    return new THREE.Ray(this.camera.position.clone(), dir);
  }

  private bindInput() {
    const typing = () => {
      const a = document.activeElement as HTMLElement | null;
      return !!a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT' || a.isContentEditable);
    };

    window.addEventListener('keydown', (e) => {
      if (!this.running || typing() || e.metaKey || e.altKey || this.cinematic) return;
      if (document.querySelector('.panel.open, dialog[open]') && !this.locked) return;
      const code = e.code;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(code)) e.preventDefault();
      if (code === 'Space' && !e.repeat) {
        const now = performance.now();
        if (now - this.lastSpace < 280) this.toggleFly();
        else if (this.player.onGround) audio.jump();
        this.lastSpace = now;
      }
      if (code === 'KeyM' && e.shiftKey) {
        e.preventDefault();
        if (!e.repeat) this.setFreeCursor(!this.freeCursor);
        return;
      }
      this.keys.add(code);
      this.syncKeys();
      if (e.repeat) return;
      if (code === 'KeyE') this.interact();
      if (code === 'KeyF') this.toggleFly();
      if (code === 'KeyH') { audio.portal(); this.teleport('hub'); }
      if (code === 'KeyB') this.emit('builder');
      if (code === 'KeyG') this.emit('guide');
      if (code === 'KeyP') this.emit('photo');
      if (code === 'KeyV' || code === 'F5') { e.preventDefault(); this.toggleCamera(); }
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
      if (this.freeCursor && !this.locked && !this.cinematic) {
        this.aim = this.mouseRay(e);
        for (const s of this.systems) {
          if (s.pointer?.('down', e.button, this.aim)) {
            this.pointerDown = e.button;
            return;
          }
        }
        // Left: click to break, drag to turn the camera. Right: place. Middle: pick.
        if (e.button === 0) this.freeDrag = { x: e.clientX, y: e.clientY, moved: false };
        if (e.button === 2) this.placeBlock();
        if (e.button === 1) this.pickBlock();
        return;
      }
      if (!this.locked || this.cinematic) return;
      const ray = this.crosshairRay();
      for (const s of this.systems) {
        if (s.pointer?.('down', e.button, ray)) {
          this.pointerDown = e.button;
          return;
        }
      }
      if (e.button === 0) this.breakBlock();
      if (e.button === 2) this.placeBlock();
      if (e.button === 1) this.pickBlock();
    });
    window.addEventListener('mouseup', (e) => {
      if (this.freeDrag && e.button === 0) {
        const click = !this.freeDrag.moved;
        this.freeDrag = null;
        if (click && e.target === canvas) {
          this.aim = this.mouseRay(e);
          this.breakBlock();
        }
      }
      if (this.pointerDown < 0) return;
      const ray = this.pointerRay();
      for (const s of this.systems) s.pointer?.('up', e.button, ray);
      this.pointerDown = -1;
    });
    document.addEventListener('mousemove', (e) => {
      if (this.freeCursor && !this.locked) {
        const s = settings();
        if (this.freeDrag) {
          if (Math.hypot(e.clientX - this.freeDrag.x, e.clientY - this.freeDrag.y) > 4) this.freeDrag.moved = true;
          if (this.freeDrag.moved) this.player.look(e.movementX * 0.004 * s.sensitivity, e.movementY * 0.004 * s.sensitivity * (s.invertY ? -1 : 1));
        }
        if (e.target === canvas) {
          this.aim = this.mouseRay(e);
          if (this.pointerDown >= 0) for (const sys of this.systems) sys.pointer?.('move', this.pointerDown, this.aim);
        } else this.aim = null;
        return;
      }
      if (!this.locked) return;
      const s = settings();
      const k = 0.0022 * s.sensitivity;
      this.player.look(e.movementX * k, e.movementY * k * (s.invertY ? -1 : 1));
      if (this.pointerDown >= 0) {
        const ray = this.crosshairRay();
        for (const sys of this.systems) sys.pointer?.('move', this.pointerDown, ray);
      }
    });
    canvas.addEventListener('wheel', (e) => {
      if (!this.locked && !this.freeCursor) return;
      if (this.cameraMode === 'third' && e.shiftKey) {
        this.thirdDist = Math.max(2, Math.min(10, this.thirdDist + Math.sign(e.deltaY)));
        return;
      }
      this.selectHotbar(this.hotbarIndex + (e.deltaY > 0 ? 1 : -1));
    }, { passive: true });
    document.addEventListener('pointerlockchange', () => {
      if (this.locked && this.freeCursor) {
        this.freeCursor = false;
        this.aim = null;
        this.renderer.domElement.classList.remove('free-cursor');
        this.emit('cursor', false);
      }
      this.emit('lock', this.locked);
      if (!this.locked) {
        this.keys.clear();
        this.syncKeys();
      }
    });
  }

  /** Touch controls feed look deltas here. */
  lookBy(dx: number, dy: number) {
    this.player.look(dx, dy);
  }

  /** Data-URL icon for an atlas tile (hotbar / palette). */
  icon(tile: number): string {
    if (!this.icons.has(tile)) this.icons.set(tile, tileIcon(this.atlas, tile));
    return this.icons.get(tile)!;
  }

  dispose() {
    this.unsubSettings();
  }
}
