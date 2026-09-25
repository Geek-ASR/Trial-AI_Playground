import * as THREE from 'three';
import { LAB_NAMES, type Engine } from '../world/engine';
import { GROUND, HUB, LAB_BY_KIND, SITE_BY_REALM } from '../world/layout';
import { GALAXY } from './geometry';

interface Shot {
  pos: [number, number, number];
  look: [number, number, number];
  caption: string;
  sub?: string;
  seconds: number;
}

/** A drone flyover of the whole world, shown the first time someone visits (or from the menu). */
export function buildTour(): Shot[] {
  const H = HUB, g = GROUND;
  const lab = (k: Parameters<typeof LAB_BY_KIND.get>[0]) => LAB_BY_KIND.get(k)!;
  const realm = (r: Parameters<typeof SITE_BY_REALM.get>[0]) => SITE_BY_REALM.get(r)!;
  const around = (x: number, z: number, angle: number, dist: number, height: number): [number, number, number] =>
    [x + Math.cos(angle) * dist, g + height, z + Math.sin(angle) * dist];
  const shots: Shot[] = [
    { pos: [H.x, g + 95, H.z + 120], look: [H.x, g, H.z], caption: 'NeuralCraft', sub: 'A world where you learn AI by building it', seconds: 5 },
    { pos: [H.x + 14, g + 9, H.z + 22], look: [H.x, g + 5, H.z], caption: 'The Hub', sub: 'Six portal rings lead to six realms of lessons', seconds: 4.5 },
  ];
  const stops: [Parameters<typeof LAB_BY_KIND.get>[0], string][] = [
    ['valley', 'Race optimisers down a loss landscape'],
    ['galton', 'Watch randomness build a bell curve'],
    ['kmeans', 'See clustering happen in 3-D'],
    ['cathedral', 'Draw a digit, watch a neural network think'],
    ['galaxy', 'Walk among word embeddings'],
    ['maze', 'Reshape a maze while robots learn it'],
  ];
  for (const [kind, sub] of stops) {
    const l = lab(kind);
    const r = realm(l.realm);
    shots.push({ pos: around(r.x, r.z, r.angle + Math.PI + 0.5, 30, 22), look: [r.x, g + 4, r.z], caption: '', seconds: 3.2 });
    const look: [number, number, number] =
      kind === 'galaxy' ? [l.x, g + GALAXY.centerV, l.z] :
      kind === 'galton' ? [l.x, g + 22, l.z] :
      kind === 'kmeans' ? [l.x, g + 14, l.z] :
      kind === 'cathedral' ? [l.x, g + 10, l.z] : [l.x, g + 6, l.z];
    const dist = kind === 'galton' ? 42 : kind === 'galaxy' ? 46 : 34;
    const height = kind === 'galaxy' ? 24 : kind === 'galton' ? 26 : 18;
    shots.push({ pos: around(l.x, l.z, l.angle + Math.PI + 0.35, dist, height), look, caption: LAB_NAMES[kind], sub, seconds: 4.8 });
  }
  shots.push({ pos: [H.x - 40, g + 130, H.z + 170], look: [H.x, g, H.z], caption: 'Free. No sign-in. Just play.', sub: 'Every beam of light is a lesson waiting for you', seconds: 5.5 });
  return shots;
}

/**
 * Drive the engine's camera along a smooth spline through the shots.
 * Returns a stop function.
 */
export function playTour(engine: Engine, onCaption: (title: string, sub: string) => void, onDone: () => void): () => void {
  const shots = buildTour();
  const start = engine.camera.position.clone();
  const eye = engine.player.eye();
  const posCurve = new THREE.CatmullRomCurve3([start, ...shots.map((s) => new THREE.Vector3(...s.pos)), eye], false, 'centripetal');
  const lookCurve = new THREE.CatmullRomCurve3([
    start.clone().add(engine.player.lookDir().multiplyScalar(10)),
    ...shots.map((s) => new THREE.Vector3(...s.look)),
    eye.clone().add(engine.player.lookDir().multiplyScalar(10)),
  ], false, 'centripetal');
  const times = [0];
  for (const s of shots) times.push(times[times.length - 1] + s.seconds);
  const total = times[times.length - 1] + 3;
  times.push(total);
  let t = 0;
  let lastCaption = -1;
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    engine.cinematic = null;
    onDone();
  };
  engine.cinematic = (dt, cam) => {
    if (stopped) return false;
    t += dt;
    // Map time to curve parameter piecewise so each shot gets its own duration.
    let seg = 0;
    while (seg < times.length - 2 && t > times[seg + 1]) seg++;
    const local = Math.min(1, (t - times[seg]) / (times[seg + 1] - times[seg]));
    const eased = local * local * (3 - 2 * local);
    const u = (seg + eased) / (times.length - 1);
    cam.position.copy(posCurve.getPointAt(Math.min(1, u)));
    cam.lookAt(lookCurve.getPointAt(Math.min(1, u)));
    const shot = shots[seg - 1];
    const idx = shot?.caption ? seg - 1 : -1;
    if (idx !== lastCaption) {
      lastCaption = idx;
      onCaption(shot?.caption ?? '', shot?.sub ?? '');
    }
    if (t >= total) {
      stop();
      return false;
    }
    return true;
  };
  return stop;
}
