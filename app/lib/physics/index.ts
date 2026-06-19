/**
 * @tenix/physics — headless, deterministic 2D pixel-physics engine.
 *
 * Zero dependencies on React, the DOM, or canvas. This single module is the
 * foundation for:
 *   • the in-app per-layer physics (one PhysicsWorld per layer),
 *   • the standalone npm package,
 *   • the embeddable <tenix-board> widget,
 *   • the in-app scripting sandbox,
 *   • the server-side / CLI renderer.
 *
 * Minimal usage:
 *
 *   import { PhysicsWorld, explode } from "@tenix/physics";
 *   const world = new PhysicsWorld({ seed: 42 });
 *   world.pixelize(gridData, cols, rows);   // lit cells → particles
 *   explode(world);                          // a preset
 *   // each frame:
 *   const alpha = world.update(deltaSeconds);
 *   world.rasterizeInterpolatedTo(gridData, cols, rows, alpha);
 *
 * For frame-exact export, drive it with a fixed loop instead:
 *   for (let f = 0; f < frames; f++) { world.step(1/60); world.rasterizeTo(...); }
 */

export { Vec2, clamp } from "./math";
export { Rng } from "./rng";
export {
  BodyType,
  DEFAULT_PHYSICS_CONFIG,
} from "./types";
export type {
  RGB,
  Particle,
  Contact,
  ForceField,
  Constraint,
  Bounds,
  PhysicsConfig,
} from "./types";
export { PhysicsWorld } from "./world";
export { integrateSymplectic, integrateVerlet, wake } from "./integrator";
export { SpatialHashGrid } from "./spatialHash";
export { circleVsCircle, resolveContact, resolveBounds } from "./collision";
export {
  DirectionalGravity,
  Wind,
  Vortex,
  Attractor,
  Explosion,
  Drag,
} from "./forces";
export { DistanceConstraint, PinConstraint } from "./constraints";
export {
  pixelize,
  rasterize,
  rasterizeInterpolated,
  forEachLitCell,
} from "./rasterizer";
export {
  explode,
  gravityDrop,
  fountain,
  scatter,
  antigravity,
  swirl,
  magnet,
  breeze,
  buildRope,
  buildCloth,
  applyPreset,
} from "./presets";
export type { PresetName, ExplodeOptions } from "./presets";
