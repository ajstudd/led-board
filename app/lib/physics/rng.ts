/**
 * Rng — instance-based, seedable PRNG (mulberry32).
 *
 * Each PhysicsWorld owns its own Rng so that simulations are fully
 * deterministic and independent per layer: same seed + same inputs ⇒ identical
 * particle state every run. This is what makes physics record/replay and
 * frame-exact export possible. Never use Math.random() in the simulation loop.
 *
 * The algorithm matches the app's seededRng so behaviour is consistent, but
 * this class has no app dependencies (so it ships with `@tenix/physics`).
 */
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** Uniform float in [0, 1). */
  next(): number {
    let t = (this.state += 0x6d2b79f5) >>> 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Uniform float in [min, max). */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Uniform integer in [0, maxExclusive). */
  int(maxExclusive: number): number {
    if (maxExclusive <= 0) return 0;
    return Math.floor(this.next() * maxExclusive);
  }

  /** Random unit-ish vector components in [-1, 1]. */
  signed(): number {
    return this.next() * 2 - 1;
  }

  /** Reseed in place (resets the stream). */
  reseed(seed: number): void {
    this.state = seed >>> 0;
  }
}
