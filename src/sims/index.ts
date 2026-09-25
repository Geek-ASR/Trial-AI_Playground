import type * as THREE from 'three';
import type { Engine } from '../world/engine';
import type { LabKind } from '../world/layout';
import { Cathedral } from './cathedral';
import { FlockSystem } from './flock';
import { GalaxyLab } from './galaxy';
import { GaltonLab } from './galtonLab';
import { KMeansLab } from './kmeansLab';
import { MazeLab } from './mazeLab';
import { Nova } from './nova';
import { ValleySim } from './valley';

export interface Labs {
  valley: ValleySim;
  galton: GaltonLab;
  kmeans: KMeansLab;
  cathedral: Cathedral;
  galaxy: GalaxyLab;
  maze: MazeLab;
  flock: FlockSystem;
  nova: Nova;
}

/** Create every simulation and register it with the engine's frame loop. */
export function createLabs(engine: Engine): Labs {
  const ctx = engine.simContext;
  const labs: Labs = {
    valley: new ValleySim(ctx),
    galton: new GaltonLab(ctx),
    kmeans: new KMeansLab(ctx),
    cathedral: new Cathedral(ctx),
    galaxy: new GalaxyLab(ctx),
    maze: new MazeLab(ctx),
    flock: new FlockSystem(ctx),
    nova: new Nova(ctx),
  };
  for (const s of Object.values(labs)) engine.addSystem(s);
  return labs;
}

export function labPanel(labs: Labs, kind: LabKind, playerPos: () => THREE.Vector3): { el: HTMLElement; destroy(): void } {
  switch (kind) {
    case 'valley': return labs.valley.panel();
    case 'galton': return labs.galton.panel();
    case 'kmeans': return labs.kmeans.panel(playerPos);
    case 'cathedral': return labs.cathedral.panel();
    case 'galaxy': return labs.galaxy.panel();
    case 'maze': return labs.maze.panel();
  }
}
