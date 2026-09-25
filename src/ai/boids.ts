/**
 * Boids (Craig Reynolds, 1986): flocking that emerges from three local rules —
 * separation, alignment and cohesion — plus terrain avoidance, a roaming goal
 * and, optionally, a predator (you) to flee from.
 */

export interface BoidParams {
  separation: number;
  alignment: number;
  cohesion: number;
  /** How far a bird can see its neighbours. */
  radius: number;
  sepRadius: number;
  maxSpeed: number;
  minSpeed: number;
  maxForce: number;
}

export const DEFAULT_BOIDS: BoidParams = {
  separation: 1.7,
  alignment: 1.0,
  cohesion: 0.9,
  radius: 9,
  sepRadius: 2.6,
  maxSpeed: 15,
  minSpeed: 6,
  maxForce: 14,
};

export interface BoidEnv {
  ground(x: number, z: number): number;
  minAlt: number;
  maxAlt: number;
  bounds: [number, number, number, number];
  predator?: { x: number; y: number; z: number } | null;
  predatorRadius?: number;
}

export class Flock {
  readonly pos: Float32Array;
  readonly vel: Float32Array;
  readonly target = { x: 0, y: 0, z: 0 };
  private retarget = 0;
  private grid = new Map<number, number[]>();

  constructor(readonly n: number, cx: number, cy: number, cz: number, private rnd: () => number = Math.random) {
    this.pos = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      this.pos[i * 3] = cx + (rnd() - 0.5) * 20;
      this.pos[i * 3 + 1] = cy + (rnd() - 0.5) * 6;
      this.pos[i * 3 + 2] = cz + (rnd() - 0.5) * 20;
      const a = rnd() * Math.PI * 2;
      this.vel[i * 3] = Math.cos(a) * 8;
      this.vel[i * 3 + 2] = Math.sin(a) * 8;
    }
    this.target.x = cx; this.target.y = cy; this.target.z = cz;
  }

  /** How aligned the flock is: 1 = all flying the same way, ~0 = random. */
  order(): number {
    let sx = 0, sy = 0, sz = 0;
    for (let i = 0; i < this.n; i++) {
      const vx = this.vel[i * 3], vy = this.vel[i * 3 + 1], vz = this.vel[i * 3 + 2];
      const l = Math.hypot(vx, vy, vz) || 1;
      sx += vx / l; sy += vy / l; sz += vz / l;
    }
    return Math.hypot(sx, sy, sz) / this.n;
  }

  step(dt: number, p: BoidParams, env: BoidEnv) {
    const { n, pos, vel } = this;
    const cell = Math.max(1, p.radius);
    const key = (x: number, y: number, z: number) => (Math.floor(x / cell) * 73856093) ^ (Math.floor(y / cell) * 19349663) ^ (Math.floor(z / cell) * 83492791);
    this.grid.clear();
    for (let i = 0; i < n; i++) {
      const k = key(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
      let list = this.grid.get(k);
      if (!list) this.grid.set(k, (list = []));
      list.push(i);
    }

    this.retarget -= dt;
    const [x0, x1, z0, z1] = env.bounds;
    if (this.retarget <= 0) {
      this.retarget = 12 + this.rnd() * 14;
      this.target.x = x0 + 30 + this.rnd() * (x1 - x0 - 60);
      this.target.z = z0 + 30 + this.rnd() * (z1 - z0 - 60);
      this.target.y = env.minAlt + this.rnd() * (env.maxAlt - env.minAlt) * 0.6;
    }

    const r2 = p.radius * p.radius, s2 = p.sepRadius * p.sepRadius;
    for (let i = 0; i < n; i++) {
      const px = pos[i * 3], py = pos[i * 3 + 1], pz = pos[i * 3 + 2];
      let ax = 0, ay = 0, az = 0; // alignment
      let cx = 0, cy = 0, cz = 0; // cohesion
      let sx = 0, sy = 0, sz = 0; // separation
      let count = 0;
      for (let ox = -1; ox <= 1; ox++)
        for (let oy = -1; oy <= 1; oy++)
          for (let oz = -1; oz <= 1; oz++) {
            const list = this.grid.get(key(px + ox * cell, py + oy * cell, pz + oz * cell));
            if (!list) continue;
            for (const j of list) {
              if (j === i) continue;
              const dx = pos[j * 3] - px, dy = pos[j * 3 + 1] - py, dz = pos[j * 3 + 2] - pz;
              const d2 = dx * dx + dy * dy + dz * dz;
              if (d2 > r2) continue;
              count++;
              ax += vel[j * 3]; ay += vel[j * 3 + 1]; az += vel[j * 3 + 2];
              cx += dx; cy += dy; cz += dz;
              if (d2 < s2 && d2 > 1e-6) {
                sx -= dx / d2; sy -= dy / d2; sz -= dz / d2;
              }
            }
          }
      let fx = 0, fy = 0, fz = 0;
      if (count) {
        fx += (ax / count - vel[i * 3]) * p.alignment + (cx / count) * p.cohesion * 0.6 + sx * p.separation * 6;
        fy += (ay / count - vel[i * 3 + 1]) * p.alignment + (cy / count) * p.cohesion * 0.6 + sy * p.separation * 6;
        fz += (az / count - vel[i * 3 + 2]) * p.alignment + (cz / count) * p.cohesion * 0.6 + sz * p.separation * 6;
      }
      // Gentle pull towards the flock's roaming goal.
      fx += (this.target.x - px) * 0.02;
      fy += (this.target.y - py) * 0.04;
      fz += (this.target.z - pz) * 0.02;
      // Stay above the terrain and below the ceiling.
      const ground = env.ground(px, pz) + env.minAlt * 0.5;
      if (py < ground + 6) fy += (ground + 6 - py) * 3;
      if (py > env.maxAlt) fy -= (py - env.maxAlt) * 2;
      // Stay inside the world.
      if (px < x0 + 20) fx += (x0 + 20 - px) * 0.8;
      if (px > x1 - 20) fx -= (px - x1 + 20) * 0.8;
      if (pz < z0 + 20) fz += (z0 + 20 - pz) * 0.8;
      if (pz > z1 - 20) fz -= (pz - z1 + 20) * 0.8;
      // Flee the predator.
      if (env.predator) {
        const dx = px - env.predator.x, dy = py - env.predator.y, dz = pz - env.predator.z;
        const d = Math.hypot(dx, dy, dz);
        const R = env.predatorRadius ?? 14;
        if (d < R && d > 0.01) {
          const k = ((R - d) / R) * 60;
          fx += (dx / d) * k; fy += (dy / d) * k; fz += (dz / d) * k;
        }
      }
      const fl = Math.hypot(fx, fy, fz);
      if (fl > p.maxForce) { fx *= p.maxForce / fl; fy *= p.maxForce / fl; fz *= p.maxForce / fl; }
      let vx = vel[i * 3] + fx * dt, vy = vel[i * 3 + 1] + fy * dt, vz = vel[i * 3 + 2] + fz * dt;
      const sp = Math.hypot(vx, vy, vz) || 1;
      const clamped = Math.max(p.minSpeed, Math.min(p.maxSpeed, sp));
      vx *= clamped / sp; vy *= clamped / sp; vz *= clamped / sp;
      vel[i * 3] = vx; vel[i * 3 + 1] = vy; vel[i * 3 + 2] = vz;
    }
    for (let i = 0; i < n * 3; i++) pos[i] += vel[i] * dt;
  }
}
