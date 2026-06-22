/**
 * Physics-derived easing functions.
 *
 * These bridge the simulation world into time-based animation: a spring,
 * bounce, or damped-oscillation curve is what you'd get from a 1-DOF physics
 * solve, precomputed into a reusable `t → value` function. They're part of the
 * `@tenix/physics` public surface (consumed by developers and, later, the
 * keyframe engine) and are fully deterministic.
 *
 * Convention: input t ∈ [0,1] (clamped), output starts at 0 and resolves to ~1.
 */
export type EasingFunction = (t: number) => number;

function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/** Critically-tunable spring: overshoots then settles at 1 (precomputed). */
export function springEasing(stiffness = 100, damping = 10, mass = 1): EasingFunction {
  const steps = 120;
  const dt = 1 / steps;
  let x = 0;
  let v = 0;
  const values: number[] = [0];
  for (let i = 0; i < steps; i++) {
    const springForce = -stiffness * (x - 1); // target = 1
    const dampForce = -damping * v;
    const a = (springForce + dampForce) / mass;
    v += a * dt;
    x += v * dt;
    values.push(x);
  }
  return (t: number) => {
    t = clamp01(t);
    const f = t * steps;
    const i = Math.min(steps, Math.floor(f));
    const frac = f - i;
    const a = values[i];
    const b = values[Math.min(steps, i + 1)];
    return a + (b - a) * frac;
  };
}

/** Ball-drop bounce: accelerates down, bounces with decaying restitution. */
export function bounceEasing(restitution = 0.6): EasingFunction {
  return (t: number) => {
    t = clamp01(t);
    const g = 10;
    const dt = 0.008;
    let v = 0;
    let y = 0;
    let elapsed = 0;
    while (elapsed < t) {
      v += g * dt;
      y += v * dt;
      if (y >= 1) {
        y = 1;
        v = -v * restitution;
      }
      elapsed += dt;
    }
    return clamp01(y);
  };
}

/** Damped harmonic oscillation that settles to 1. */
export function dampedOscillation(frequency = 3, decay = 5): EasingFunction {
  return (t: number) => {
    t = clamp01(t);
    return 1 - Math.exp(-decay * t) * Math.cos(frequency * Math.PI * 2 * t);
  };
}

// ── A couple of standard curves for completeness ──────────
export const easeLinear: EasingFunction = (t) => clamp01(t);
export const easeInOutCubic: EasingFunction = (t) => {
  t = clamp01(t);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};
