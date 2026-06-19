import { Particle, Contact, Bounds, PhysicsConfig } from "./types";
import { Vec2 } from "./math";
import { wake } from "./integrator";

/**
 * Narrow phase: circle vs circle. Returns a Contact or null.
 * Particles are modelled as circles of `radius` cells.
 */
export function circleVsCircle(a: Particle, b: Particle): Contact | null {
  const dx = b.position.x - a.position.x;
  const dy = b.position.y - a.position.y;
  const distSq = dx * dx + dy * dy;
  const minDist = a.radius + b.radius;
  if (distSq >= minDist * minDist) return null;

  const dist = Math.sqrt(distSq);
  const normal =
    dist > 1e-9 ? new Vec2(dx / dist, dy / dist) : new Vec2(1, 0);
  return { a, b, normal, penetration: minDist - dist };
}

/**
 * Impulse-based contact resolution with Coulomb friction and Baumgarte-style
 * position correction (anti-sinking). Static/Kinematic bodies have inverseMass 0
 * so they absorb impulses without moving.
 */
export function resolveContact(c: Contact): void {
  const { a, b, normal, penetration } = c;
  const invMassSum = a.inverseMass + b.inverseMass;
  if (invMassSum === 0) return; // two immovable bodies

  // wake both so resting piles react to new collisions
  if (a.sleeping) wake(a);
  if (b.sleeping) wake(b);

  // relative velocity along the normal
  const rvx = b.velocity.x - a.velocity.x;
  const rvy = b.velocity.y - a.velocity.y;
  const velAlongNormal = rvx * normal.x + rvy * normal.y;

  if (velAlongNormal < 0) {
    // bodies are approaching — apply restitution impulse
    const e = Math.min(a.restitution, b.restitution);
    const j = (-(1 + e) * velAlongNormal) / invMassSum;

    const ix = j * normal.x;
    const iy = j * normal.y;
    a.velocity.x -= ix * a.inverseMass;
    a.velocity.y -= iy * a.inverseMass;
    b.velocity.x += ix * b.inverseMass;
    b.velocity.y += iy * b.inverseMass;

    // friction (tangential) impulse
    const rvx2 = b.velocity.x - a.velocity.x;
    const rvy2 = b.velocity.y - a.velocity.y;
    let tx = rvx2 - (rvx2 * normal.x + rvy2 * normal.y) * normal.x;
    let ty = rvy2 - (rvx2 * normal.x + rvy2 * normal.y) * normal.y;
    const tLen = Math.sqrt(tx * tx + ty * ty);
    if (tLen > 1e-6) {
      tx /= tLen;
      ty /= tLen;
      const jt = -(rvx2 * tx + rvy2 * ty) / invMassSum;
      const mu = Math.sqrt(a.friction * b.friction);
      const clampedJt = Math.max(-j * mu, Math.min(j * mu, jt));
      a.velocity.x -= clampedJt * tx * a.inverseMass;
      a.velocity.y -= clampedJt * ty * a.inverseMass;
      b.velocity.x += clampedJt * tx * b.inverseMass;
      b.velocity.y += clampedJt * ty * b.inverseMass;
    }
  }

  // positional correction so overlapping bodies don't sink into each other
  const slop = 0.01;
  const percent = 0.6;
  const corr = (Math.max(penetration - slop, 0) / invMassSum) * percent;
  a.position.x -= corr * normal.x * a.inverseMass;
  a.position.y -= corr * normal.y * a.inverseMass;
  b.position.x += corr * normal.x * b.inverseMass;
  b.position.y += corr * normal.y * b.inverseMass;
}

/**
 * Resolve a particle against the world bounds according to the boundary mode.
 * Returns false if the particle should be removed (mode "kill").
 */
export function resolveBounds(
  p: Particle,
  bounds: Bounds,
  mode: PhysicsConfig["boundaryMode"],
): boolean {
  const r = p.radius;
  const minX = bounds.minX + r;
  const maxX = bounds.maxX - r;
  const minY = bounds.minY + r;
  const maxY = bounds.maxY - r;

  if (mode === "kill") {
    return !(
      p.position.x < bounds.minX - 1 ||
      p.position.x > bounds.maxX + 1 ||
      p.position.y < bounds.minY - 1 ||
      p.position.y > bounds.maxY + 1
    );
  }

  if (mode === "wrap") {
    const w = bounds.maxX - bounds.minX;
    const h = bounds.maxY - bounds.minY;
    if (p.position.x < bounds.minX) p.position.x += w;
    else if (p.position.x > bounds.maxX) p.position.x -= w;
    if (p.position.y < bounds.minY) p.position.y += h;
    else if (p.position.y > bounds.maxY) p.position.y -= h;
    return true;
  }

  // "bounce" and "clamp"
  const bounce = mode === "bounce";
  if (p.position.x < minX) {
    p.position.x = minX;
    if (bounce && p.velocity.x < 0) p.velocity.x = -p.velocity.x * p.restitution;
    else if (!bounce) p.velocity.x = 0;
  } else if (p.position.x > maxX) {
    p.position.x = maxX;
    if (bounce && p.velocity.x > 0) p.velocity.x = -p.velocity.x * p.restitution;
    else if (!bounce) p.velocity.x = 0;
  }
  if (p.position.y < minY) {
    p.position.y = minY;
    if (bounce && p.velocity.y < 0) p.velocity.y = -p.velocity.y * p.restitution;
    else if (!bounce) p.velocity.y = 0;
  } else if (p.position.y > maxY) {
    p.position.y = maxY;
    if (bounce && p.velocity.y > 0) p.velocity.y = -p.velocity.y * p.restitution;
    else if (!bounce) p.velocity.y = 0;
  }
  return true;
}
