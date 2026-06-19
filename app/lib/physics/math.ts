/**
 * Vec2 — 2D vector with immutable (allocating) and mutating (in-place) variants.
 *
 * Use the immutable methods (add, sub, scale …) for API clarity outside hot
 * loops. Inside the simulation step, prefer the `*Mut` variants to avoid
 * allocating thousands of objects per frame.
 *
 * This file has zero dependencies so the physics module lifts cleanly into a
 * standalone `@tenix/physics` package.
 */
export class Vec2 {
  constructor(public x: number = 0, public y: number = 0) {}

  // ── Immutable (allocating) ──────────────────────────────
  add(v: Vec2): Vec2 { return new Vec2(this.x + v.x, this.y + v.y); }
  sub(v: Vec2): Vec2 { return new Vec2(this.x - v.x, this.y - v.y); }
  scale(s: number): Vec2 { return new Vec2(this.x * s, this.y * s); }
  dot(v: Vec2): number { return this.x * v.x + this.y * v.y; }
  /** 2D cross product returns a scalar (z component of the 3D cross). */
  cross(v: Vec2): number { return this.x * v.y - this.y * v.x; }
  len(): number { return Math.sqrt(this.x * this.x + this.y * this.y); }
  lenSq(): number { return this.x * this.x + this.y * this.y; }
  normalize(): Vec2 {
    const l = this.len();
    return l > 0 ? new Vec2(this.x / l, this.y / l) : new Vec2();
  }
  perp(): Vec2 { return new Vec2(-this.y, this.x); }
  lerp(v: Vec2, t: number): Vec2 {
    return new Vec2(this.x + (v.x - this.x) * t, this.y + (v.y - this.y) * t);
  }
  distTo(v: Vec2): number {
    const dx = v.x - this.x, dy = v.y - this.y;
    return Math.sqrt(dx * dx + dy * dy);
  }
  distSqTo(v: Vec2): number {
    const dx = v.x - this.x, dy = v.y - this.y;
    return dx * dx + dy * dy;
  }
  rotate(angle: number): Vec2 {
    const c = Math.cos(angle), s = Math.sin(angle);
    return new Vec2(this.x * c - this.y * s, this.x * s + this.y * c);
  }
  clone(): Vec2 { return new Vec2(this.x, this.y); }

  // ── Mutating (in-place) — for hot loops ─────────────────
  addMut(v: Vec2): this { this.x += v.x; this.y += v.y; return this; }
  subMut(v: Vec2): this { this.x -= v.x; this.y -= v.y; return this; }
  scaleMut(s: number): this { this.x *= s; this.y *= s; return this; }
  addScaledMut(v: Vec2, s: number): this { this.x += v.x * s; this.y += v.y * s; return this; }
  set(x: number, y: number): this { this.x = x; this.y = y; return this; }
  copyFrom(v: Vec2): this { this.x = v.x; this.y = v.y; return this; }
  zero(): this { this.x = 0; this.y = 0; return this; }
}

/** Clamp a value to [min, max]. */
export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}
