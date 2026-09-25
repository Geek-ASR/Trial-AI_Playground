import type { VoxelOp } from '../world/ops';

export type Lang = 'js' | 'py';

/**
 * A test is a single function call written in the tiny subset of syntax that is
 * valid in both JavaScript and Python: identifiers, numbers, strings in double
 * quotes and (nested) list literals. That lets one test list check both languages.
 */
export interface LessonTest {
  call: string;
  expect: unknown;
  /** Absolute tolerance for numeric comparisons (default 1e-6). */
  tol?: number;
}

export interface LessonViz {
  /** Calls (same syntax rules as tests) whose results are fed to `render`. */
  calls: string[];
  /** Turn the learner's results into voxels, relative to the realm's display pad (0,0,0 = pad centre). */
  render: (values: unknown[]) => VoxelOp[];
  caption: string;
}

export interface Lesson {
  id: string;
  realm: RealmId;
  title: string;
  /** One-line hook shown on the station label and map. */
  summary: string;
  level: 'beginner' | 'intermediate' | 'advanced';
  xp: number;
  /** Markdown theory, kept short: one idea per lesson. */
  theory: string;
  /** Markdown description of what to write. */
  task: string;
  fn: string;
  starter: Record<Lang, string>;
  solution: Record<Lang, string>;
  hints: string[];
  tests: LessonTest[];
  viz?: LessonViz;
}

export type RealmId = 'foundations' | 'data' | 'classic' | 'neural' | 'tokens' | 'agents';

export interface Realm {
  id: RealmId;
  name: string;
  tagline: string;
  /** CSS colour used in the UI and for the realm's portal. */
  color: string;
  /** Block used for the realm's plaza floor. */
  floor: number;
  accent: number;
  order: number;
}
