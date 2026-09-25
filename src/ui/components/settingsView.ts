import { PRESETS, QUALITY_ORDER, settings, updateSettings, type Settings } from '../../render/settings';
import { h } from '../dom';

export interface SettingsHooks {
  quality(): string;
  fps(): number;
  resetWorld(): void;
  tour(): void;
}

/** In-game settings: graphics, world, camera & controls, audio. */
export function settingsView(hooks: SettingsHooks): { el: HTMLElement; destroy(): void } {
  const s = settings();
  const set = (patch: Partial<Settings>) => updateSettings(patch);

  const select = <T extends string>(value: T, options: [T, string][], onChange: (v: T) => void) => {
    const el = h('select', { class: 'select' }, options.map(([v, l]) => h('option', { value: v, selected: v === value }, l)));
    el.addEventListener('change', () => onChange(el.value as T));
    return el;
  };
  const range = (value: number, min: number, max: number, step: number, onInput: (v: number) => void, fmt = (v: number) => String(v)) => {
    const out = h('span', { class: 'muted small' }, fmt(value));
    const el = h('input', { type: 'range', min: String(min), max: String(max), step: String(step), value: String(value) });
    el.addEventListener('input', () => {
      out.textContent = fmt(Number(el.value));
      onInput(Number(el.value));
    });
    return [el, out] as const;
  };
  const toggle = (value: boolean, label: string, onChange: (v: boolean) => void) => {
    const cb = h('input', { type: 'checkbox', checked: value });
    cb.addEventListener('change', () => onChange(cb.checked));
    return h('label', { class: 'check' }, cb, label);
  };
  const row = (label: string, ...control: (Node | string)[]) => h('label', { class: 'field' }, h('span', null, label), ...control);

  const live = h('p', { class: 'muted small' });
  const timer = setInterval(() => {
    live.textContent = `Now running on ${PRESETS[hooks.quality() as keyof typeof PRESETS]?.label ?? hooks.quality()} · ${Math.round(hooks.fps())} fps`;
  }, 500);

  const [fov, fovOut] = range(s.fov, 55, 100, 1, (v) => set({ fov: v }), (v) => `${v}°`);
  const [sens, sensOut] = range(s.sensitivity, 0.3, 2.5, 0.05, (v) => set({ sensitivity: v }), (v) => `${v.toFixed(2)}×`);
  const [day, dayOut] = range(s.dayMinutes, 5, 60, 5, (v) => set({ dayMinutes: v }), (v) => `${v} min`);
  const vol = (key: 'master' | 'music' | 'sfx' | 'ambience', label: string) => {
    const [el, out] = range(settings()[key], 0, 1, 0.05, (v) => set({ [key]: v } as Partial<Settings>), (v) => `${Math.round(v * 100)}%`);
    return row(label, out, el);
  };

  const el = h('div', { class: 'settings' },
    h('header', { class: 'panel-title' }, h('h2', null, '⚙ Settings'), live),
    h('section', null,
      h('h3', null, 'Graphics'),
      row('Quality',
        select(s.quality, [['auto', 'Auto (adapts to your device)'], ...QUALITY_ORDER.map((q) => [q, `${PRESETS[q].label} — ${describe(q)}`] as [string, string])] as [Settings['quality'], string][], (v) => set({ quality: v }))),
      row('Field of view ', fovOut, fov),
      toggle(s.showFps, 'Show frames per second', (v) => set({ showFps: v })),
    ),
    h('section', null,
      h('h3', null, 'World'),
      row('Time of day', select(s.timeMode, [['cycle', '🌗 Day/night cycle'], ['dawn', '🌅 Dawn'], ['noon', '☀️ Noon'], ['sunset', '🌇 Sunset'], ['night', '🌙 Night']], (v) => set({ timeMode: v }))),
      row('Length of a day ', dayOut, day),
      row('Weather', select(s.weather, [['auto', '🌦 Changes naturally'], ['clear', '☀️ Always clear'], ['rain', '🌧 Rain'], ['storm', '⛈ Thunderstorm']], (v) => set({ weather: v }))),
    ),
    h('section', null,
      h('h3', null, 'Camera & controls'),
      row('Camera', select(s.camera, [['first', 'First person'], ['third', 'Third person (V)']], (v) => set({ camera: v }))),
      row('Mouse sensitivity ', sensOut, sens),
      toggle(s.invertY, 'Invert mouse Y', (v) => set({ invertY: v })),
      toggle(s.headBob, 'Head bob while walking', (v) => set({ headBob: v })),
    ),
    h('section', null,
      h('h3', null, 'Audio'),
      h('p', { class: 'muted small' }, 'Every sound — music, birdsong, rain, footsteps — is synthesised live in your browser. No audio files.'),
      vol('master', 'Master '),
      vol('music', 'Music '),
      vol('sfx', 'Effects '),
      vol('ambience', 'Ambience '),
    ),
    h('section', null,
      h('h3', null, 'More'),
      h('div', { class: 'lesson-actions' },
        h('button', { class: 'btn', onclick: () => hooks.tour() }, '🎥 Replay the cinematic tour'),
        h('button', { class: 'btn btn-ghost', onclick: () => { if (confirm('Undo every block you have placed or broken in the world? Your lesson progress is kept.')) hooks.resetWorld(); } }, 'Reset world edits'),
      ),
    ),
  );
  return { el, destroy: () => clearInterval(timer) };
}

function describe(q: keyof typeof PRESETS): string {
  const p = PRESETS[q];
  const bits = [p.shadows ? 'shadows' : 'no shadows', p.bloom ? 'bloom' : 'no bloom', `${p.renderDistance}-block view`];
  return bits.join(', ');
}
