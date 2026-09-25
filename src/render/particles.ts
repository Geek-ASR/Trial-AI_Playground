import * as THREE from 'three';

/**
 * A pooled CPU particle system rendered as point sprites. One instance per
 * blend mode: `glow` (additive, soft, HDR colours for bloom) and `solid`
 * (opaque little cubes-looking squares for debris, leaves and confetti).
 */

export interface ParticleSpec {
  x: number; y: number; z: number;
  vx?: number; vy?: number; vz?: number;
  r: number; g: number; b: number;
  size?: number;
  life?: number;
  gravity?: number;
  drag?: number;
  /** Sideways flutter amplitude (leaves, snow). */
  flutter?: number;
  /** Fade in and out smoothly (fireflies). */
  blink?: boolean;
  /** Stop on solid ground instead of falling through. */
  collide?: boolean;
}

export class ParticleSystem {
  readonly points: THREE.Points;
  private n = 0;
  private readonly max: number;
  private pos: Float32Array;
  private col: Float32Array;
  private size: Float32Array;
  private alpha: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private age: Float32Array;
  private params: Float32Array; // gravity, drag, flutter, flags
  private seed: Float32Array;
  budget = 1;

  constructor(max: number, readonly mode: 'glow' | 'solid', private solidAt?: (x: number, y: number, z: number) => boolean) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.age = new Float32Array(max);
    this.params = new Float32Array(max * 4);
    this.seed = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    const glow = mode === 'glow';
    const m = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: !glow,
      blending: glow ? THREE.AdditiveBlending : THREE.NormalBlending,
      fog: true,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uScale: { value: 600 } }]),
      vertexShader: /* glsl */ `
        attribute vec3 aColor;
        attribute float aSize;
        attribute float aAlpha;
        uniform float uScale;
        varying vec3 vColor;
        varying float vAlpha;
        #include <common>
        #include <fog_pars_vertex>
        void main() {
          vColor = aColor;
          vAlpha = aAlpha;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          gl_PointSize = aSize * uScale / max(0.1, -mvPosition.z);
          #include <fog_vertex>
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vColor;
        varying float vAlpha;
        #include <common>
        #include <fog_pars_fragment>
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          ${glow
            ? 'float a = smoothstep(0.5, 0.05, length(c)) * vAlpha; gl_FragColor = vec4(vColor, a);'
            : 'if (max(abs(c.x), abs(c.y)) > 0.42) discard; float e = max(abs(c.x), abs(c.y)) > 0.3 ? 0.78 : 1.0; gl_FragColor = vec4(vColor * e, vAlpha); if (vAlpha < 0.02) discard;'}
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }
      `,
    });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
    this.points.renderOrder = glow ? 5 : 1;
  }

  setViewportScale(heightPx: number, fovDeg: number) {
    (this.points.material as THREE.ShaderMaterial).uniforms.uScale.value = heightPx / (2 * Math.tan((fovDeg * Math.PI) / 360));
  }

  get count() {
    return this.n;
  }

  spawn(p: ParticleSpec): boolean {
    if (this.n >= this.max * this.budget) return false;
    const i = this.n++;
    this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
    this.vel[i * 3] = p.vx ?? 0; this.vel[i * 3 + 1] = p.vy ?? 0; this.vel[i * 3 + 2] = p.vz ?? 0;
    this.col[i * 3] = p.r; this.col[i * 3 + 1] = p.g; this.col[i * 3 + 2] = p.b;
    this.size[i] = p.size ?? 0.15;
    this.alpha[i] = p.blink ? 0 : 1;
    this.life[i] = p.life ?? 1;
    this.age[i] = 0;
    this.params[i * 4] = p.gravity ?? 0;
    this.params[i * 4 + 1] = p.drag ?? 0;
    this.params[i * 4 + 2] = p.flutter ?? 0;
    this.params[i * 4 + 3] = (p.blink ? 1 : 0) + (p.collide ? 2 : 0);
    this.seed[i] = Math.random() * 100;
    return true;
  }

  update(dt: number, time: number) {
    let i = 0;
    while (i < this.n) {
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) {
        this.kill(i);
        continue;
      }
      const g = this.params[i * 4], drag = this.params[i * 4 + 1], flutter = this.params[i * 4 + 2], flags = this.params[i * 4 + 3];
      const k = Math.max(0, 1 - drag * dt);
      this.vel[i * 3] *= k;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * k - g * dt;
      this.vel[i * 3 + 2] *= k;
      let dx = this.vel[i * 3] * dt, dz = this.vel[i * 3 + 2] * dt;
      const dy = this.vel[i * 3 + 1] * dt;
      if (flutter) {
        const s = this.seed[i];
        dx += Math.sin(time * 2.1 + s) * flutter * dt;
        dz += Math.cos(time * 1.7 + s * 1.3) * flutter * dt;
      }
      const nx = this.pos[i * 3] + dx, ny = this.pos[i * 3 + 1] + dy, nz = this.pos[i * 3 + 2] + dz;
      if (flags & 2 && this.solidAt && this.solidAt(nx, ny, nz)) {
        this.vel[i * 3] = this.vel[i * 3 + 1] = this.vel[i * 3 + 2] = 0;
        this.params[i * 4] = 0;
        this.params[i * 4 + 2] = 0;
      } else {
        this.pos[i * 3] = nx; this.pos[i * 3 + 1] = ny; this.pos[i * 3 + 2] = nz;
      }
      const t = this.age[i] / this.life[i];
      if (flags & 1) {
        this.alpha[i] = Math.sin(t * Math.PI) * (0.55 + 0.45 * Math.sin(time * 6 + this.seed[i] * 7));
      } else {
        this.alpha[i] = t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1;
      }
      i++;
    }
    const g = this.points.geometry;
    g.setDrawRange(0, this.n);
    for (const name of ['position', 'aColor', 'aSize', 'aAlpha']) (g.getAttribute(name) as THREE.BufferAttribute).needsUpdate = true;
  }

  /** Swap the last particle into slot i. */
  private kill(i: number) {
    const last = --this.n;
    if (i === last) return;
    for (let k = 0; k < 3; k++) {
      this.pos[i * 3 + k] = this.pos[last * 3 + k];
      this.vel[i * 3 + k] = this.vel[last * 3 + k];
      this.col[i * 3 + k] = this.col[last * 3 + k];
    }
    for (let k = 0; k < 4; k++) this.params[i * 4 + k] = this.params[last * 4 + k];
    this.size[i] = this.size[last];
    this.alpha[i] = this.alpha[last];
    this.life[i] = this.life[last];
    this.age[i] = this.age[last];
    this.seed[i] = this.seed[last];
  }

  clear() {
    this.n = 0;
  }
}

/** A firework: a rising rocket that bursts into HDR sparks. */
export function firework(glow: ParticleSystem, x: number, y: number, z: number, color: THREE.Color, height = 14) {
  const t = height / 16;
  glow.spawn({ x, y, z, vy: 16, r: 3, g: 2.6, b: 2, size: 0.25, life: t, drag: 0.4 });
  // Trail + burst are scheduled via the rocket's life; simpler: emit the burst directly after a delay.
  setTimeout(() => {
    const n = 110;
    for (let i = 0; i < n; i++) {
      const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, k = Math.sqrt(1 - u * u);
      const sp = 7 + Math.random() * 5;
      const c = Math.random() < 0.25 ? new THREE.Color(1, 0.9, 0.6) : color;
      glow.spawn({
        x, y: y + height, z,
        vx: Math.cos(a) * k * sp, vy: u * sp + 2, vz: Math.sin(a) * k * sp,
        r: c.r * 4, g: c.g * 4, b: c.b * 4,
        size: 0.22 + Math.random() * 0.12, life: 1.2 + Math.random() * 0.8, gravity: 7, drag: 1.6,
      });
    }
  }, t * 1000);
}
