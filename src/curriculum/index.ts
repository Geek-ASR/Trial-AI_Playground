import { agents } from './lessons/agents';
import { classic } from './lessons/classic';
import { data } from './lessons/data';
import { foundations } from './lessons/foundations';
import { neural } from './lessons/neural';
import { tokens } from './lessons/tokens';
import type { Lesson, RealmId } from './types';

export { REALMS, REALM_BY_ID } from './realms';

export const LESSONS: Lesson[] = [...foundations, ...data, ...classic, ...neural, ...tokens, ...agents];

export const LESSON_BY_ID = new Map(LESSONS.map((l) => [l.id, l]));

export function lessonsIn(realm: RealmId): Lesson[] {
  return LESSONS.filter((l) => l.realm === realm);
}

export const TOTAL_XP = LESSONS.reduce((s, l) => s + l.xp, 0);

/** The lesson after `id` in curriculum order, or undefined at the end. */
export function nextLesson(id: string): Lesson | undefined {
  const i = LESSONS.findIndex((l) => l.id === id);
  return i >= 0 ? LESSONS[i + 1] : undefined;
}
