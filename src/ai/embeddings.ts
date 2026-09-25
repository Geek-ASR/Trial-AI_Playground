/**
 * The Embedding Galaxy: a hand-built 3-D "embedding space" where meaning is
 * direction. Real models learn hundreds of dimensions from text; here the same
 * geometry is constructed by hand so the famous analogies work exactly —
 * king − man + woman lands on queen because gender and royalty are consistent
 * offsets, just like in word2vec.
 */

import { mulberry, type Vec3 } from './kmeans3d';

export interface Word {
  word: string;
  cluster: string;
  pos: Vec3;
}

export interface Cluster {
  id: string;
  name: string;
  color: string;
  center: Vec3;
}

export const CLUSTERS: Cluster[] = [
  { id: 'people', name: 'People & family', color: '#ffb86b', center: [-8, 3, 3] },
  { id: 'countries', name: 'Countries & capitals', color: '#7ef9ff', center: [9, -2, -3] },
  { id: 'verbs', name: 'Actions (verbs)', color: '#a3ff8f', center: [-3, -9, -7] },
  { id: 'adjectives', name: 'Describing words', color: '#ff8fd8', center: [6, 9, 4] },
  { id: 'animals', name: 'Animals', color: '#ffe66b', center: [1, 4, -11] },
  { id: 'food', name: 'Fruit & food', color: '#ff7a6b', center: [-11, -5, -6] },
  { id: 'ai', name: 'AI & machine learning', color: '#b99bff', center: [10, 7, -9] },
  { id: 'feelings', name: 'Feelings', color: '#8fb8ff', center: [0, -9, 9] },
];

/** Consistent directions — the heart of why analogies work. */
const OFFSET = {
  female: [0, 0.4, 2.7] as Vec3,
  royal: [0.4, 3.2, -0.3] as Vec3,
  young: [-2.6, -0.6, 0.4] as Vec3,
  parent: [1.8, -1.4, 0.6] as Vec3,
  sibling: [1.1, 1.3, -1.9] as Vec3,
  spouse: [-1.5, -1.8, -0.8] as Vec3,
  capital: [2.1, 1.6, 1.9] as Vec3,
  past: [2.6, -1.1, 0.3] as Vec3,
  gerund: [0.2, 2.2, 1.9] as Vec3,
  more: [2.1, 0.5, -0.4] as Vec3,
};

const add = (...v: Vec3[]): Vec3 => v.reduce((a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], [0, 0, 0] as Vec3);
const scale = (v: Vec3, k: number): Vec3 => [v[0] * k, v[1] * k, v[2] * k];

function build(): Word[] {
  const r = mulberry(2026);
  const jitter = (c: Vec3, s = 2.6): Vec3 => [c[0] + (r() * 2 - 1) * s, c[1] + (r() * 2 - 1) * s, c[2] + (r() * 2 - 1) * s];
  const C = new Map(CLUSTERS.map((c) => [c.id, c.center]));
  const out: Word[] = [];
  const put = (word: string, cluster: string, pos: Vec3) => out.push({ word, cluster, pos });

  // People: every word is "man" plus a sum of attribute directions.
  const man = jitter(C.get('people')!, 0.5);
  const person = (word: string, ...attrs: (keyof typeof OFFSET)[]) => put(word, 'people', add(man, ...attrs.map((a) => OFFSET[a])));
  person('man');
  person('woman', 'female');
  person('boy', 'young');
  person('girl', 'female', 'young');
  person('king', 'royal');
  person('queen', 'royal', 'female');
  person('prince', 'royal', 'young');
  person('princess', 'royal', 'female', 'young');
  person('father', 'parent');
  person('mother', 'parent', 'female');
  person('brother', 'sibling');
  person('sister', 'sibling', 'female');
  person('husband', 'spouse');
  person('wife', 'spouse', 'female');

  for (const [country, capital] of [
    ['France', 'Paris'], ['Japan', 'Tokyo'], ['India', 'Delhi'], ['Italy', 'Rome'], ['Germany', 'Berlin'],
    ['Egypt', 'Cairo'], ['Brazil', 'Brasília'], ['Kenya', 'Nairobi'], ['Canada', 'Ottawa'], ['Spain', 'Madrid'],
  ]) {
    const p = jitter(C.get('countries')!, 3.2);
    put(country, 'countries', p);
    put(capital, 'countries', add(p, OFFSET.capital));
  }

  for (const [base, past, ing] of [
    ['walk', 'walked', 'walking'], ['swim', 'swam', 'swimming'], ['run', 'ran', 'running'], ['eat', 'ate', 'eating'],
    ['fly', 'flew', 'flying'], ['write', 'wrote', 'writing'], ['sing', 'sang', 'singing'],
  ]) {
    const p = jitter(C.get('verbs')!, 2.8);
    put(base, 'verbs', p);
    put(past, 'verbs', add(p, OFFSET.past));
    put(ing, 'verbs', add(p, OFFSET.gerund));
  }

  for (const [base, more, most] of [
    ['good', 'better', 'best'], ['big', 'bigger', 'biggest'], ['fast', 'faster', 'fastest'],
    ['happy', 'happier', 'happiest'], ['small', 'smaller', 'smallest'],
  ]) {
    const p = jitter(C.get('adjectives')!, 2.6);
    put(base, 'adjectives', p);
    put(more, 'adjectives', add(p, OFFSET.more));
    put(most, 'adjectives', add(p, scale(OFFSET.more, 2)));
  }

  for (const [adult, young] of [['dog', 'puppy'], ['cat', 'kitten'], ['cow', 'calf'], ['sheep', 'lamb'], ['horse', 'foal'], ['duck', 'duckling']]) {
    const p = jitter(C.get('animals')!, 2.8);
    put(adult, 'animals', p);
    put(young, 'animals', add(p, OFFSET.young));
  }

  for (const w of ['apple', 'banana', 'mango', 'orange', 'grape', 'cherry', 'pineapple', 'bread', 'rice']) put(w, 'food', jitter(C.get('food')!, 3));
  for (const w of ['neuron', 'gradient', 'tensor', 'transformer', 'attention', 'token', 'embedding', 'dataset', 'model', 'loss']) put(w, 'ai', jitter(C.get('ai')!, 3.2));
  for (const w of ['joy', 'sadness', 'anger', 'fear', 'calm', 'excitement', 'love']) put(w, 'feelings', jitter(C.get('feelings')!, 3));
  return out;
}

export const WORDS: Word[] = build();
export const WORD_BY_NAME = new Map(WORDS.map((w) => [w.word, w]));

export const ANALOGY_PRESETS: [string, string, string][] = [
  ['king', 'man', 'woman'],
  ['Paris', 'France', 'Japan'],
  ['walked', 'walk', 'swim'],
  ['kitten', 'cat', 'dog'],
  ['bigger', 'big', 'fast'],
  ['Rome', 'Italy', 'India'],
  ['princess', 'prince', 'king'],
  ['best', 'good', 'happy'],
];

export function distance(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/** a − b + c, and the nearest word to it (excluding the three inputs). */
export function analogy(a: string, b: string, c: string): { target: Vec3; answer: Word; distance: number } | null {
  const A = WORD_BY_NAME.get(a), Bw = WORD_BY_NAME.get(b), Cw = WORD_BY_NAME.get(c);
  if (!A || !Bw || !Cw) return null;
  const target: Vec3 = [A.pos[0] - Bw.pos[0] + Cw.pos[0], A.pos[1] - Bw.pos[1] + Cw.pos[1], A.pos[2] - Bw.pos[2] + Cw.pos[2]];
  let best: Word | null = null, bd = Infinity;
  for (const w of WORDS) {
    if (w === A || w === Bw || w === Cw) continue;
    const d = distance(w.pos, target);
    if (d < bd) { bd = d; best = w; }
  }
  return best ? { target, answer: best, distance: bd } : null;
}

export function nearest(word: string, k = 5): { word: Word; distance: number }[] {
  const w = WORD_BY_NAME.get(word);
  if (!w) return [];
  return WORDS.filter((o) => o !== w)
    .map((o) => ({ word: o, distance: distance(o.pos, w.pos) }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, k);
}
