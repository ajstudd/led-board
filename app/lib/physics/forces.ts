import { ForceField, Particle } from "./types";
import { Vec2 } from "./math";

/**
 * Force fields are the primary way creators interact with physics: pick a field,
 * tune it, and it acts on the active layer's particles. All fields are
 * deterministic — any time-varying behaviour (wind turbulence) uses a closed-form
 * function of position + accumulated time, never Math.random().
 *
 * Forces are accelerations scaled by mass (force = a * m), so the integrator's
 * `force * inverseMass` yields a mass-independent acceleration by default.
 */

/** Uniform directional gravity (an alternative/addition to world gravity). */
export class DirectionalGravity implements ForceField {
  readonly type = "gravity";
  enabled = true;
  constructor(public accel: Vec2 = new Vec2(0, 30)) {}
  apply(p: Particle): void {
    p.force.x += this.accel.x * p.mass;
    p.force.y += this.accel.y * p.mass;
  }
}

/** Directional wind with deterministic turbulence. */
export class Wind implements ForceField {
  readonly type = "wind";
  enabled = true;
  private time = 0;
  constructor(
    public direction: Vec2 = new Vec2(20, 0),
    public turbulence = 8,
    public frequency = 0.15,
  ) {}
  update(dt: number): void {
    this.time += dt;
  }
  apply(p: Particle): void {
    p.force.x += this.direction.x * p.mass;
    p.force.y += this.direction.y * p.mass;
    if (this.turbulence > 0) {
      const t = this.time;
      const nx = Math.sin(p.position.y * this.frequency + t * 1.7);
      const ny = Math.cos(p.position.x * this.frequency + t * 1.3);
      p.force.x += nx * this.turbulence * p.mass;
      p.force.y += ny * this.turbulence * p.mass;
    }
  }
}

/** Rotational field around a point (whirlpool / tornado). */
export class Vortex implements ForceField {
  readonly type = "vortex";
  enabled = true;
  constructor(
    public center: Vec2,
    public strength = 40,
    public inward = 6,
    public radius = 40,
  ) {}
  apply(p: Particle): void {
    const dx = p.position.x - this.center.x;
    const dy = p.position.y - this.center.y;
    const distSq = dx * dx + dy * dy;
    if (distSq > this.radius * this.radius || distSq < 1e-6) return;
    const dist = Math.sqrt(distSq);
    const falloff = 1 - dist / this.radius;
    // tangential (perpendicular to radius) + slight inward pull
    p.force.x += (-dy / dist) * this.strength * falloff * p.mass;
    p.force.y += (dx / dist) * this.strength * falloff * p.mass;
    p.force.x += (-dx / dist) * this.inward * falloff * p.mass;
    p.force.y += (-dy / dist) * this.inward * falloff * p.mass;
  }
}

/** Radial attraction (strength > 0) or repulsion (strength < 0) toward a point. */
export class Attractor implements ForceField {
  readonly type = "attractor";
  enabled = true;
  constructor(
    public center: Vec2,
    public strength = 60,
    public radius = 60,
    /** Falloff exponent: 0 = constant, 1 = linear, 2 = inverse-square-ish. */
    public falloffPower = 1,
  ) {}
  apply(p: Particle): void {
    const dx = this.center.x - p.position.x;
    const dy = this.center.y - p.position.y;
    const distSq = dx * dx + dy * dy;
    if (distSq > this.radius * this.radius || distSq < 1e-6) return;
    const dist = Math.sqrt(distSq);
    const falloff = Math.pow(1 - dist / this.radius, this.falloffPower);
    p.force.x += (dx / dist) * this.strength * falloff * p.mass;
    p.force.y += (dy / dist) * this.strength * falloff * p.mass;
  }
}

/** One-shot radial explosion impulse with falloff, decaying over `duration`. */
export class Explosion implements ForceField {
  readonly type = "explosion";
  enabled = true;
  private elapsed = 0;
  constructor(
    public center: Vec2,
    public strength = 600,
    public radius = 50,
    public duration = 0.12,
  ) {}
  get dead(): boolean {
    return this.elapsed >= this.duration;
  }
  update(dt: number): void {
    this.elapsed += dt;
  }
  apply(p: Particle): void {
    if (this.dead) return;
    const dx = p.position.x - this.center.x;
    const dy = p.position.y - this.center.y;
    const distSq = dx * dx + dy * dy;
    if (distSq > this.radius * this.radius) return;
    const dist = Math.sqrt(distSq) || 1e-6;
    const spatial = 1 - dist / this.radius;
    const temporal = 1 - this.elapsed / this.duration;
    const mag = this.strength * spatial * temporal;
    p.force.x += (dx / dist) * mag * p.mass;
    p.force.y += (dy / dist) * mag * p.mass;
  }
}

/** Velocity-proportional damping (viscous drag). */
export class Drag implements ForceField {
  readonly type = "drag";
  enabled = true;
  constructor(public coefficient = 2) {}
  apply(p: Particle): void {
    p.force.x -= p.velocity.x * this.coefficient * p.mass;
    p.force.y -= p.velocity.y * this.coefficient * p.mass;
  }
}
