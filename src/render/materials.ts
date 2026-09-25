import * as THREE from 'three';
import { WATER_LEVEL } from '../world/layout';

/**
 * Voxel materials. The solid passes are three.js Lambert materials (so they keep
 * real-time sun shadows) patched to add:
 *  - smooth sky light + coloured block light from the mesher's `aLight` attribute
 *  - day/night via a shared sky-ambient uniform
 *  - emissive glow (HDR, picked up by the bloom pass)
 *  - wind sway for leaves and plants, and animated caustics on underwater faces
 * Water gets its own shader with waves, fresnel reflection and sun glints.
 */

export interface SharedUniforms {
  uTime: { value: number };
  uWind: { value: number };
  uSkyAmbient: { value: THREE.Color };
  uDaylight: { value: number };
  uGlowBoost: { value: number };
  uSunDir: { value: THREE.Vector3 };
  uSunColor: { value: THREE.Color };
  uSkyZenith: { value: THREE.Color };
  uSkyHorizon: { value: THREE.Color };
  uWetness: { value: number };
}

export function createSharedUniforms(): SharedUniforms {
  return {
    uTime: { value: 0 },
    uWind: { value: 1 },
    uSkyAmbient: { value: new THREE.Color(0.55, 0.62, 0.75) },
    uDaylight: { value: 1 },
    uGlowBoost: { value: 0.24 },
    uSunDir: { value: new THREE.Vector3(0.3, 0.8, 0.4).normalize() },
    uSunColor: { value: new THREE.Color(1, 0.95, 0.85) },
    uSkyZenith: { value: new THREE.Color(0.25, 0.5, 0.9) },
    uSkyHorizon: { value: new THREE.Color(0.7, 0.82, 0.95) },
    uWetness: { value: 0 },
  };
}

/** GLSL shared by the voxel and water shaders: Minecraft-like light curve. */
const LIGHT_CURVE = /* glsl */ `
float nc_curve(float l) {
  // 0.8^(15·(1−l)), rescaled so that level 0 is truly dark.
  return max((pow(0.8, (1.0 - l) * 15.0) - 0.035) / 0.965, 0.0);
}
vec3 nc_blockLight(vec3 l) {
  vec3 c = vec3(nc_curve(l.r), nc_curve(l.g), nc_curve(l.b));
  return c * vec3(1.35, 1.2, 1.1);
}
`;

export const VOXEL_VERTEX_HEAD = /* glsl */ `
attribute vec4 aLight;
attribute float aFlags;
varying vec4 vLight;
varying float vGlow;
varying float vKind;
varying vec3 vWorldPos;
uniform float uTime;
uniform float uWind;
`;

export const VOXEL_VERTEX_BODY = /* glsl */ `
vLight = aLight;
vKind = mod(aFlags, 10.0);
vGlow = floor(aFlags / 10.0 + 0.01);
#ifdef VOXEL_SWAY
if (vKind > 0.5 && vKind < 2.5) {
  float amp = vKind < 1.5 ? 0.035 : 0.13;
  float t = uTime * 1.7;
  vec3 wp = transformed;
  float gust = 0.6 + 0.4 * sin(uTime * 0.37 + wp.x * 0.02);
  float w = sin(wp.x * 0.62 + t) * cos(wp.z * 0.53 + t * 0.83) + 0.5 * sin((wp.x + wp.z) * 0.31 + t * 1.7);
  transformed.x += w * amp * uWind * gust;
  transformed.z += cos(wp.z * 0.71 + t * 1.13) * amp * 0.7 * uWind * gust;
  if (vKind < 1.5) transformed.y += sin(wp.x * 1.3 + wp.z + t * 2.0) * 0.012 * uWind;
}
#endif
vWorldPos = transformed;
`;

export const VOXEL_FRAGMENT_HEAD = /* glsl */ `
varying vec4 vLight;
varying float vGlow;
varying float vKind;
varying vec3 vWorldPos;
uniform vec3 uSkyAmbient;
uniform float uGlowBoost;
uniform float uTime;
uniform float uDaylight;
uniform float uWetness;
${LIGHT_CURVE}
float nc_caustic(vec2 p, float t) {
  vec2 q = p * 0.9;
  float c = 0.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    q += vec2(sin(q.y * 1.7 + t * (0.6 + fi * 0.2)), cos(q.x * 1.5 - t * (0.5 + fi * 0.15))) * 0.6;
    c += abs(sin(q.x + q.y));
  }
  return pow(1.0 - c / 3.0, 5.0);
}
`;

/** Replaces Lambert's final light sum. `reflectedLight.directDiffuse` already contains sun × shadow. */
export const VOXEL_LIGHTING = /* glsl */ `
float skyL = vLight.x;
vec3 blockL = nc_blockLight(vLight.yzw);
float skyC = nc_curve(skyL);
vec3 ambient = uSkyAmbient * skyC + blockL + vec3(0.018, 0.02, 0.028);
// Direct sun only where the sky is visible (caves and deep shade get none).
vec3 sunLit = reflectedLight.directDiffuse * smoothstep(0.5, 0.95, skyL);
vec3 outgoingLight = diffuseColor.rgb * ambient + sunLit;
outgoingLight += diffuseColor.rgb * vGlow * uGlowBoost;
if (vKind > 3.5 && vKind < 4.5) {
  float c = nc_caustic(vWorldPos.xz * 0.8, uTime * 1.3);
  outgoingLight += vec3(0.55, 0.8, 1.0) * c * skyC * uDaylight * 0.55 * smoothstep(${WATER_LEVEL.toFixed(1)} + 1.0, ${WATER_LEVEL.toFixed(1)} - 6.0, vWorldPos.y);
}
// Rain makes exposed surfaces a little darker and shinier-looking.
outgoingLight *= 1.0 - uWetness * 0.18 * skyC;
`;

export type VoxelVariant = 'opaque' | 'cutout' | 'translucent';

export function createVoxelMaterial(map: THREE.Texture, shared: SharedUniforms, variant: VoxelVariant): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({
    map,
    vertexColors: true,
    alphaTest: variant === 'cutout' ? 0.5 : 0,
    side: variant === 'cutout' ? THREE.DoubleSide : THREE.FrontSide,
    transparent: variant === 'translucent',
    opacity: variant === 'translucent' ? 0.78 : 1,
    depthWrite: variant !== 'translucent',
  });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = shared.uTime;
    shader.uniforms.uWind = shared.uWind;
    shader.uniforms.uSkyAmbient = shared.uSkyAmbient;
    shader.uniforms.uGlowBoost = shared.uGlowBoost;
    shader.uniforms.uDaylight = shared.uDaylight;
    shader.uniforms.uWetness = shared.uWetness;
    if (variant === 'cutout') shader.defines = { ...(shader.defines ?? {}), VOXEL_SWAY: '' };
    shader.vertexShader = patch(shader.vertexShader, '#include <common>', `#include <common>\n${VOXEL_VERTEX_HEAD}`);
    shader.vertexShader = patch(shader.vertexShader, '#include <begin_vertex>', `#include <begin_vertex>\n${VOXEL_VERTEX_BODY}`);
    shader.fragmentShader = patch(shader.fragmentShader, '#include <common>', `#include <common>\n${VOXEL_FRAGMENT_HEAD}`);
    // Colours are stored halved in the mesh so biome tints can brighten.
    shader.fragmentShader = patch(shader.fragmentShader, '#include <color_fragment>', 'diffuseColor.rgb *= vColor.rgb * 2.0;');
    shader.fragmentShader = patch(
      shader.fragmentShader,
      'vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;',
      VOXEL_LIGHTING,
    );
  };
  mat.customProgramCacheKey = () => `nc-voxel-${variant}`;
  return mat;
}

function patch(src: string, find: string, replace: string): string {
  if (!src.includes(find)) {
    console.warn(`[NeuralCraft] shader patch target not found: ${find}`);
    return src;
  }
  return src.replace(find, replace);
}

/** Depth material for leaves & plants so their shadows have holes in them. */
export function createCutoutDepthMaterial(map: THREE.Texture): THREE.MeshDepthMaterial {
  return new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map, alphaTest: 0.5 });
}

export function createWaterMaterial(shared: SharedUniforms): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    name: 'NeuralCraftWater',
    transparent: true,
    depthWrite: false,
    fog: true,
    side: THREE.DoubleSide,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uTime: shared.uTime,
        uSkyAmbient: shared.uSkyAmbient,
        uSunDir: shared.uSunDir,
        uSunColor: shared.uSunColor,
        uSkyZenith: shared.uSkyZenith,
        uSkyHorizon: shared.uSkyHorizon,
        uDaylight: shared.uDaylight,
      },
    ]),
    vertexShader: /* glsl */ `
      attribute vec4 aLight;
      attribute float aFlags;
      uniform float uTime;
      varying vec4 vLight;
      varying vec3 vWorld;
      varying vec3 vNormal0;
      varying float vSurface;
      #include <common>
      #include <fog_pars_vertex>
      void main() {
        vLight = aLight;
        vec3 p = position;
        vSurface = mod(aFlags, 10.0) > 2.5 ? 1.0 : 0.0;
        if (vSurface > 0.5) {
          p.y += (sin(p.x * 0.55 + uTime * 1.1) + cos(p.z * 0.47 + uTime * 0.9)) * 0.045 - 0.04;
        }
        vWorld = p;
        vNormal0 = normal;
        vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uSkyAmbient;
      uniform vec3 uSunDir;
      uniform vec3 uSunColor;
      uniform vec3 uSkyZenith;
      uniform vec3 uSkyHorizon;
      uniform float uDaylight;
      varying vec4 vLight;
      varying vec3 vWorld;
      varying vec3 vNormal0;
      varying float vSurface;
      #include <common>
      #include <fog_pars_fragment>
      ${LIGHT_CURVE}
      vec2 waveGrad(vec2 p, float t) {
        vec2 g = vec2(0.0);
        g += vec2(cos(p.x * 0.9 + t * 1.3), 0.0) * 0.9;
        g += vec2(0.0, cos(p.y * 1.1 - t * 1.1)) * 0.8;
        g += vec2(cos((p.x + p.y) * 1.9 + t * 2.1)) * 0.35;
        g += vec2(cos((p.x - p.y) * 3.3 - t * 2.7), -cos((p.x - p.y) * 3.3 - t * 2.7)) * 0.18;
        g += vec2(sin(p.x * 6.1 + p.y * 2.3 + t * 3.4), cos(p.y * 5.7 - p.x * 1.9 + t * 3.1)) * 0.07;
        return g;
      }
      void main() {
        float skyC = nc_curve(vLight.x);
        vec3 blockL = nc_blockLight(vLight.yzw);
        vec3 V = normalize(cameraPosition - vWorld);
        vec3 N = normalize(vNormal0);
        if (vSurface > 0.5) {
          vec2 g = waveGrad(vWorld.xz, uTime) * 0.11;
          N = normalize(vec3(-g.x, 1.0, -g.y));
          if (V.y < 0.0) N.y = -N.y; // seen from below the surface
        }
        float fres = pow(1.0 - clamp(abs(dot(N, V)), 0.0, 1.0), 4.0) * 0.85 + 0.06;
        vec3 R = reflect(-V, N);
        vec3 sky = mix(uSkyHorizon, uSkyZenith, clamp(R.y, 0.0, 1.0)) * (0.2 + 0.8 * skyC);
        vec3 deep = vec3(0.015, 0.09, 0.16) * (uSkyAmbient * skyC * 2.2 + blockL + 0.03);
        float spec = pow(max(dot(R, normalize(uSunDir)), 0.0), 220.0) * 6.0 * smoothstep(0.6, 1.0, vLight.x);
        vec3 col = mix(deep, sky, fres) + uSunColor * spec * vSurface + blockL * 0.12;
        float alpha = mix(0.62, 0.94, fres);
        gl_FragColor = vec4(col, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }
    `,
  });
}
