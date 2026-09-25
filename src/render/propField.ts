import * as THREE from 'three';
import { SHAPE_KINDS, type Prop, type ShapeKind } from '../world/shapes';

const SAVE_KEY = 'nc.props.v1';
const MAX_PROPS = 6000;

/** Unit-sized geometries (1 × 1 × 1 bounding box) centred on the origin. */
function makeGeometries(): Record<ShapeKind, THREE.BufferGeometry> {
  const wedgeShape = new THREE.Shape([new THREE.Vector2(-0.5, -0.5), new THREE.Vector2(0.5, -0.5), new THREE.Vector2(-0.5, 0.5)]);
  const wedge = new THREE.ExtrudeGeometry(wedgeShape, { depth: 1, bevelEnabled: false }).translate(0, 0, -0.5);
  const capsule = new THREE.CapsuleGeometry(0.3, 0.4, 8, 20);
  capsule.scale(1 / 0.6, 1, 1 / 0.6);
  const dome = new THREE.SphereGeometry(0.5, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 2, 1).translate(0, -0.5, 0);
  // A flat ring 1 wide; its height scales the tube thickness.
  const torus = new THREE.TorusGeometry(0.36, 0.14, 16, 40).rotateX(Math.PI / 2);
  const g: Record<ShapeKind, THREE.BufferGeometry> = {
    box: new THREE.BoxGeometry(1, 1, 1),
    sphere: new THREE.SphereGeometry(0.5, 32, 20),
    cylinder: new THREE.CylinderGeometry(0.5, 0.5, 1, 32),
    cone: new THREE.ConeGeometry(0.5, 1, 32),
    pyramid: new THREE.ConeGeometry(Math.SQRT1_2, 1, 4).rotateY(Math.PI / 4),
    torus,
    capsule,
    dome,
    wedge,
  };
  for (const k of SHAPE_KINDS) g[k].computeVertexNormals();
  return g;
}

interface Entry { prop: Prop; mesh: THREE.Mesh }

/**
 * Renders and remembers shapes built with code. Shapes are decorative: you can
 * walk through them, click them to remove them, and they persist in the browser.
 */
export class PropField {
  readonly group = new THREE.Group();
  private geos = makeGeometries();
  private mats = new Map<string, THREE.MeshStandardMaterial>();
  private entries: Entry[] = [];
  private lastBuild: Entry[] = [];
  private saveTimer = 0;

  constructor(scene: THREE.Scene) {
    this.group.name = 'props';
    scene.add(this.group);
    this.load();
  }

  get count(): number {
    return this.entries.length;
  }

  private material(color: string, glow: boolean) {
    const key = color + (glow ? '*' : '');
    let m = this.mats.get(key);
    if (!m) {
      const c = new THREE.Color(color);
      m = new THREE.MeshStandardMaterial({ color: c, roughness: glow ? 0.35 : 0.55, metalness: 0.08, emissive: glow ? c : new THREE.Color(0), emissiveIntensity: glow ? 1.6 : 0 });
      this.mats.set(key, m);
    }
    return m;
  }

  private make(p: Prop): Entry {
    const mesh = new THREE.Mesh(this.geos[p.kind], this.material(p.color, p.glow));
    mesh.position.set(p.x + 0.5, p.y + p.sy / 2, p.z + 0.5);
    mesh.rotation.set(THREE.MathUtils.degToRad(p.rx), THREE.MathUtils.degToRad(p.ry), THREE.MathUtils.degToRad(p.rz), 'YXZ');
    mesh.scale.set(p.sx, p.sy, p.sz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.prop = p;
    this.group.add(mesh);
    return { prop: p, mesh };
  }

  /** Add shapes (world coordinates). Returns how many were added. */
  add(props: Prop[]): number {
    const room = Math.max(0, MAX_PROPS - this.entries.length);
    const added = props.slice(0, room).map((p) => this.make(p));
    this.entries.push(...added);
    this.lastBuild = added;
    this.scheduleSave();
    return added.length;
  }

  /** Remove the shapes from the most recent build; returns them (for refunds). */
  undo(): Prop[] {
    const gone = this.lastBuild;
    this.lastBuild = [];
    gone.forEach((e) => this.detach(e));
    this.scheduleSave();
    return gone.map((e) => e.prop);
  }

  private detach(e: Entry) {
    this.group.remove(e.mesh);
    this.entries = this.entries.filter((x) => x !== e);
  }

  /** Nearest shape along a ray within `max` distance. */
  pick(ray: THREE.Ray, max: number): { prop: Prop; distance: number } | null {
    const rc = new THREE.Raycaster(ray.origin, ray.direction, 0, max);
    const hit = rc.intersectObjects(this.group.children, false)[0];
    return hit ? { prop: hit.object.userData.prop as Prop, distance: hit.distance } : null;
  }

  remove(p: Prop): boolean {
    const e = this.entries.find((x) => x.prop === p);
    if (!e) return false;
    this.detach(e);
    this.lastBuild = this.lastBuild.filter((x) => x !== e);
    this.scheduleSave();
    return true;
  }

  clear() {
    [...this.entries].forEach((e) => this.detach(e));
    this.lastBuild = [];
    this.scheduleSave();
  }

  private scheduleSave() {
    clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => {
      try {
        localStorage.setItem(SAVE_KEY, JSON.stringify(this.entries.map((e) => e.prop)));
      } catch { /* storage full or disabled: shapes stay for this session */ }
    }, 600);
  }

  private load() {
    try {
      const raw = JSON.parse(localStorage.getItem(SAVE_KEY) ?? '[]') as Prop[];
      if (!Array.isArray(raw)) return;
      for (const p of raw.slice(0, MAX_PROPS)) {
        if (!p || !SHAPE_KINDS.includes(p.kind)) continue;
        this.entries.push(this.make(p));
      }
    } catch { /* ignore a corrupt save */ }
  }
}
