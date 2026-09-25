import { LESSONS, REALMS, lessonsIn } from '../curriculum';
import type { Lang } from '../curriculum/types';

/**
 * All progress lives in the browser (localStorage) — no accounts, no servers.
 * Learners can export/import a JSON file to move between devices.
 */

const KEY = 'nc.progress.v1';

export interface Progress {
  xp: number;
  completed: Record<string, { at: number; lang: Lang }>;
  badges: Record<string, number>;
  streak: { day: string; count: number; best: number };
  stats: { runs: number; blocksBuilt: number; forgeBest: number; builds: number };
  code: Record<string, Partial<Record<Lang, string>>>;
  lang: Lang;
  onboarded: boolean;
}

export const LEVELS = [
  { xp: 0, title: 'Novice' },
  { xp: 50, title: 'Explorer' },
  { xp: 130, title: 'Data Wrangler' },
  { xp: 240, title: 'Model Maker' },
  { xp: 380, title: 'Neural Tinkerer' },
  { xp: 550, title: 'Gradient Surfer' },
  { xp: 750, title: 'Attention Seeker' },
  { xp: 980, title: 'Agent Tamer' },
  { xp: 1240, title: 'AI Architect' },
  { xp: 1500, title: 'NeuralCrafter' },
  { xp: 1800, title: 'Legend' },
];

export interface BadgeDef {
  id: string;
  name: string;
  icon: string;
  description: string;
}

export const BADGES: BadgeDef[] = [
  { id: 'first-lesson', name: 'First Steps', icon: '👣', description: 'Complete your first lesson.' },
  ...REALMS.map((r) => ({
    id: `realm-${r.id}`,
    name: `${r.name} cleared`,
    icon: ['🌱', '🏜️', '🌲', '🏔️', '🌊', '🏟️'][r.order],
    description: `Complete every lesson in ${r.name}.`,
  })),
  { id: 'polyglot', name: 'Polyglot', icon: '🗣️', description: 'Solve lessons in both JavaScript and Python.' },
  { id: 'pythonista', name: 'Pythonista', icon: '🐍', description: 'Solve 5 lessons in Python.' },
  { id: 'builder', name: 'Code Builder', icon: '🧱', description: 'Build something in the world with code.' },
  { id: 'architect', name: 'Architect', icon: '🏰', description: 'Place 1,000 blocks with code.' },
  { id: 'forge', name: 'Forged', icon: '⚒️', description: 'Train a network to 90% test accuracy in the Neural Forge.' },
  { id: 'spiral', name: 'Spiral Tamer', icon: '🌀', description: 'Hit 90% test accuracy on the spiral dataset.' },
  { id: 'streak-3', name: 'On a Roll', icon: '🔥', description: 'Learn 3 days in a row.' },
  { id: 'streak-7', name: 'Unstoppable', icon: '☄️', description: 'Learn 7 days in a row.' },
  { id: 'graduate', name: 'NeuralCraft Graduate', icon: '🎓', description: 'Complete every lesson.' },
];

export const BADGE_BY_ID = new Map(BADGES.map((b) => [b.id, b]));

const fresh = (): Progress => ({
  xp: 0,
  completed: {},
  badges: {},
  streak: { day: '', count: 0, best: 0 },
  stats: { runs: 0, blocksBuilt: 0, forgeBest: 0, builds: 0 },
  code: {},
  lang: 'py',
  onboarded: false,
});

function read(): Progress {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fresh();
    const p = JSON.parse(raw) as Partial<Progress>;
    const base = fresh();
    return { ...base, ...p, stats: { ...base.stats, ...p.stats }, streak: { ...base.streak, ...p.streak } };
  } catch {
    return fresh();
  }
}

let state = read();
const listeners = new Set<(p: Progress) => void>();

function commit() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* private mode or storage full: progress lasts for this session only */
  }
  listeners.forEach((l) => l(state));
}

export function progress(): Progress {
  return state;
}

export function subscribe(fn: (p: Progress) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function levelInfo(xp = state.xp) {
  let i = 0;
  while (i + 1 < LEVELS.length && xp >= LEVELS[i + 1].xp) i++;
  const cur = LEVELS[i];
  const next = LEVELS[i + 1];
  const frac = next ? (xp - cur.xp) / (next.xp - cur.xp) : 1;
  return { level: i + 1, title: cur.title, next: next?.xp ?? null, frac, xp };
}

export function isDone(lessonId: string): boolean {
  return !!state.completed[lessonId];
}

function today(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function touchStreak(): string[] {
  const t = today();
  if (state.streak.day === t) return [];
  const y = new Date();
  y.setDate(y.getDate() - 1);
  state.streak.count = state.streak.day === today(y) ? state.streak.count + 1 : 1;
  state.streak.day = t;
  state.streak.best = Math.max(state.streak.best, state.streak.count);
  const out: string[] = [];
  if (state.streak.count >= 3) out.push('streak-3');
  if (state.streak.count >= 7) out.push('streak-7');
  return out;
}

function grant(ids: string[]): string[] {
  const fresh: string[] = [];
  for (const id of ids) {
    if (!state.badges[id] && BADGE_BY_ID.has(id)) {
      state.badges[id] = Date.now();
      fresh.push(id);
    }
  }
  return fresh;
}

export interface Reward {
  xp: number;
  badges: string[];
  levelUp: number | null;
  firstTime: boolean;
}

export function completeLesson(lessonId: string, lang: Lang): Reward {
  const lesson = LESSONS.find((l) => l.id === lessonId);
  const before = levelInfo().level;
  const firstTime = !state.completed[lessonId];
  const prevLang = state.completed[lessonId]?.lang;
  let xp = 0;
  if (firstTime && lesson) {
    xp = lesson.xp;
    state.xp += xp;
    state.completed[lessonId] = { at: Date.now(), lang };
  } else if (prevLang && prevLang !== lang) {
    // Solving it again in the other language earns a small bonus once.
    const bonusKey = `bonus:${lessonId}`;
    if (!state.badges[bonusKey]) {
      state.badges[bonusKey] = Date.now();
      xp = 10;
      state.xp += xp;
    }
  }

  const candidates = ['first-lesson', ...touchStreak()];
  for (const r of REALMS) if (lessonsIn(r.id).every((l) => state.completed[l.id])) candidates.push(`realm-${r.id}`);
  const langs = new Set(Object.values(state.completed).map((c) => c.lang));
  if (prevLang && prevLang !== lang) langs.add(lang);
  if (langs.size > 1) candidates.push('polyglot');
  if (Object.values(state.completed).filter((c) => c.lang === 'py').length >= 5) candidates.push('pythonista');
  if (LESSONS.every((l) => state.completed[l.id])) candidates.push('graduate');
  const badges = grant(candidates);
  const after = levelInfo().level;
  commit();
  return { xp, badges, levelUp: after > before ? after : null, firstTime };
}

export function recordRun() {
  state.stats.runs++;
  commit();
}

export function recordBuild(blocks: number): string[] {
  state.stats.blocksBuilt += blocks;
  state.stats.builds++;
  const b = grant(['builder', ...(state.stats.blocksBuilt >= 1000 ? ['architect'] : []), ...touchStreak()]);
  commit();
  return b;
}

export function recordForge(testAcc: number, dataset: string): string[] {
  state.stats.forgeBest = Math.max(state.stats.forgeBest, testAcc);
  const ids: string[] = [];
  if (testAcc >= 0.9) ids.push('forge');
  if (testAcc >= 0.9 && dataset === 'spiral') ids.push('spiral');
  const b = grant(ids);
  if (b.length) commit();
  return b;
}

export function saveCode(lessonId: string, lang: Lang, code: string) {
  state.code[lessonId] = { ...state.code[lessonId], [lang]: code };
  commit();
}

export function setLang(lang: Lang) {
  state.lang = lang;
  commit();
}

export function setOnboarded() {
  state.onboarded = true;
  commit();
}

export function exportProgress(): string {
  return JSON.stringify({ app: 'neuralcraft', version: 1, progress: state }, null, 2);
}

export function importProgress(json: string): boolean {
  try {
    const data = JSON.parse(json);
    if (data?.app !== 'neuralcraft' || !data.progress) return false;
    state = { ...fresh(), ...data.progress };
    commit();
    return true;
  } catch {
    return false;
  }
}

export function resetProgress() {
  state = fresh();
  commit();
}
