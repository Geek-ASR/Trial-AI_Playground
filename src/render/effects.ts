import * as THREE from 'three';

/**
 * Light beams rising from lesson beacons (a landmark you can see from anywhere)
 * and shimmering portal rings. All beams share one merged geometry.
 */
export class BeamField {
  readonly mesh: THREE.Mesh;
  private colors: Float32Array;
  private ranges = new Map<string, [number, number]>();
  private material: THREE.ShaderMaterial;

  constructor(beams: { id: string; x: number; y: number; z: number; color: THREE.Color; height?: number }[]) {
    const segs = 10;
    const pos: number[] = [];
    const uvs: number[] = [];
    const col: number[] = [];
    const idx: number[] = [];
    for (const b of beams) {
      const start = pos.length / 3;
      const h = b.height ?? 96;
      for (let layer = 0; layer < 2; layer++) {
        const r = layer === 0 ? 0.42 : 0.16;
        const base = pos.length / 3;
        for (let s = 0; s <= segs; s++) {
          const a = (s / segs) * Math.PI * 2;
          const cx = b.x + 0.5 + Math.cos(a) * r, cz = b.z + 0.5 + Math.sin(a) * r;
          pos.push(cx, b.y, cz, cx, b.y + h, cz);
          uvs.push(s / segs, 0, s / segs, 1);
          const k = layer === 0 ? 1 : 2.2;
          col.push(b.color.r * k, b.color.g * k, b.color.b * k, b.color.r * k, b.color.g * k, b.color.b * k);
        }
        for (let s = 0; s < segs; s++) {
          const a = base + s * 2;
          idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
        }
      }
      this.ranges.set(b.id, [start, pos.length / 3]);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    this.colors = new Float32Array(col);
    g.setAttribute('aColor', new THREE.BufferAttribute(this.colors, 3));
    g.setIndex(idx);
    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: { uTime: { value: 0 }, uNight: { value: 0 }, uCam: { value: new THREE.Vector3() } },
      vertexShader: /* glsl */ `
        attribute vec3 aColor;
        varying vec3 vColor;
        varying vec2 vUv;
        varying float vDist;
        uniform vec3 uCam;
        void main() {
          vColor = aColor;
          vUv = uv;
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vDist = distance(wp.xyz, uCam);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime, uNight;
        varying vec3 vColor;
        varying vec2 vUv;
        varying float vDist;
        void main() {
          float fall = pow(1.0 - vUv.y, 1.8);
          float stripes = 0.75 + 0.25 * sin(vUv.y * 90.0 - uTime * 4.0);
          float near = smoothstep(2.0, 9.0, vDist);
          float a = fall * stripes * near * (0.13 + 0.6 * uNight);
          gl_FragColor = vec4(vColor, a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    });
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
  }

  setColor(id: string, color: THREE.Color) {
    const r = this.ranges.get(id);
    if (!r) return;
    const [a, b] = r;
    const half = a + (b - a) / 2;
    for (let i = a; i < b; i++) {
      const k = i < half ? 1 : 2.2;
      this.colors[i * 3] = color.r * k;
      this.colors[i * 3 + 1] = color.g * k;
      this.colors[i * 3 + 2] = color.b * k;
    }
    (this.mesh.geometry.getAttribute('aColor') as THREE.BufferAttribute).needsUpdate = true;
  }

  update(time: number, night: number, cam: THREE.Vector3) {
    this.material.uniforms.uTime.value = time;
    this.material.uniforms.uNight.value = night;
    this.material.uniforms.uCam.value.copy(cam);
  }
}

const portalMaterial = (color: THREE.Color) =>
  new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uColor: { value: color }, uFade: { value: 1 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uFade;
      uniform vec3 uColor;
      varying vec2 vUv;
      void main() {
        vec2 p = vUv - 0.5;
        float r = length(p) * 2.0;
        float a = atan(p.y, p.x);
        float swirl = sin(a * 5.0 + r * 12.0 - uTime * 3.0) * 0.5 + 0.5;
        float ring = smoothstep(1.0, 0.2, r);
        float alpha = ring * (0.25 + 0.45 * swirl) * (0.7 + 0.3 * sin(uTime * 2.0)) * uFade;
        gl_FragColor = vec4(uColor * (1.4 + swirl), alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });

export class PortalRing {
  readonly group = new THREE.Group();
  private disc: THREE.Mesh;

  constructor(x: number, y: number, z: number, normalAngle: number, color: THREE.Color) {
    const ringMat = new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(2.6) });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.25, 0.16, 10, 48), ringMat);
    const outer = new THREE.Mesh(new THREE.TorusGeometry(2.5, 0.07, 6, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 3, 3) }));
    this.disc = new THREE.Mesh(new THREE.CircleGeometry(2.15, 40), portalMaterial(color.clone()));
    this.group.add(ring, outer, this.disc);
    this.group.position.set(x + 0.5, y + 2.35, z + 0.5);
    // Torus/circle lie in the XY plane (normal +Z); turn the normal to (cos a, 0, sin a).
    this.group.rotation.y = Math.atan2(Math.cos(normalAngle), Math.sin(normalAngle));
  }

  update(time: number, cam: THREE.Vector3) {
    const u = (this.disc.material as THREE.ShaderMaterial).uniforms;
    u.uTime.value = time;
    // Fade the membrane when the camera is about to pass through it (walking through, or a
    // third-person camera behind you) so it never washes over the whole screen.
    const d = this.group.position.distanceTo(cam);
    u.uFade.value = THREE.MathUtils.smoothstep(d, 1.2, 3.2);
    this.group.children[1].rotation.z = time * 0.6;
  }
}
