import * as THREE from 'three';
import { B } from './blocks';
import { SX, SZ } from './layout';
import type { World } from './world';

const HALF_W = 0.3;
const HEIGHT = 1.8;
export const EYE = 1.62;
const GRAVITY = 28;
const JUMP = 8.6;
const WALK = 5.2;
const SPRINT = 8.5;
const FLY = 14;
const SWIM = 3.2;

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
  inWater = false;
  headUnderwater = false;
  /** Distance walked on the ground (drives footsteps and head bob). */
  stride = 0;
  /** Impact speed of the last landing, consumed by the engine for sound and camera dip. */
  landed = 0;
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

  teleport(x: number, y: number, z: number, yaw?: number, pitch = -0.12) {
    this.pos.set(x, y, z);
    this.vel.set(0, 0, 0);
    if (yaw !== undefined) this.yaw = yaw;
    this.pitch = pitch;
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
    const w = this.world;
    this.inWater = w.get(Math.floor(this.pos.x), Math.floor(this.pos.y + 0.4), Math.floor(this.pos.z)) === B.WATER;
    this.headUnderwater = w.get(Math.floor(this.pos.x), Math.floor(this.pos.y + EYE), Math.floor(this.pos.z)) === B.WATER;
    const swimming = this.inWater && !this.flying;

    const speed = this.flying ? FLY : swimming ? SWIM * (input.sprint ? 1.5 : 1) : input.sprint ? SPRINT : WALK;
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    // Forward is −Z rotated by yaw; strafe is +X rotated by yaw.
    let mx = -sin * input.forward + cos * input.strafe;
    let mz = -cos * input.forward - sin * input.strafe;
    const len = Math.hypot(mx, mz);
    if (len > 1) { mx /= len; mz /= len; }

    const accel = this.onGround || this.flying ? 14 : swimming ? 6 : 4;
    const k = Math.min(1, accel * dt);
    this.vel.x += (mx * speed - this.vel.x) * k;
    this.vel.z += (mz * speed - this.vel.z) * k;

    if (this.flying) {
      const vy = (input.jump ? 1 : 0) - (input.descend ? 1 : 0);
      this.vel.y += (vy * speed - this.vel.y) * Math.min(1, 10 * dt);
    } else if (swimming) {
      // Buoyancy: gentle sinking, Space swims up, Shift dives.
      const target = input.jump ? 3.6 : input.descend ? -3.2 : -0.9;
      this.vel.y += (target - this.vel.y) * Math.min(1, 4 * dt);
      // Hop out onto the bank when swimming against a ledge.
      if (input.jump && !this.headUnderwater) this.vel.y = Math.max(this.vel.y, 4.2);
    } else {
      this.vel.y -= GRAVITY * dt;
      if (input.jump && this.onGround) this.vel.y = JUMP;
      this.vel.y = Math.max(this.vel.y, -40);
    }

    const fallSpeed = -this.vel.y;
    this.wasGrounded = this.onGround;
    this.onGround = false;
    this.moveAxis('x', this.vel.x * dt);
    this.moveAxis('z', this.vel.z * dt);
    this.moveAxis('y', this.vel.y * dt);
    if (this.onGround && !this.wasGrounded && fallSpeed > 6) this.landed = fallSpeed;
    if (this.onGround) this.stride += Math.hypot(this.vel.x, this.vel.z) * dt;

    // World border: the sea around the island is as far as you can go.
    this.pos.x = Math.max(2, Math.min(SX - 2, this.pos.x));
    this.pos.z = Math.max(2, Math.min(SZ - 2, this.pos.z));

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
      if (axis !== 'y' && (this.wasGrounded || this.inWater) && !this.flying) {
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
