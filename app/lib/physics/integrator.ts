import { Particle, BodyType, PhysicsConfig } from "./types";

/**
 * Symplectic (semi-implicit) Euler — energy-conserving and stable for the
 * gravity/collision cases that dominate Tenix. This is the default integrator.
 *
 * Position uses the *updated* velocity, which is the key difference from plain
 * explicit Euler and the reason it stays stable under gravity.
 */
export function integrateSymplectic(
  particles: Particle[],
  dt: number,
  cfg: PhysicsConfig,
): void {
  const sleepThresh = cfg.sleepThreshold;
  for (const p of particles) {
    if (p.type !== BodyType.Dynamic || p.sleeping) continue;

    // v += (F / m) * dt
    p.velocity.x += p.force.x * p.inverseMass * dt;
    p.velocity.y += p.force.y * p.inverseMass * dt;

    // air drag
    p.velocity.x *= p.damping;
    p.velocity.y *= p.damping;

    // x_prev is kept for sleeping + any Verlet constraint passes
    p.prevPosition.x = p.position.x;
    p.prevPosition.y = p.position.y;

    // x += v * dt
    p.position.x += p.velocity.x * dt;
    p.position.y += p.velocity.y * dt;

    // reset accumulator
    p.force.x = 0;
    p.force.y = 0;

    if (cfg.enableSleeping) {
      const speedSq = p.velocity.x * p.velocity.x + p.velocity.y * p.velocity.y;
      if (speedSq < sleepThresh) {
        p.sleepTimer += dt;
        if (p.sleepTimer >= cfg.sleepTime) {
          p.sleeping = true;
          p.velocity.x = 0;
          p.velocity.y = 0;
        }
      } else {
        p.sleepTimer = 0;
      }
    }
  }
}

/**
 * Verlet integration — preferred for constrained systems (cloth, rope) because
 * position constraints can be satisfied directly without tracking velocity.
 * Velocity is implied by (position - prevPosition).
 */
export function integrateVerlet(
  particles: Particle[],
  dt: number,
): void {
  const dtSq = dt * dt;
  for (const p of particles) {
    if (p.type !== BodyType.Dynamic || p.sleeping) continue;

    const ax = p.force.x * p.inverseMass;
    const ay = p.force.y * p.inverseMass;

    const px = p.position.x;
    const py = p.position.y;

    // x_next = 2x - x_prev + a*dt²  (with damping on the implicit velocity)
    const vx = (p.position.x - p.prevPosition.x) * p.damping;
    const vy = (p.position.y - p.prevPosition.y) * p.damping;

    p.position.x = px + vx + ax * dtSq;
    p.position.y = py + vy + ay * dtSq;

    p.prevPosition.x = px;
    p.prevPosition.y = py;

    // keep an explicit velocity available for collision response
    p.velocity.x = (p.position.x - p.prevPosition.x) / dt;
    p.velocity.y = (p.position.y - p.prevPosition.y) / dt;

    p.force.x = 0;
    p.force.y = 0;
  }
}

/** Wake a sleeping body (called when a force or collision disturbs it). */
export function wake(p: Particle): void {
  p.sleeping = false;
  p.sleepTimer = 0;
}
