import * as THREE from 'three';
import type { World } from './world';

const HALF_W = 0.3;
const HEIGHT = 1.8;
const EYE = 1.62;
const GRAVITY = 28;
const JUMP = 8.6;
const WALK = 5.2;
const SPRINT = 8.5;
const FLY = 14;

export interface MoveInput {
  forward: number; // -1..1
  strafe: number; // -1..1
  jump: boolean;
  descend: boolean;
  sprint: boolean;
}

export class Player {
  readonly pos = new THREE.Vector3();
  readonly vel = new THREE.Vector3();
  yaw = 0;
  pitch = 0;
  onGround = false;
  flying = false;
  private wasGrounded = false;
  private world: World;

  constructor(world: World) {
    this.world = world;
  }

  eye(target = new THREE.Vector3()): THREE.Vector3 {
    return target.set(this.pos.x, this.pos.y + EYE, this.pos.z);
  }

  lookDir(target = new THREE.Vector3()): THREE.Vector3 {
    const cp = Math.cos(this.pitch);
    return target.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }

  look(dx: number, dy: number) {
    this.yaw -= dx;
    this.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.pitch - dy));
  }

  teleport(x: number, y: number, z: number, yaw?: number) {
    this.pos.set(x, y, z);
    this.vel.set(0, 0, 0);
    if (yaw !== undefined) this.yaw = yaw;
    this.pitch = -0.12;
  }

  private collides(px: number, py: number, pz: number): boolean {
    const x0 = Math.floor(px - HALF_W), x1 = Math.floor(px + HALF_W);
    const y0 = Math.floor(py), y1 = Math.floor(py + HEIGHT - 0.01);
    const z0 = Math.floor(pz - HALF_W), z1 = Math.floor(pz + HALF_W);
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++)
        for (let z = z0; z <= z1; z++) if (this.world.solidAt(x, y, z)) return true;
    return false;
  }

  /** Would a block at (x,y,z) overlap the player? Used to prevent placing blocks inside yourself. */
  overlapsBlock(x: number, y: number, z: number): boolean {
    return (
      x + 1 > this.pos.x - HALF_W && x < this.pos.x + HALF_W &&
      y + 1 > this.pos.y && y < this.pos.y + HEIGHT &&
      z + 1 > this.pos.z - HALF_W && z < this.pos.z + HALF_W
    );
  }

  update(dt: number, input: MoveInput) {
    const speed = this.flying ? FLY : input.sprint ? SPRINT : WALK;
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    // Forward is −Z rotated by yaw; strafe is +X rotated by yaw.
    let mx = -sin * input.forward + cos * input.strafe;
    let mz = -cos * input.forward - sin * input.strafe;
    const len = Math.hypot(mx, mz);
    if (len > 1) { mx /= len; mz /= len; }

    const accel = this.onGround || this.flying ? 14 : 4;
    const k = Math.min(1, accel * dt);
    this.vel.x += (mx * speed - this.vel.x) * k;
    this.vel.z += (mz * speed - this.vel.z) * k;

    if (this.flying) {
      const vy = (input.jump ? 1 : 0) - (input.descend ? 1 : 0);
      this.vel.y += (vy * speed - this.vel.y) * Math.min(1, 10 * dt);
    } else {
      this.vel.y -= GRAVITY * dt;
      if (input.jump && this.onGround) this.vel.y = JUMP;
      this.vel.y = Math.max(this.vel.y, -40);
    }

    this.wasGrounded = this.onGround;
    this.onGround = false;
    this.moveAxis('x', this.vel.x * dt);
    this.moveAxis('z', this.vel.z * dt);
    this.moveAxis('y', this.vel.y * dt);

    // Fell out of the world? Put the player back on top.
    if (this.pos.y < -10) {
      const x = Math.floor(this.pos.x), z = Math.floor(this.pos.z);
      this.teleport(this.pos.x, this.world.topY(x, z) + 1.01, this.pos.z);
    }
  }

  private moveAxis(axis: 'x' | 'y' | 'z', delta: number) {
    if (delta === 0) return;
    const steps = Math.ceil(Math.abs(delta) / 0.2);
    const d = delta / steps;
    for (let i = 0; i < steps; i++) {
      const prev = this.pos[axis];
      this.pos[axis] += d;
      if (!this.collides(this.pos.x, this.pos.y, this.pos.z)) continue;

      // Auto step-up for single-block ledges while walking.
      if (axis !== 'y' && this.wasGrounded && !this.flying) {
        const y = this.pos.y;
        this.pos.y = Math.floor(y) + 1.001;
        if (this.pos.y - y <= 1.01 && !this.collides(this.pos.x, this.pos.y, this.pos.z)) continue;
        this.pos.y = y;
      }

      this.pos[axis] = prev;
      if (axis === 'y') {
        if (d < 0) {
          this.onGround = true;
          // Snap down onto the block surface so we don't hover a fraction above it.
          const snapped = Math.floor(prev);
          if (!this.collides(this.pos.x, snapped, this.pos.z)) this.pos.y = snapped;
        }
        this.vel.y = 0;
      } else {
        this.vel[axis] = 0;
      }
      return;
    }
  }
}
