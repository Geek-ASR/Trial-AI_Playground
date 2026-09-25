import * as THREE from 'three';

/**
 * Blocky 3-D clouds: a grid of 12×12-block cells, each either cloud or sky,
 * extruded 4 blocks thick. The mesh is rebuilt when the player or the wind has
 * moved the pattern by a whole cell; in between it slides smoothly.
 */

const CELL = 12;
const GRID = 56; // cells per side (672 blocks)
const HEIGHT = 108;
const THICK = 4;

function hash(x: number, z: number) {
  let h = Math.imul(x, 374761393) ^ Math.imul(z, 668265263) ^ 0x5bd1e995;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function noise(x: number, z: number) {
  const x0 = Math.floor(x), z0 = Math.floor(z);
  const fx = x - x0, fz = z - z0;
  const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  const a = hash(x0, z0), b = hash(x0 + 1, z0), c = hash(x0, z0 + 1), d = hash(x0 + 1, z0 + 1);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}
function cloudiness(cx: number, cz: number) {
  return noise(cx * 0.19, cz * 0.19) * 0.65 + noise(cx * 0.5 + 40, cz * 0.5) * 0.35;
}

export class Clouds {
  readonly mesh: THREE.Mesh;
  private material: THREE.ShaderMaterial;
  private originX = Number.NaN;
  private originZ = Number.NaN;
  private coverage = 0.5;
  private builtCoverage = -1;
  private wind = 0;

  constructor() {
    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      fog: false,
      side: THREE.FrontSide,
      uniforms: {
        uColor: { value: new THREE.Color(1, 1, 1) },
        uShade: { value: new THREE.Color(0.8, 0.84, 0.92) },
        uOpacity: { value: 0.85 },
        uCenter: { value: new THREE.Vector2() },
        uFade: { value: (GRID * CELL) / 2 - 40 },
      },
      vertexShader: /* glsl */ `
        attribute float aShade;
        varying float vShade;
        varying vec2 vXZ;
        void main() {
          vShade = aShade;
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vXZ = wp.xz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor, uShade;
        uniform float uOpacity, uFade;
        uniform vec2 uCenter;
        varying float vShade;
        varying vec2 vXZ;
        void main() {
          float d = length(vXZ - uCenter);
          float a = uOpacity * (1.0 - smoothstep(uFade * 0.55, uFade, d));
          gl_FragColor = vec4(mix(uShade, uColor, vShade), a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    });
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
  }

  setWeather(overcast: number) {
    this.coverage = 0.46 - overcast * 0.3;
  }

  update(dt: number, focus: THREE.Vector3, light: THREE.Color, ambient: THREE.Color, overcast: number) {
    this.wind += dt * 1.6;
    const ox = Math.floor((focus.x + this.wind) / CELL) - GRID / 2;
    const oz = Math.floor(focus.z / CELL) - GRID / 2;
    if (ox !== this.originX || oz !== this.originZ || Math.abs(this.coverage - this.builtCoverage) > 0.02) {
      this.originX = ox;
      this.originZ = oz;
      this.rebuild();
    }
    this.mesh.position.set(-this.wind, 0, 0);
    const u = this.material.uniforms;
    u.uCenter.value.set(focus.x, focus.z);
    const lit = (u.uColor.value as THREE.Color).copy(ambient).multiplyScalar(0.9).add(light.clone().multiplyScalar(0.28));
    lit.lerp(new THREE.Color(0.55, 0.57, 0.62), overcast * 0.6);
    (u.uShade.value as THREE.Color).copy(lit).multiplyScalar(0.72 - overcast * 0.2);
    u.uOpacity.value = 0.82 + overcast * 0.15;
  }

  private rebuild() {
    this.builtCoverage = this.coverage;
    const filled = (i: number, j: number) => cloudiness(this.originX + i, this.originZ + j) > 1 - this.coverage;
    const pos: number[] = [];
    const shade: number[] = [];
    const idx: number[] = [];
    const quad = (a: number[], b: number[], c: number[], d: number[], s: number) => {
      const base = pos.length / 3;
      pos.push(...a, ...b, ...c, ...d);
      shade.push(s, s, s, s);
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    };
    for (let i = 0; i < GRID; i++) {
      for (let j = 0; j < GRID; j++) {
        if (!filled(i, j)) continue;
        const x0 = (this.originX + i) * CELL, x1 = x0 + CELL;
        const z0 = (this.originZ + j) * CELL, z1 = z0 + CELL;
        const y0 = HEIGHT, y1 = HEIGHT + THICK;
        quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], 1); // top
        quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], 0.05); // bottom
        if (!filled(i + 1, j)) quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], 0.55);
        if (!filled(i - 1, j)) quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], 0.55);
        if (!filled(i, j + 1)) quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], 0.4);
        if (!filled(i, j - 1)) quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], 0.4);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aShade', new THREE.Float32BufferAttribute(shade, 1));
    g.setIndex(idx);
    this.mesh.geometry.dispose();
    this.mesh.geometry = g;
  }
}
