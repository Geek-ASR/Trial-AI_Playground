import type * as THREE from 'three';
import type { ParticleSystem } from '../render/particles';
import type { Player } from '../world/player';
import type { World } from '../world/world';

export interface FrameInfo {
  dt: number;
  time: number;
  camera: THREE.PerspectiveCamera;
  player: Player;
  /** Where the action is: the player, or the camera during the cinematic tour. */
  focus: THREE.Vector3;
  daylight: number;
  night: number;
}

/** Shared services the engine hands to simulations and other world systems. */
export interface SimContext {
  scene: THREE.Scene;
  world: World;
  glow: ParticleSystem;
  solid: ParticleSystem;
  /** Queue voxel edits (not saved as player edits) and relight. */
  setBlocks(ops: { x: number; y: number; z: number; b: number }[], animate?: boolean): void;
}

export interface SimSystem {
  id: string;
  update(f: FrameInfo): void;
  /** Crosshair ray interactions while the mouse is captured; return true to consume. */
  pointer?(kind: 'down' | 'up' | 'move', button: number, ray: THREE.Ray): boolean;
  /** A block changed at (x, y, z). */
  onEdit?(x: number, y: number, z: number): void;
}

export type InteractableKind = 'lesson' | 'forge' | 'lab' | 'flock' | 'kiosk';

export interface Interactable {
  id: string;
  kind: InteractableKind;
  x: number;
  y: number;
  z: number;
  title: string;
  realm?: string;
  lessonId?: string;
  lab?: string;
}
