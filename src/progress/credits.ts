/**
 * Block credits: the currency for building. Earn them by solving quizzes, maths
 * and code challenges; spend them placing blocks and code-built shapes.
 * Stored in this browser only, like the rest of your progress.
 */

import { BLOCKS, type BlockId } from '../world/blocks';

const KEY = 'nc.credits.v1';
export const STARTING_CREDITS = 120;

export interface CreditState {
  credits: number;
  earned: number;
  spent: number;
  /** Consecutive correct answers (bonus grows with the streak). */
  streak: number;
  best: number;
  solved: number;
  /** Code challenges already solved (first solve pays the full reward). */
  codeSolved: Record<string, true>;
}

const fresh = (): CreditState => ({ credits: STARTING_CREDITS, earned: 0, spent: 0, streak: 0, best: 0, solved: 0, codeSolved: {} });

let state: CreditState = load();
const listeners = new Set<(s: CreditState) => void>();

function load(): CreditState {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<CreditState> | null;
    if (raw && typeof raw.credits === 'number' && Number.isFinite(raw.credits)) return { ...fresh(), ...raw, codeSolved: { ...(raw.codeSolved ?? {}) } };
  } catch { /* fall through */ }
  return fresh();
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch { /* storage unavailable: credits last for this session */ }
  listeners.forEach((l) => l(state));
}

export function creditState(): Readonly<CreditState> {
  return state;
}

export function credits(): number {
  return state.credits;
}

export function onCredits(fn: (s: CreditState) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Glowing blocks (lamps, crystals, beacons…) cost 3; everything else 1; erasing is free. */
export function blockCost(b: BlockId): number {
  if (!b) return 0;
  return BLOCKS[b]?.light ? 3 : 1;
}

export function canAfford(n: number): boolean {
  return state.credits >= n;
}

/** Take credits if there are enough; returns whether it succeeded. */
export function spend(n: number): boolean {
  if (n <= 0) return true;
  if (state.credits < n) return false;
  state = { ...state, credits: state.credits - n, spent: state.spent + n };
  save();
  return true;
}

export function refund(n: number) {
  if (n <= 0) return;
  state = { ...state, credits: state.credits + n, spent: Math.max(0, state.spent - n) };
  save();
}

/** Streak bonus: +10% per correct answer in a row, up to +100%. */
export function streakMultiplier(streak = state.streak): number {
  return 1 + Math.min(10, streak) * 0.1;
}

/**
 * Record an answer. Correct answers pay `base` × streak bonus (rounded); a wrong
 * answer resets the streak. Returns the credits awarded.
 */
export function answer(correct: boolean, base: number, codeId?: string): number {
  if (!correct) {
    state = { ...state, streak: 0 };
    save();
    return 0;
  }
  // Re-solving a code challenge still pays, just less.
  const repeat = codeId ? !!state.codeSolved[codeId] : false;
  const award = Math.max(1, Math.round((repeat ? base * 0.3 : base) * streakMultiplier()));
  const streak = state.streak + 1;
  state = {
    ...state,
    credits: state.credits + award,
    earned: state.earned + award,
    streak,
    best: Math.max(state.best, streak),
    solved: state.solved + 1,
    codeSolved: codeId ? { ...state.codeSolved, [codeId]: true } : state.codeSolved,
  };
  save();
  return award;
}

/** For tests and the "reset" button. */
export function resetCredits() {
  state = fresh();
  save();
}
