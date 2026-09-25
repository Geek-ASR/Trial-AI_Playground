import * as THREE from 'three';

/** A blocky explorer shown in third-person view, with walk, swim, fly and idle animation. */
export class Avatar {
  readonly group = new THREE.Group();
  private head: THREE.Mesh;
  private body: THREE.Mesh;
  private armL: THREE.Group;
  private armR: THREE.Group;
  private legL: THREE.Group;
  private legR: THREE.Group;
  private phase = 0;

  constructor() {
    const skin = new THREE.MeshLambertMaterial({ color: 0xd9a47a });
    const shirt = new THREE.MeshLambertMaterial({ color: 0x1fb6c1 });
    const pants = new THREE.MeshLambertMaterial({ color: 0x243b6b });
    const face = new THREE.MeshLambertMaterial({ map: faceTexture() });
    const hair = new THREE.MeshLambertMaterial({ color: 0x3a2618 });

    // The player looks down −Z, so the face goes on the −Z side (material index 5).
    const headGeo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    this.head = new THREE.Mesh(headGeo, [skin, skin, hair, skin, skin, face]);
    this.head.position.y = 1.55;
    this.body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.26), shirt);
    this.body.position.y = 0.98;
    const limb = (mat: THREE.Material, w: number, h: number, x: number, y: number) => {
      const g = new THREE.Group();
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), mat);
      m.position.y = -h / 2;
      g.add(m);
      g.position.set(x, y, 0);
      return g;
    };
    this.armL = limb(shirt, 0.22, 0.68, -0.36, 1.32);
    this.armR = limb(shirt, 0.22, 0.68, 0.36, 1.32);
    // Hands.
    for (const arm of [this.armL, this.armR]) {
      const hand = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.14, 0.2), skin);
      hand.position.y = -0.72;
      arm.add(hand);
    }
    this.legL = limb(pants, 0.24, 0.66, -0.13, 0.66);
    this.legR = limb(pants, 0.24, 0.66, 0.13, 0.66);
    // Backpack with a glowing neural-net emblem.
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.42, 0.14), new THREE.MeshLambertMaterial({ color: 0x8e4ec6 }));
    pack.position.set(0, 1.02, 0.2);
    const gem = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.02), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 3, 3.2) }));
    gem.position.set(0, 1.06, 0.28);
    this.group.add(this.head, this.body, this.armL, this.armR, this.legL, this.legR, pack, gem);
    this.group.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    this.group.visible = false;
    // Yaw first, then lean forward around the body's own X axis (swimming, flying).
    this.group.rotation.order = 'YXZ';
  }

  update(dt: number, pos: THREE.Vector3, yaw: number, pitch: number, speed: number, onGround: boolean, swimming: boolean, flying: boolean) {
    this.group.position.copy(pos);
    this.group.rotation.y = yaw;
    this.head.rotation.x = pitch * 0.6;
    const moving = Math.min(1, speed / 5);
    this.phase += dt * (4 + speed * 1.4) * (moving > 0.05 ? 1 : 0.2);
    let swing = Math.sin(this.phase) * 0.9 * moving;
    if (swimming) swing = Math.sin(this.phase * 0.7) * 0.6;
    if (flying) swing = Math.sin(this.phase * 0.3) * 0.15;
    this.armL.rotation.x = swing;
    this.armR.rotation.x = -swing;
    this.legL.rotation.x = -swing;
    this.legR.rotation.x = swing;
    const idle = Math.sin(this.phase * 0.5) * 0.04 * (1 - moving);
    this.armL.rotation.z = -0.06 - idle - (flying ? 0.5 : 0);
    this.armR.rotation.z = 0.06 + idle + (flying ? 0.5 : 0);
    if (!onGround && !swimming && !flying) {
      this.armL.rotation.x = -1.2;
      this.armR.rotation.x = -1.2;
    }
    this.body.position.y = 0.98 + Math.abs(Math.sin(this.phase)) * 0.04 * moving;
    this.group.rotation.x = swimming ? -0.9 : flying ? -0.25 * moving : 0;
  }
}

function faceTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 8;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#d9a47a';
  ctx.fillRect(0, 0, 8, 8);
  ctx.fillStyle = '#3a2618';
  ctx.fillRect(0, 0, 8, 2);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(1, 3, 2, 1);
  ctx.fillRect(5, 3, 2, 1);
  ctx.fillStyle = '#2b5dab';
  ctx.fillRect(2, 3, 1, 1);
  ctx.fillRect(5, 3, 1, 1);
  ctx.fillStyle = '#9b5a40';
  ctx.fillRect(3, 6, 2, 1);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
