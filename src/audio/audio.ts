/**
 * Procedural audio: everything is synthesised with WebAudio, so the game ships
 * no sound files. Buses: music, sfx and ambience → (underwater filter) →
 * compressor → speakers, with a shared generated-impulse reverb.
 */

export type Material = 'grass' | 'stone' | 'sand' | 'wood' | 'snow' | 'glass' | 'soft';

export interface AmbienceState {
  daylight: number;
  night: number;
  biome: string;
  rain: number;
  storm: boolean;
  altitude: number;
  nearWater: number;
  nearLava: number;
  underwater: boolean;
}

const midi = (n: number) => 440 * 2 ** ((n - 69) / 12);

const DAY_CHORDS = [[48, 55, 59, 62, 64], [45, 52, 55, 59, 60], [41, 48, 52, 57, 59], [43, 50, 52, 57, 59]];
const NIGHT_CHORDS = [[45, 52, 57, 59, 60], [41, 48, 53, 57, 64], [38, 50, 53, 57, 64], [40, 52, 55, 59, 62]];
const DAY_SCALE = [72, 74, 76, 79, 81, 84, 86, 88];
const NIGHT_SCALE = [69, 72, 74, 76, 79, 81, 84];

export class AudioEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private music!: GainNode;
  private sfxBus!: GainNode;
  private amb!: GainNode;
  private reverb!: ConvolverNode;
  private reverbSend!: GainNode;
  private lowpass!: BiquadFilterNode;
  private noise!: AudioBuffer;
  private loops: Record<string, { gain: GainNode; filter?: BiquadFilterNode }> = {};
  private volumes = { master: 0.8, music: 0.45, sfx: 0.8, ambience: 0.7 };
  private musicTimer = 0;
  private musicPlaying = false;
  private musicUntil = 0;
  private restUntil = 0;
  private chordIndex = 0;
  private nextChordAt = 0;
  private birdAt = 0;
  private cricketAt = 0;
  private lavaAt = 0;
  private lastAmb: AmbienceState | null = null;
  private stepLimiter = 0;

  /** Must be called from a user gesture (browsers block audio until then). */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 3;
    comp.connect(ctx.destination);
    this.lowpass = ctx.createBiquadFilter();
    this.lowpass.type = 'lowpass';
    this.lowpass.frequency.value = 20000;
    this.lowpass.connect(comp);
    this.master = ctx.createGain();
    this.master.connect(this.lowpass);
    this.music = ctx.createGain();
    this.sfxBus = ctx.createGain();
    this.amb = ctx.createGain();
    this.music.connect(this.master);
    this.sfxBus.connect(this.master);
    this.amb.connect(this.master);
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(3.2, 2.4);
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.9;
    this.reverbSend.connect(this.reverb);
    this.reverb.connect(this.master);
    this.noise = this.noiseBuffer(3);
    this.setVolumes(this.volumes);
    this.startLoops();
    this.restUntil = ctx.currentTime + 4;
  }

  setVolumes(v: { master: number; music: number; sfx: number; ambience: number }) {
    this.volumes = v;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(v.master, t, 0.05);
    this.music.gain.setTargetAtTime(v.music * 0.5, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(v.sfx, t, 0.05);
    this.amb.gain.setTargetAtTime(v.ambience, t, 0.05);
  }

  // ------------------------------------------------------------ building blocks

  private noiseBuffer(seconds: number): AudioBuffer {
    const ctx = this.ctx!;
    const b = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      last = last * 0.6 + w * 0.4; // slightly pink
      d[i] = last * 1.6;
    }
    return b;
  }

  private impulse(seconds: number, decay: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = ctx.sampleRate * seconds;
    const b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** decay;
    }
    return b;
  }

  private noiseSource(loop = false): AudioBufferSourceNode {
    const s = this.ctx!.createBufferSource();
    s.buffer = this.noise;
    s.loop = loop;
    if (loop) s.loopStart = Math.random();
    return s;
  }

  private env(g: GainNode, t: number, peak: number, attack: number, decay: number) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  private out(pan = 0, reverb = 0.15): AudioNode {
    const ctx = this.ctx!;
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    p.connect(this.sfxBus);
    if (reverb > 0) {
      const s = ctx.createGain();
      s.gain.value = reverb;
      p.connect(s);
      s.connect(this.reverbSend);
    }
    return p;
  }

  private burst(freq: number, q: number, peak: number, decay: number, dest: AudioNode, t = this.ctx!.currentTime, type: BiquadFilterType = 'bandpass') {
    const ctx = this.ctx!;
    const src = this.noiseSource();
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    this.env(g, t, peak, 0.004, decay);
    src.connect(f).connect(g).connect(dest);
    src.start(t, Math.random() * 2);
    src.stop(t + decay + 0.05);
  }

  private tone(freq: number, peak: number, attack: number, decay: number, dest: AudioNode, type: OscillatorType = 'sine', t = this.ctx!.currentTime, glideTo?: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + attack + decay);
    const g = ctx.createGain();
    this.env(g, t, peak, attack, decay);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + attack + decay + 0.05);
  }

  private bell(freq: number, peak: number, t: number, dest: AudioNode, decay = 1.6) {
    const ctx = this.ctx!;
    const car = ctx.createOscillator();
    const mod = ctx.createOscillator();
    const modGain = ctx.createGain();
    car.frequency.value = freq;
    mod.frequency.value = freq * 3.5;
    modGain.gain.setValueAtTime(freq * 2.2, t);
    modGain.gain.exponentialRampToValueAtTime(1, t + decay);
    mod.connect(modGain).connect(car.frequency);
    const g = ctx.createGain();
    this.env(g, t, peak, 0.004, decay);
    car.connect(g).connect(dest);
    car.start(t); mod.start(t);
    car.stop(t + decay + 0.1); mod.stop(t + decay + 0.1);
  }

  // ------------------------------------------------------------ sound effects

  step(mat: Material) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (now < this.stepLimiter) return;
    this.stepLimiter = now + 0.12;
    const out = this.out((Math.random() - 0.5) * 0.2, 0.03);
    const j = 0.85 + Math.random() * 0.3;
    switch (mat) {
      case 'grass': this.burst(1100 * j, 0.8, 0.09, 0.08, out); break;
      case 'stone': this.burst(2400 * j, 1.6, 0.1, 0.045, out); this.tone(170 * j, 0.05, 0.002, 0.05, out); break;
      case 'sand': this.burst(3600 * j, 0.6, 0.07, 0.1, out); break;
      case 'wood': this.burst(700 * j, 2, 0.08, 0.06, out); this.tone(190 * j, 0.08, 0.002, 0.08, out, 'triangle'); break;
      case 'snow': this.burst(1900 * j, 0.7, 0.08, 0.12, out); this.burst(2600 * j, 0.7, 0.05, 0.08, out, now + 0.04); break;
      case 'glass': this.burst(4200 * j, 3, 0.05, 0.05, out); this.tone(1900 * j, 0.03, 0.002, 0.08, out); break;
      default: this.burst(900 * j, 0.7, 0.07, 0.07, out);
    }
  }

  breakBlock(mat: Material) {
    if (!this.ctx) return;
    const out = this.out(0, 0.1);
    const f = { grass: 900, stone: 1800, sand: 3000, wood: 600, snow: 1700, glass: 3800, soft: 800 }[mat];
    this.burst(f, 0.9, 0.22, 0.18, out);
    this.tone(120, 0.18, 0.003, 0.14, out, 'sine', undefined, 55);
    if (mat === 'glass') for (let i = 0; i < 5; i++) this.tone(2000 + Math.random() * 3000, 0.04, 0.002, 0.12, out, 'sine', this.ctx.currentTime + i * 0.03);
  }

  place() {
    if (!this.ctx) return;
    const out = this.out(0, 0.08);
    this.tone(160, 0.2, 0.003, 0.1, out, 'sine', undefined, 80);
    this.burst(1500, 1, 0.06, 0.04, out);
  }

  jump() {
    if (!this.ctx) return;
    this.burst(600, 0.5, 0.04, 0.12, this.out(0, 0));
  }

  land(intensity: number) {
    if (!this.ctx) return;
    const out = this.out(0, 0.05);
    this.tone(90, Math.min(0.35, 0.08 + intensity * 0.02), 0.003, 0.12, out, 'sine', undefined, 45);
    this.burst(700, 0.6, Math.min(0.2, intensity * 0.015), 0.1, out);
  }

  splash() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const out = this.out(0, 0.2);
    const src = this.noiseSource();
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    const t = ctx.currentTime;
    f.frequency.setValueAtTime(4000, t);
    f.frequency.exponentialRampToValueAtTime(300, t + 0.6);
    const g = ctx.createGain();
    this.env(g, t, 0.3, 0.01, 0.6);
    src.connect(f).connect(g).connect(out);
    src.start(t);
    src.stop(t + 0.7);
  }

  portal() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const out = this.out(0, 0.6);
    const t = ctx.currentTime;
    const src = this.noiseSource();
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 2;
    f.frequency.setValueAtTime(250, t);
    f.frequency.exponentialRampToValueAtTime(2600, t + 1.1);
    const g = ctx.createGain();
    this.env(g, t, 0.35, 0.3, 0.9);
    src.connect(f).connect(g).connect(out);
    src.start(t);
    src.stop(t + 1.4);
    for (const [i, n] of [72, 79, 84, 88].entries()) this.bell(midi(n), 0.06, t + 0.15 + i * 0.09, out, 1.8);
  }

  success() {
    if (!this.ctx) return;
    const out = this.out(0, 0.5);
    const t = this.ctx.currentTime;
    [72, 76, 79, 84].forEach((n, i) => this.bell(midi(n), 0.14, t + i * 0.11, out));
  }

  levelUp() {
    if (!this.ctx) return;
    const out = this.out(0, 0.6);
    const t = this.ctx.currentTime;
    [60, 64, 67, 72, 76, 79, 84].forEach((n, i) => this.bell(midi(n), 0.12, t + i * 0.08, out, 2.2));
    [48, 55, 64].forEach((n) => this.tone(midi(n), 0.08, 0.05, 2.5, out, 'triangle', t + 0.6));
  }

  click() {
    if (!this.ctx) return;
    this.tone(1300, 0.05, 0.002, 0.05, this.out(0, 0));
  }

  beep(high = false) {
    if (!this.ctx) return;
    const out = this.out(0, 0.1);
    const t = this.ctx.currentTime;
    this.tone(high ? 1320 : 880, 0.05, 0.003, 0.07, out, 'square', t);
    this.tone(high ? 1760 : 1175, 0.05, 0.003, 0.07, out, 'square', t + 0.08);
  }

  tick(pan = 0) {
    if (!this.ctx) return;
    this.tone(2200 + Math.random() * 1500, 0.02, 0.001, 0.03, this.out(pan, 0.05));
  }

  firework(distance: number, pan: number) {
    if (!this.ctx) return;
    const out = this.out(pan, 0.5);
    const t = this.ctx.currentTime;
    const v = 1 / (1 + distance / 40);
    this.tone(700, 0.03 * v, 0.05, 0.9, out, 'sine', t, 2200);
    this.burst(300, 0.5, 0.5 * v, 1.2, out, t + 0.9, 'lowpass');
    for (let i = 0; i < 14; i++) this.burst(5000, 2, 0.05 * v, 0.03, out, t + 1.0 + Math.random() * 0.8);
  }

  thunder(distance: number) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const delay = distance / 120;
    const t = ctx.currentTime + delay;
    const out = this.out((Math.random() - 0.5) * 0.8, 0.8);
    const src = this.noiseSource();
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 260 + 400 / (1 + distance / 30);
    const g = ctx.createGain();
    const v = 0.9 / (1 + distance / 70);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + 0.08);
    for (let i = 1; i < 8; i++) g.gain.exponentialRampToValueAtTime(v * (0.3 + Math.random() * 0.7) * (1 - i / 9), t + 0.08 + i * 0.45);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 4.5);
    src.connect(f).connect(g).connect(out);
    src.start(t);
    src.stop(t + 4.6);
  }

  // ------------------------------------------------------------ ambience

  private startLoops() {
    const ctx = this.ctx!;
    const mk = (name: string, type: BiquadFilterType, freq: number, q = 0.7) => {
      const src = this.noiseSource(true);
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = 0;
      src.connect(f).connect(g).connect(this.amb);
      src.start();
      this.loops[name] = { gain: g, filter: f };
    };
    mk('wind', 'bandpass', 420, 0.6);
    mk('rain', 'highpass', 1100, 0.5);
    mk('water', 'lowpass', 520, 0.5);
    mk('lava', 'lowpass', 140, 0.8);
  }

  updateAmbience(s: AmbienceState, dt: number) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    this.lastAmb = s;
    const set = (name: string, v: number) => this.loops[name]?.gain.gain.setTargetAtTime(v, t, 0.6);
    const gust = 0.5 + 0.5 * Math.sin(t * 0.21) * Math.sin(t * 0.13 + 1);
    set('wind', 0.025 + Math.min(0.12, Math.max(0, s.altitude - 30) * 0.003) + gust * 0.03 + (s.storm ? 0.1 : 0) + s.rain * 0.03);
    this.loops.wind?.filter?.frequency.setTargetAtTime(320 + gust * 300, t, 0.8);
    set('rain', s.rain * 0.22);
    set('water', s.nearWater * 0.09);
    set('lava', s.nearLava * 0.16);
    this.lowpass.frequency.setTargetAtTime(s.underwater ? 700 : 20000, t, 0.15);

    const birdy = ['foundations', 'classic', 'tokens', 'hub'].includes(s.biome);
    if (t > this.birdAt) {
      this.birdAt = t + 1.5 + Math.random() * 5;
      if (birdy && s.daylight > 0.6 && s.rain < 0.2 && !s.underwater) this.chirp();
    }
    if (t > this.cricketAt) {
      this.cricketAt = t + 0.9 + Math.random() * 2.2;
      if (s.night > 0.6 && s.rain < 0.2 && s.biome !== 'neural' && s.biome !== 'data') this.crickets();
    }
    if (s.nearLava > 0.2 && t > this.lavaAt) {
      this.lavaAt = t + 0.4 + Math.random() * 1.5;
      this.tone(80 + Math.random() * 60, 0.05 * s.nearLava, 0.01, 0.15, this.out((Math.random() - 0.5), 0.2), 'sine', t, 40);
    }
    this.updateMusic(dt, s);
  }

  private chirp() {
    const ctx = this.ctx!;
    const out = this.out((Math.random() - 0.5) * 1.6, 0.35);
    const base = 2200 + Math.random() * 1600;
    const reps = 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < reps; i++) {
      const t = ctx.currentTime + i * (0.12 + Math.random() * 0.05);
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(base, t);
      o.frequency.exponentialRampToValueAtTime(base * 1.45, t + 0.04);
      o.frequency.exponentialRampToValueAtTime(base * 1.1, t + 0.09);
      const g = ctx.createGain();
      this.env(g, t, 0.025, 0.01, 0.08);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + 0.12);
    }
  }

  private crickets() {
    const ctx = this.ctx!;
    const out = this.out((Math.random() - 0.5) * 1.4, 0.2);
    const t0 = ctx.currentTime;
    for (let k = 0; k < 3; k++) {
      const t = t0 + k * 0.16;
      const o = ctx.createOscillator();
      o.frequency.value = 4300 + Math.random() * 300;
      const am = ctx.createOscillator();
      am.frequency.value = 32;
      const amGain = ctx.createGain();
      amGain.gain.value = 0.5;
      const g = ctx.createGain();
      this.env(g, t, 0.012, 0.01, 0.1);
      const vca = ctx.createGain();
      vca.gain.value = 0.5;
      am.connect(amGain).connect(vca.gain);
      o.connect(vca).connect(g).connect(out);
      o.start(t); am.start(t);
      o.stop(t + 0.14); am.stop(t + 0.14);
    }
  }

  // ------------------------------------------------------------ generative music

  private updateMusic(_dt: number, s: AmbienceState) {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    if (this.volumes.music <= 0.001) return;
    if (!this.musicPlaying) {
      if (t < this.restUntil) return;
      this.musicPlaying = true;
      this.musicUntil = t + 55 + Math.random() * 45;
      this.nextChordAt = t + 0.1;
      this.chordIndex = Math.floor(Math.random() * 4);
    }
    if (t > this.musicUntil) {
      this.musicPlaying = false;
      this.restUntil = t + 35 + Math.random() * 60;
      return;
    }
    if (t < this.nextChordAt - 0.5) return;
    const night = s.night > 0.5;
    const chords = night ? NIGHT_CHORDS : DAY_CHORDS;
    const scale = night ? NIGHT_SCALE : DAY_SCALE;
    const start = this.nextChordAt;
    const dur = 8;
    const chord = chords[this.chordIndex % chords.length];
    this.chordIndex++;
    this.nextChordAt = start + dur;
    for (const n of chord) this.pad(midi(n), start, dur + 2, 0.045 / chord.length * 3);
    // Sparse melody over the chord.
    let beat = start + 0.5;
    while (beat < start + dur - 0.5) {
      if (Math.random() < 0.55) this.pluck(midi(scale[Math.floor(Math.random() * scale.length)]), beat, night ? 0.03 : 0.04);
      beat += [0.5, 1, 1, 1.5, 2][Math.floor(Math.random() * 5)];
    }
    this.musicTimer++;
  }

  private pad(freq: number, t: number, dur: number, peak: number) {
    const ctx = this.ctx!;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 900;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 2.4);
    g.gain.setValueAtTime(peak, t + dur - 3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    f.connect(g);
    g.connect(this.music);
    const send = ctx.createGain();
    send.gain.value = 0.6;
    g.connect(send).connect(this.reverbSend);
    for (const [type, detune] of [['triangle', -6], ['sine', 7]] as [OscillatorType, number][]) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      o.detune.value = detune;
      o.connect(f);
      o.start(t);
      o.stop(t + dur + 0.1);
    }
  }

  private pluck(freq: number, t: number, peak: number) {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    this.env(g, t, peak, 0.005, 1.8);
    g.connect(this.music);
    const send = ctx.createGain();
    send.gain.value = 0.8;
    g.connect(send).connect(this.reverbSend);
    const o = ctx.createOscillator();
    o.frequency.value = freq;
    const o2 = ctx.createOscillator();
    o2.type = 'triangle';
    o2.frequency.value = freq * 2;
    const g2 = ctx.createGain();
    g2.gain.value = 0.25;
    o.connect(g);
    o2.connect(g2).connect(g);
    o.start(t); o2.start(t);
    o.stop(t + 2); o2.stop(t + 2);
  }

  get ambience() {
    return this.lastAmb;
  }
}

export const audio = new AudioEngine();
