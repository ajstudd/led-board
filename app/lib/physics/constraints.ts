import { Constraint, Particle, BodyType } from "./types";
import { Vec2 } from "./math";

/**
 * Positional (Position-Based Dynamics) constraints. They are projected after
 * integration; with the Verlet integrator the position change implicitly updates
 * velocity, which makes rope/cloth stable and energy-correct.
 *
 * Solve them over several iterations (config.constraintIterations) for stiffness.
 */

/** Keeps two particles at a target separation. stiffness ∈ [0,1]. */
export class DistanceConstraint implements Constraint {
  readonly type = "distance";
  constructor(
    public a: Particle,
    public b: Particle,
    public restLength: number,
    public stiffness = 1,
  ) {}

  solve(): void {
    const a = this.a;
    const b = this.b;
    const dx = b.position.x - a.position.x;
    const dy = b.position.y - a.position.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1e-9;
    const diff = (dist - this.restLength) / dist;

    const invSum = a.inverseMass + b.inverseMass;
    if (invSum === 0) return;

    const k = this.stiffness;
    const aw = a.inverseMass / invSum;
    const bw = b.inverseMass / invSum;

    a.position.x += dx * diff * aw * k;
    a.position.y += dy * diff * aw * k;
    b.position.x -= dx * diff * bw * k;
    b.position.y -= dy * diff * bw * k;
  }
}

/** Locks a particle to a fixed world point (a pin / nail). */
export class PinConstraint implements Constraint {
  readonly type = "pin";
  point: Vec2;
  constructor(public particle: Particle, point?: Vec2) {
    this.point = point ? point.clone() : particle.position.clone();
    // a pinned particle is effectively immovable
    particle.type = BodyType.Static;
    particle.inverseMass = 0;
  }
  solve(): void {
    this.particle.position.x = this.point.x;
    this.particle.position.y = this.point.y;
    this.particle.prevPosition.x = this.point.x;
    this.particle.prevPosition.y = this.point.y;
  }
}
