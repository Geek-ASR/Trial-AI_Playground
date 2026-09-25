/** Player-adjustable settings, persisted in localStorage. */

export type QualityLevel = 'low' | 'medium' | 'high' | 'ultra';
export type TimeMode = 'cycle' | 'dawn' | 'noon' | 'sunset' | 'night';
export type WeatherMode = 'auto' | 'clear' | 'rain' | 'storm';

export interface Settings {
  quality: QualityLevel | 'auto';
  fov: number;
  sensitivity: number;
  invertY: boolean;
  headBob: boolean;
  timeMode: TimeMode;
  dayMinutes: number;
  weather: WeatherMode;
  camera: 'first' | 'third';
  master: number;
  music: number;
  sfx: number;
  ambience: number;
  showFps: boolean;
}

export interface QualityPreset {
  label: string;
  shadows: boolean;
  shadowMap: number;
  shadowRadius: number;
  bloom: boolean;
  aa: 'none' | 'fxaa' | 'smaa';
  post: boolean;
  pixelRatio: number;
  renderDistance: number;
  particles: number;
  clouds: boolean;
}

export const PRESETS: Record<QualityLevel, QualityPreset> = {
  low: { label: 'Low', shadows: false, shadowMap: 512, shadowRadius: 40, bloom: false, aa: 'none', post: false, pixelRatio: 1, renderDistance: 96, particles: 0.3, clouds: false },
  medium: { label: 'Medium', shadows: true, shadowMap: 1024, shadowRadius: 48, bloom: true, aa: 'fxaa', post: true, pixelRatio: 1, renderDistance: 136, particles: 0.6, clouds: true },
  high: { label: 'High', shadows: true, shadowMap: 2048, shadowRadius: 64, bloom: true, aa: 'fxaa', post: true, pixelRatio: 1.5, renderDistance: 180, particles: 1, clouds: true },
  ultra: { label: 'Ultra', shadows: true, shadowMap: 4096, shadowRadius: 88, bloom: true, aa: 'smaa', post: true, pixelRatio: 2, renderDistance: 240, particles: 1, clouds: true },
};

export const QUALITY_ORDER: QualityLevel[] = ['low', 'medium', 'high', 'ultra'];

const KEY = 'nc.settings.v1';

const DEFAULTS: Settings = {
  quality: 'auto',
  fov: 74,
  sensitivity: 1,
  invertY: false,
  headBob: true,
  timeMode: 'cycle',
  dayMinutes: 20,
  weather: 'auto',
  camera: 'first',
  master: 0.8,
  music: 0.45,
  sfx: 0.8,
  ambience: 0.7,
  showFps: false,
};

function load(): Settings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return { ...DEFAULTS };
  }
}

let current = load();
const listeners = new Set<(s: Settings) => void>();

export function settings(): Settings {
  return current;
}

export function updateSettings(patch: Partial<Settings>) {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l(current));
}

export function onSettings(fn: (s: Settings) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Pick a starting preset from what the device reports about itself. */
export function guessQuality(renderer: { capabilities: { maxTextureSize: number } }): QualityLevel {
  const mobile = matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad/i.test(navigator.userAgent);
  const cores = navigator.hardwareConcurrency ?? 4;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  if (mobile) return mem >= 6 && cores >= 8 ? 'medium' : 'low';
  if (cores >= 8 && mem >= 8 && renderer.capabilities.maxTextureSize >= 16384) return 'high';
  return 'medium';
}
