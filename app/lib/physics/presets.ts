import { PhysicsWorld } from "./world";
import { Vec2 } from "./math";
import { BodyType, RGB } from "./types";
import { Explosion, Vortex, Attractor, Wind } from "./forces";
import { DistanceConstraint, PinConstraint } from "./constraints";

/**
 * Presets are the creator-facing layer: one call wires up the forces, velocities
 * and config for a recognizable effect on the already-pixelized world. They are
 * deterministic (any randomness uses world.rng) so the result is reproducible
 * and exportable.
 */

function center(world: PhysicsWorld): Vec2 {
  const b = world.config.bounds;
  if (!b) return new Vec2(0, 0);
  return new Vec2((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2);
}

export interface ExplodeOptions {
  at?: Vec2;
  strength?: number;
  radius?: number;
  jitter?: number;
}

/** Blow pixels outward from a point. */
export function explode(world: PhysicsWorld, opts: ExplodeOptions = {}): void {
  const at = opts.at ?? center(world);
  const strength = opts.strength ?? 90;
  const radius = opts.radius ?? Math.max(world.config.bounds ? world.config.bounds.maxX : 60, 60);
  const jitter = opts.jitter ?? 0.35;
  world.wakeAll();
  for (const p of world.particles) {
    if (p.type !== BodyType.Dynamic) continue;
    const dx = p.position.x - at.x;
    const dy = p.position.y - at.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1e-6;
    const falloff = Math.max(0, 1 - dist / radius);
    const speed = strength * falloff * (1 + world.rng.signed() * jitter);
    p.velocity.x += (dx / dist) * speed;
    p.velocity.y += (dy / dist) * speed;
  }
  // a brief residual outward field for a punchier blast
  world.addForce(new Explosion(at.clone(), strength * 6, radius, 0.1));
}

/** Pixels fall under gravity and settle/bounce on the floor. */
export function gravityDrop(world: PhysicsWorld, gravityY = 36): void {
  world.config.gravity = new Vec2(0, gravityY);
  world.config.boundaryMode = "bounce";
  world.wakeAll();
}

/** Pixels shoot upward then rain back down. */
export function fountain(world: PhysicsWorld, power = 45, spread = 12): void {
  world.config.gravity = new Vec2(0, 36);
  world.config.boundaryMode = "bounce";
  const c = center(world);
  world.wakeAll();
  for (const p of world.particles) {
    if (p.type !== BodyType.Dynamic) continue;
    p.velocity.y -= power * (0.6 + world.rng.next() * 0.4);
    p.velocity.x += (p.position.x - c.x) * 0.1 + world.rng.signed() * spread;
  }
}

/** Random deterministic scatter (great for shimmer / dissolve starts). */
export function scatter(world: PhysicsWorld, speed = 25): void {
  world.wakeAll();
  for (const p of world.particles) {
    if (p.type !== BodyType.Dynamic) continue;
    const angle = world.rng.next() * Math.PI * 2;
    const mag = world.rng.next() * speed;
    p.velocity.x += Math.cos(angle) * mag;
    p.velocity.y += Math.sin(angle) * mag;
  }
}

/** Inverted gravity — pixels float upward. */
export function antigravity(world: PhysicsWorld, gravityY = 20): void {
  world.config.gravity = new Vec2(0, -gravityY);
  world.config.boundaryMode = "bounce";
  world.wakeAll();
}

/** Swirl pixels around a point (whirlpool). */
export function swirl(world: PhysicsWorld, at?: Vec2, strength = 50): void {
  const c = at ?? center(world);
  world.config.gravity = new Vec2(0, 0);
  world.addForce(new Vortex(c.clone(), strength, 4, Math.max(world.config.bounds ? world.config.bounds.maxX : 80, 80)));
}

/** Pull pixels toward (attract>0) or push from (attract<0) a point. */
export function magnet(world: PhysicsWorld, at?: Vec2, strength = 70): void {
  const c = at ?? center(world);
  world.config.gravity = new Vec2(0, 0);
  world.addForce(new Attractor(c.clone(), strength, Math.max(world.config.bounds ? world.config.bounds.maxX : 100, 100)));
}

/** Blow pixels sideways with turbulence. */
export function breeze(world: PhysicsWorld, dir = new Vec2(18, 0), turbulence = 10): void {
  world.config.gravity = new Vec2(0, 6);
  world.addForce(new Wind(dir.clone(), turbulence));
}

/**
 * Build a hanging rope of `count` segments from `start`, pinned at the top.
 * Replaces existing particles. Uses Verlet for stable constraints.
 */
export function buildRope(
  world: PhysicsWorld,
  start: Vec2,
  count: number,
  segment: number,
  color: RGB = [255, 255, 255],
): void {
  world.clear();
  world.config.integrator = "verlet";
  world.config.constraintIterations = 6;
  let prev = null as ReturnType<PhysicsWorld["makeParticle"]> | null;
  for (let i = 0; i < count; i++) {
    const p = world.makeParticle(start.x, start.y + i * segment, color);
    world.addParticle(p);
    if (i === 0) {
      world.addConstraint(new PinConstraint(p));
    } else if (prev) {
      world.addConstraint(new DistanceConstraint(prev, p, segment));
    }
    prev = p;
  }
}

/**
 * Build a cloth grid of cols × rows particles with the top row pinned.
 * Replaces existing particles. Uses Verlet for stable constraints.
 */
export function buildCloth(
  world: PhysicsWorld,
  origin: Vec2,
  cols: number,
  rows: number,
  spacing: number,
  color: RGB = [255, 255, 255],
): void {
  world.clear();
  world.config.integrator = "verlet";
  world.config.constraintIterations = 6;
  const grid: ReturnType<PhysicsWorld["makeParticle"]>[][] = [];
  for (let r = 0; r < rows; r++) {
    grid[r] = [];
    for (let c = 0; c < cols; c++) {
      const p = world.makeParticle(origin.x + c * spacing, origin.y + r * spacing, color);
      world.addParticle(p);
      grid[r][c] = p;
      if (r === 0) world.addConstraint(new PinConstraint(p)); // pin top edge
      if (c > 0) world.addConstraint(new DistanceConstraint(grid[r][c - 1], p, spacing));
      if (r > 0) world.addConstraint(new DistanceConstraint(grid[r - 1][c], p, spacing));
    }
  }
}

export type PresetName =
  | "explode"
  | "gravityDrop"
  | "fountain"
  | "scatter"
  | "antigravity"
  | "swirl"
  | "magnet"
  | "breeze";

/** Apply a named preset (the impulse/force ones that act on pixelized content). */
export function applyPreset(world: PhysicsWorld, name: PresetName): void {
  switch (name) {
    case "explode": return explode(world);
    case "gravityDrop": return gravityDrop(world);
    case "fountain": return fountain(world);
    case "scatter": return scatter(world);
    case "antigravity": return antigravity(world);
    case "swirl": return swirl(world);
    case "magnet": return magnet(world);
    case "breeze": return breeze(world);
  }
}
