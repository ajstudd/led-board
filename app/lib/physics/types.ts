import { Vec2 } from "./math";

/** RGB triple, matching the app's pixel model (0–255 per channel). */
export type RGB = [r: number, g: number, b: number];

export enum BodyType {
  /** Moved by forces and collisions. */
  Dynamic = 0,
  /** Never moves; infinite mass (walls, floor). */
  Static = 1,
  /** Moved externally (by animation/keyframes), unaffected by forces. */
  Kinematic = 2,
}

/**
 * A single physics body. In Tenix each lit grid cell becomes one Particle whose
 * position is continuous (sub-cell precision) and is rasterized back to the grid
 * each step.
 */
export interface Particle {
  id: number;
  type: BodyType;

  position: Vec2;
  /** Previous position — used by Verlet integration and sleeping checks. */
  prevPosition: Vec2;
  velocity: Vec2;
  /** Force accumulator, reset to zero after each integrate. */
  force: Vec2;

  mass: number;
  /** 1 / mass, or 0 for Static/Kinematic bodies (infinite mass). */
  inverseMass: number;

  /** Collision radius in grid cells (default 0.5 ⇒ one cell). */
  radius: number;
  /** Bounciness 0–1. */
  restitution: number;
  /** Tangential friction coefficient 0–1. */
  friction: number;
  /** Per-step velocity multiplier (air drag); 1 = none. */
  damping: number;

  color: RGB;

  /** Sleeping bodies are skipped by integration until disturbed. */
  sleeping: boolean;
  /** Time (s) the body has been below the sleep threshold. */
  sleepTimer: number;
}

/** A collision between two bodies, produced by the narrow phase. */
export interface Contact {
  a: Particle;
  b: Particle;
  /** Unit normal pointing from a → b. */
  normal: Vec2;
  /** Overlap depth along the normal. */
  penetration: number;
}

/** A force field applied to every (awake, dynamic) particle each step. */
export interface ForceField {
  readonly type: string;
  enabled: boolean;
  /** Optional per-step state update, called once before apply() loops. */
  update?(dt: number): void;
  /** True once a one-shot field (e.g. explosion) is spent and can be removed. */
  readonly dead?: boolean;
  apply(p: Particle, dt: number): void;
}

/** A constraint solved iteratively after integration (springs, pins, rods …). */
export interface Constraint {
  readonly type: string;
  solve(dt: number): void;
}

/** Axis-aligned simulation bounds, in grid cells. */
export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface PhysicsConfig {
  /** Constant acceleration applied to dynamic bodies (cells/s²). */
  gravity: Vec2;
  /** Fixed simulation timestep in seconds (determinism requires this). */
  fixedDt: number;
  /**
   * Integration scheme. "euler" (symplectic) is the default for free particles;
   * "verlet" is preferred when constraints are present (cloth/rope) because
   * positional constraint projections then feed back into velocity for free.
   */
  integrator: "euler" | "verlet";
  /** Max accumulated time per frame, to avoid the spiral of death. */
  maxFrameTime: number;
  /** Sequential-impulse iterations for collision resolution. */
  velocityIterations: number;
  /** Iterations for the constraint solver. */
  constraintIterations: number;
  /** Hard simulation bounds (usually the grid); null = unbounded. */
  bounds: Bounds | null;
  /** How bodies behave at the bounds. */
  boundaryMode: "bounce" | "wrap" | "clamp" | "kill";

  /** Defaults applied to particles created by pixelize(). */
  defaultRadius: number;
  defaultRestitution: number;
  defaultFriction: number;
  defaultDamping: number;

  /** Skip integration for settled bodies (big perf win for piles). */
  enableSleeping: boolean;
  /** Speed² below which a body is a sleep candidate. */
  sleepThreshold: number;
  /** Seconds below threshold before a body sleeps. */
  sleepTime: number;

  /** Seed for the world's deterministic RNG. */
  seed: number;

  /** Hard cap on particle count (protects framerate). */
  maxParticles: number;
}

export const DEFAULT_PHYSICS_CONFIG: PhysicsConfig = {
  gravity: new Vec2(0, 30),
  fixedDt: 1 / 60,
  integrator: "euler",
  maxFrameTime: 0.1,
  velocityIterations: 4,
  constraintIterations: 4,
  bounds: null,
  boundaryMode: "bounce",
  defaultRadius: 0.5,
  defaultRestitution: 0.3,
  defaultFriction: 0.2,
  defaultDamping: 0.999,
  enableSleeping: true,
  sleepThreshold: 0.0025,
  sleepTime: 0.5,
  seed: 1,
  maxParticles: 6000,
};
