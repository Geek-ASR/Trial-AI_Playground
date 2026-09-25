import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import type { SharedUniforms } from './materials';

/**
 * Time of day, sky, sun/moon light, stars and fog.
 * time ∈ [0, 1): 0 = midnight, 0.25 = sunrise, 0.5 = noon, 0.75 = sunset.
 */

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

const C = (h: number) => new THREE.Color(h);
// Palette keyed by how high the sun is (night → twilight → golden → day).
const FOG = { night: C(0x0a1024), twilight: C(0x3b2f58), golden: C(0xf0a070), day: C(0xa9d2f2) };
const AMBIENT = { night: C(0x1b2440), twilight: C(0x524468), golden: C(0x8a7468), day: C(0x8697b3) };
const HORIZON = { night: C(0x0c1430), twilight: C(0x6a4a70), golden: C(0xffb080), day: C(0xb8dcf5) };
const ZENITH = { night: C(0x02040c), twilight: C(0x1c2250), golden: C(0x4a6aa8), day: C(0x3f7fd8) };

function palette(p: { night: THREE.Color; twilight: THREE.Color; golden: THREE.Color; day: THREE.Color }, e: number, out: THREE.Color) {
  // e = sun elevation (sin of altitude), −1 … 1
  if (e < -0.18) return out.copy(p.night);
  if (e < -0.02) return out.copy(p.night).lerp(p.twilight, smooth(-0.18, -0.02, e));
  if (e < 0.1) return out.copy(p.twilight).lerp(p.golden, smooth(-0.02, 0.1, e));
  return out.copy(p.golden).lerp(p.day, smooth(0.1, 0.4, e));
}

export class SkySystem {
  readonly sky = new Sky();
  readonly sun = new THREE.DirectionalLight(0xffffff, 3);
  readonly hemi = new THREE.HemisphereLight(0xbfd8ff, 0x4a4030, 0.9);
  readonly stars: THREE.Points;
  readonly moon: THREE.Sprite;
  time = 0.3;
  dayLengthSec = 20 * 60;
  paused = false;
  /** 0 clear … 1 storm; set by the weather system. */
  overcast = 0;
  lightning = 0;
  readonly sunDir = new THREE.Vector3();
  readonly fogColor = new THREE.Color();
  daylight = 1;
  night = 0;
  elevation = 0.5;
  private tmp = new THREE.Color();
  private shadowRadius = 64;

  constructor(scene: THREE.Scene, private shared: SharedUniforms) {
    this.sky.scale.setScalar(1800);
    const u = this.sky.material.uniforms;
    // The Preetham sky is physically bright (meant for exposure ≈ 0.5); scale it so
    // only the sun disc exceeds 1.0 and blooms. Its built-in clouds are off — ours are voxels.
    const mat = this.sky.material as THREE.ShaderMaterial;
    mat.uniforms.uExposure = { value: 0.075 };
    mat.fragmentShader = 'uniform float uExposure;\n' + mat.fragmentShader.replace('gl_FragColor = vec4( texColor, 1.0 );', 'gl_FragColor = vec4( texColor * uExposure, 1.0 );');
    if (u.cloudCoverage) u.cloudCoverage.value = 0;
    u.turbidity.value = 3.2;
    u.rayleigh.value = 1.6;
    u.mieCoefficient.value = 0.004;
    u.mieDirectionalG.value = 0.86;
    this.sky.renderOrder = -10;
    this.sky.frustumCulled = false;
    scene.add(this.sky);

    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.06;
    this.setShadowRadius(64);
    scene.add(this.sun, this.sun.target, this.hemi);

    this.stars = makeStars();
    scene.add(this.stars);
    this.moon = makeMoon();
    scene.add(this.moon);
  }

  setShadowRadius(r: number) {
    this.shadowRadius = r;
    const cam = this.sun.shadow.camera;
    cam.left = -r; cam.right = r; cam.top = r; cam.bottom = -r;
    cam.near = 1; cam.far = 400;
    cam.updateProjectionMatrix();
  }

  setShadowMapSize(n: number) {
    this.sun.shadow.mapSize.set(n, n);
    this.sun.shadow.map?.dispose();
    this.sun.shadow.map = null;
  }

  /** Hours as HH:MM for the HUD. */
  clock(): string {
    const mins = Math.floor(this.time * 24 * 60);
    return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
  }

  update(dt: number, camera: THREE.Camera, focus: THREE.Vector3, fog: THREE.Fog) {
    if (!this.paused) this.time = (this.time + dt / this.dayLengthSec) % 1;
    const theta = (this.time - 0.25) * Math.PI * 2;
    this.sunDir.set(Math.cos(theta), Math.sin(theta), 0.32).normalize();
    const e = this.sunDir.y;
    this.elevation = e;
    this.daylight = smooth(-0.1, 0.22, e);
    this.night = 1 - smooth(-0.22, 0.02, e);
    const oc = this.overcast;

    // Sky dome follows the camera.
    this.sky.position.copy(camera.position);
    const u = this.sky.material.uniforms;
    u.sunPosition.value.copy(this.sunDir);
    // A low sun gives a dimmer Preetham sky: open the exposure up at dawn and dusk.
    u.uExposure.value = 0.075 + 0.45 * (1 - smooth(0.0, 0.3, e)) * smooth(-0.25, -0.02, e);
    u.rayleigh.value = lerp(1.2, 3.2, 1 - smooth(0.0, 0.4, Math.abs(e))) + oc * 1.5;
    u.turbidity.value = lerp(2.6, 9, oc);
    u.mieCoefficient.value = lerp(0.004, 0.02, oc);

    // Sun or moon casts the shadows, whichever is up.
    const moonUp = e < -0.05;
    const lightDir = moonUp ? this.sunDir.clone().negate() : this.sunDir;
    const texel = (this.shadowRadius * 2) / this.sun.shadow.mapSize.x;
    const fx = Math.round(focus.x / texel) * texel, fz = Math.round(focus.z / texel) * texel;
    this.sun.target.position.set(fx, focus.y, fz);
    this.sun.position.set(fx + lightDir.x * 150, focus.y + lightDir.y * 150, fz + lightDir.z * 150);
    this.sun.target.updateMatrixWorld();

    const sunStrength = smooth(-0.02, 0.18, e) * (1 - oc * 0.75);
    const moonStrength = smooth(-0.05, -0.25, e) * (1 - oc * 0.8);
    if (moonUp) {
      this.sun.color.setRGB(0.55, 0.66, 1.0);
      this.sun.intensity = 0.55 * moonStrength;
    } else {
      palette({ night: C(0x000000), twilight: C(0xff7a3a), golden: C(0xffb070), day: C(0xfff4e2) }, e, this.sun.color);
      this.sun.intensity = 2.35 * sunStrength;
    }
    this.sun.intensity += this.lightning * 6;

    palette(AMBIENT, e, this.tmp);
    this.tmp.lerp(C(0x6b7280), oc * 0.6).multiplyScalar(1 - oc * 0.3);
    this.tmp.addScalar(this.lightning * 0.8);
    this.shared.uSkyAmbient.value.copy(this.tmp);
    this.hemi.color.copy(this.tmp).multiplyScalar(1.4);
    this.hemi.groundColor.copy(this.tmp).multiplyScalar(0.45);
    this.hemi.intensity = 0.6 + this.daylight * 0.6;

    palette(FOG, e, this.fogColor);
    this.fogColor.lerp(C(0x8a93a3).multiplyScalar(0.3 + this.daylight * 0.7), oc * 0.7);
    this.fogColor.addScalar(this.lightning * 0.5);
    fog.color.copy(this.fogColor);

    this.shared.uSunDir.value.copy(lightDir);
    this.shared.uSunColor.value.copy(this.sun.color).multiplyScalar(moonUp ? 0.4 : 1);
    this.shared.uDaylight.value = this.daylight * (1 - oc * 0.5);
    palette(HORIZON, e, this.shared.uSkyHorizon.value).lerp(this.fogColor, oc);
    palette(ZENITH, e, this.shared.uSkyZenith.value).lerp(this.fogColor, oc * 0.8);

    // Stars and moon.
    const starMat = this.stars.material as THREE.ShaderMaterial;
    starMat.uniforms.uAlpha.value = this.night * (1 - oc);
    starMat.uniforms.uTime.value += dt;
    this.stars.position.copy(camera.position);
    this.stars.rotation.set(0.35, this.time * Math.PI * 2, 0);
    const moonDir = this.sunDir.clone().negate();
    this.moon.position.copy(camera.position).addScaledVector(moonDir, 900);
    (this.moon.material as THREE.SpriteMaterial).opacity = smooth(-0.05, 0.1, moonDir.y) * (1 - oc * 0.85);
  }
}

function makeStars(): THREE.Points {
  const n = 2200;
  const pos = new Float32Array(n * 3);
  const size = new Float32Array(n);
  const tint = new Float32Array(n * 3);
  let s = 12345;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < n; i++) {
    const u = r() * 2 - 1, a = r() * Math.PI * 2;
    const k = Math.sqrt(1 - u * u);
    pos[i * 3] = Math.cos(a) * k * 950;
    pos[i * 3 + 1] = u * 950;
    pos[i * 3 + 2] = Math.sin(a) * k * 950;
    size[i] = 1.2 + r() ** 4 * 4.5;
    const warm = r();
    tint[i * 3] = 0.8 + warm * 0.2;
    tint[i * 3 + 1] = 0.85 + r() * 0.1;
    tint[i * 3 + 2] = 1.0 - warm * 0.15;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  g.setAttribute('aTint', new THREE.BufferAttribute(tint, 3));
  const m = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
    uniforms: { uAlpha: { value: 0 }, uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      attribute float aSize;
      attribute vec3 aTint;
      varying vec3 vTint;
      varying float vTw;
      uniform float uTime;
      void main() {
        vTint = aTint;
        vTw = 0.7 + 0.3 * sin(uTime * (1.5 + fract(position.x * 0.013) * 3.0) + position.z);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = aSize;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vTint;
      varying float vTw;
      uniform float uAlpha;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float d = length(c);
        float a = smoothstep(0.5, 0.0, d) * uAlpha * vTw;
        gl_FragColor = vec4(vTint * 1.6, a);
      }
    `,
  });
  const p = new THREE.Points(g, m);
  p.frustumCulled = false;
  p.renderOrder = -9;
  return p;
}

function makeMoon(): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  const grd = ctx.createRadialGradient(64, 64, 20, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,240,0.35)');
  grd.addColorStop(1, 'rgba(255,255,240,0)');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = '#f4f1e4';
  ctx.beginPath();
  ctx.arc(64, 64, 28, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(160,160,150,0.55)';
  for (const [x, y, r] of [[54, 56, 6], [72, 70, 8], [66, 50, 4], [52, 74, 4], [78, 58, 3]]) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, color: new THREE.Color(1.6, 1.6, 1.5) }));
  s.scale.setScalar(110);
  s.renderOrder = -8;
  return s;
}
