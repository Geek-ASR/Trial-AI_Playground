import * as THREE from 'three';
import type { WeatherMode } from './settings';

export type WeatherKind = 'clear' | 'cloudy' | 'rain' | 'storm';

const OVERCAST: Record<WeatherKind, number> = { clear: 0, cloudy: 0.42, rain: 0.78, storm: 1 };
const NEXT: Record<WeatherKind, [WeatherKind, number][]> = {
  clear: [['clear', 0.62], ['cloudy', 0.38]],
  cloudy: [['clear', 0.4], ['cloudy', 0.25], ['rain', 0.35]],
  rain: [['cloudy', 0.45], ['rain', 0.3], ['storm', 0.25]],
  storm: [['rain', 0.6], ['cloudy', 0.4]],
};

/**
 * Weather state machine plus rain streaks and lightning. Rain only falls where
 * the sky is open (drops stop at the first solid block), so roofs keep you dry.
 */
export class Weather {
  kind: WeatherKind = 'clear';
  overcast = 0;
  rain = 0;
  flash = 0;
  readonly rainMesh: THREE.LineSegments;
  readonly bolt: THREE.Line;
  private drops: Float32Array;
  private speeds: Float32Array;
  private timer = 200;
  private nextStrike = 8;
  private boltTimer = 0;
  private count: number;
  onThunder: ((distance: number) => void) | null = null;
  onChange: ((kind: WeatherKind) => void) | null = null;

  constructor(private heightAt: (x: number, z: number) => number, max = 3500) {
    this.count = max;
    this.drops = new Float32Array(max * 6);
    this.speeds = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.drops, 3).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    this.rainMesh = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x9fb4d0, transparent: true, opacity: 0.45, fog: true }));
    this.rainMesh.frustumCulled = false;
    this.bolt = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: new THREE.Color(4, 4.4, 6) }));
    this.bolt.visible = false;
    this.bolt.frustumCulled = false;
  }

  setMode(mode: WeatherMode) {
    if (mode === 'auto') return;
    this.set(mode);
  }

  set(kind: WeatherKind) {
    if (kind === this.kind) return;
    this.kind = kind;
    this.timer = 150 + Math.random() * 210;
    this.onChange?.(kind);
  }

  update(dt: number, focus: THREE.Vector3, mode: WeatherMode, precipitation: 'rain' | 'snow' | 'none') {
    if (mode === 'auto') {
      this.timer -= dt;
      if (this.timer <= 0) {
        let r = Math.random();
        for (const [k, p] of NEXT[this.kind]) {
          if ((r -= p) <= 0) { this.set(k); break; }
        }
        this.timer = 150 + Math.random() * 210;
      }
    } else if (mode !== this.kind) {
      this.set(mode);
    }
    const target = OVERCAST[this.kind];
    this.overcast += Math.sign(target - this.overcast) * Math.min(Math.abs(target - this.overcast), dt * 0.03);
    const rainTarget = precipitation === 'rain' && (this.kind === 'rain' || this.kind === 'storm') ? (this.kind === 'storm' ? 1 : 0.65) : 0;
    this.rain += Math.sign(rainTarget - this.rain) * Math.min(Math.abs(rainTarget - this.rain), dt * 0.12);

    this.updateRain(dt, focus);

    // Lightning.
    this.flash = Math.max(0, this.flash - dt * 3.2);
    this.boltTimer -= dt;
    if (this.boltTimer <= 0) this.bolt.visible = false;
    if (this.kind === 'storm' && this.overcast > 0.8) {
      this.nextStrike -= dt;
      if (this.nextStrike <= 0) {
        this.nextStrike = 5 + Math.random() * 14;
        this.strike(focus);
      }
    }
  }

  private strike(focus: THREE.Vector3) {
    const a = Math.random() * Math.PI * 2;
    const d = 35 + Math.random() * 70;
    const x = focus.x + Math.cos(a) * d, z = focus.z + Math.sin(a) * d;
    const ground = this.heightAt(Math.floor(x), Math.floor(z)) + 1;
    const pts: THREE.Vector3[] = [];
    let px = x, pz = z;
    for (let y = 104; y > ground; y -= 3 + Math.random() * 4) {
      pts.push(new THREE.Vector3(px, y, pz));
      px += (Math.random() - 0.5) * 5;
      pz += (Math.random() - 0.5) * 5;
    }
    pts.push(new THREE.Vector3(x, ground, z));
    this.bolt.geometry.dispose();
    this.bolt.geometry = new THREE.BufferGeometry().setFromPoints(pts);
    this.bolt.visible = true;
    this.boltTimer = 0.22;
    this.flash = 1;
    this.onThunder?.(d);
  }

  private updateRain(dt: number, focus: THREE.Vector3) {
    const active = Math.floor(this.count * this.rain);
    const D = this.drops;
    const R = 34;
    for (let i = 0; i < active; i++) {
      const o = i * 6;
      if (this.speeds[i] === 0 || D[o + 4] < this.heightAt(Math.floor(D[o + 3]), Math.floor(D[o + 5])) + 1 || Math.abs(D[o] - focus.x) > R || Math.abs(D[o + 2] - focus.z) > R) {
        const x = focus.x + (Math.random() * 2 - 1) * R;
        const z = focus.z + (Math.random() * 2 - 1) * R;
        const y = focus.y + 10 + Math.random() * 28;
        this.speeds[i] = 26 + Math.random() * 10;
        D[o] = x; D[o + 1] = y; D[o + 2] = z;
        D[o + 3] = x - 0.08; D[o + 4] = y - 0.9; D[o + 5] = z;
      }
      const dy = this.speeds[i] * dt;
      D[o + 1] -= dy; D[o + 4] -= dy;
      D[o] -= dy * 0.08; D[o + 3] -= dy * 0.08;
    }
    this.rainMesh.geometry.setDrawRange(0, active * 2);
    (this.rainMesh.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    this.rainMesh.visible = active > 0;
  }
}
