import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { FXAAPass } from 'three/addons/postprocessing/FXAAPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

/** Final screen-space grade: vignette, underwater tint, lightning flash, cinematic bars. */
const GradeShader = {
  name: 'NeuralCraftGrade',
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uVignette: { value: 0.32 },
    uUnderwater: { value: 0 },
    uFlash: { value: 0 },
    uBars: { value: 0 },
    uTime: { value: 0 },
    uSaturation: { value: 1.08 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uVignette, uUnderwater, uFlash, uBars, uTime, uSaturation;
    varying vec2 vUv;
    void main() {
      vec2 uv = vUv;
      if (uUnderwater > 0.0) uv += vec2(sin(uv.y * 24.0 + uTime * 2.0), cos(uv.x * 20.0 + uTime * 1.7)) * 0.0025 * uUnderwater;
      vec4 c = texture2D(tDiffuse, uv);
      float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
      c.rgb = mix(vec3(l), c.rgb, uSaturation);
      c.rgb = mix(c.rgb, c.rgb * vec3(0.35, 0.72, 0.95) + vec3(0.0, 0.03, 0.06), uUnderwater);
      vec2 d = vUv - 0.5;
      c.rgb *= 1.0 - uVignette * smoothstep(0.35, 0.85, length(d * vec2(1.1, 1.0)));
      c.rgb += uFlash * vec3(0.75, 0.8, 1.0);
      if (uBars > 0.0 && (vUv.y < uBars || vUv.y > 1.0 - uBars)) c.rgb = vec3(0.0);
      gl_FragColor = c;
    }
  `,
};

export interface PostSettings {
  bloom: boolean;
  aa: 'none' | 'fxaa' | 'smaa';
}

export class PostFX {
  readonly composer: EffectComposer;
  readonly bloom: UnrealBloomPass;
  readonly grade: ShaderPass;
  private fxaa: FXAAPass;
  private smaa: SMAAPass;
  enabled = true;

  constructor(private renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    const size = renderer.getSize(new THREE.Vector2());
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.5, 0.28, 2.1);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    this.fxaa = new FXAAPass();
    this.smaa = new SMAAPass();
    this.composer.addPass(this.fxaa);
    this.composer.addPass(this.smaa);
    this.apply({ bloom: true, aa: 'fxaa' });
  }

  apply(s: PostSettings) {
    this.bloom.enabled = s.bloom;
    this.fxaa.enabled = s.aa === 'fxaa';
    this.smaa.enabled = s.aa === 'smaa';
  }

  setSize(w: number, h: number) {
    this.composer.setSize(w, h);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
  }

  render(dt: number) {
    this.composer.render(dt);
  }
}
