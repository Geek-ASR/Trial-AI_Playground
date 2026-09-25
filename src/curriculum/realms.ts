import { B } from '../world/blocks';
import type { Realm, RealmId } from './types';

export const REALMS: Realm[] = [
  {
    id: 'foundations',
    name: 'Foundations Meadow',
    tagline: 'Vectors, matrices and the maths every model is made of.',
    color: '#5fb04a',
    floor: B.GRASS,
    accent: B.GREEN,
    order: 0,
  },
  {
    id: 'data',
    name: 'Data Dunes',
    tagline: 'Statistics and data wrangling: see a dataset before you model it.',
    color: '#e3b341',
    floor: B.SAND,
    accent: B.YELLOW,
    order: 1,
  },
  {
    id: 'classic',
    name: 'Model Woods',
    tagline: 'Regression, classification and clustering — classical ML from first principles.',
    color: '#30a46c',
    floor: B.PATH,
    accent: B.ORANGE,
    order: 2,
  },
  {
    id: 'neural',
    name: 'Neural Peaks',
    tagline: 'Neurons, layers, loss and backprop. Home of the Neural Forge.',
    color: '#3e63dd',
    floor: B.SNOW,
    accent: B.BLUE,
    order: 3,
  },
  {
    id: 'tokens',
    name: 'Token Tides',
    tagline: 'Text, embeddings and attention — the ideas behind modern LLMs.',
    color: '#8e4ec6',
    floor: B.QUARTZ,
    accent: B.PURPLE,
    order: 4,
  },
  {
    id: 'agents',
    name: 'Agent Arena',
    tagline: 'Rewards, values and policies — reinforcement learning, hands-on.',
    color: '#e5484d',
    floor: B.OBSIDIAN,
    accent: B.RED,
    order: 5,
  },
];

export const REALM_BY_ID = new Map<RealmId, Realm>(REALMS.map((r) => [r.id, r]));
