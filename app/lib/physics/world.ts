import {
  Particle,
  ForceField,
  Constraint,
  PhysicsConfig,
  BodyType,
  RGB,
  Bounds,
  DEFAULT_PHYSICS_CONFIG,
} from "./types";
import { Vec2 } from "./math";
import { Rng } from "./rng";
import { integrateSymplectic, integrateVerlet } from "./integrator";
import { SpatialHashGrid } from "./spatialHash";
import { circleVsCircle, resolveContact, resolveBounds } from "./collision";
import { pixelize as pixelizeGrid, rasterize, rasterizeInterpolated } from "./rasterizer";

/**
 * PhysicsWorld — a self-contained, deterministic 2D particle simulation.
 *
 * Designed to be headless: no DOM, no React, no canvas. The app drives it
 * per-layer (one world per layer); the same class is the foundation of the
 * standalone `@tenix/physics` package, the embeddable widget, the scripting
 * sandbox, and the server-side renderer.
 *
 * Determinism contract: with identical config (incl. seed) and identical inputs
 * applied at identical step indices, every run yields byte-identical state. Run
 * it via update(frameDelta) for real-time, or step(fixedDt) in a loop for
 * frame-exact export.
 */
export class PhysicsWorld {
  particles: Particle[] = [];
  forces: ForceField[] = [];
  constraints: Constraint[] = [];
  config: PhysicsConfig;
  readonly rng: Rng;

  /** Total fixed steps executed — a stable clock for recording/replay. */
  stepCount = 0;

  private broadphase: SpatialHashGrid;
  private accumulator = 0;
  private nextId = 1;

  constructor(config: Partial<PhysicsConfig> = {}) {
    this.config = { ...DEFAULT_PHYSICS_CONFIG, ...config, gravity: (config.gravity ?? DEFAULT_PHYSICS_CONFIG.gravity).clone() };
    this.rng = new Rng(this.config.seed);
    this.broadphase = new SpatialHashGrid(2);
  }

  // ── Body creation ───────────────────────────────────────

  /** Build a particle with world defaults; does not add it to the world. */
  makeParticle(x: number, y: number, color: RGB): Particle {
    return {
      id: this.nextId++,
      type: BodyType.Dynamic,
      position: new Vec2(x, y),
      prevPosition: new Vec2(x, y),
      velocity: new Vec2(0, 0),
      force: new Vec2(0, 0),
      mass: 1,
      inverseMass: 1,
      radius: this.config.defaultRadius,
      restitution: this.config.defaultRestitution,
      friction: this.config.defaultFriction,
      damping: this.config.defaultDamping,
      color: [color[0], color[1], color[2]],
      sleeping: false,
      sleepTimer: 0,
    };
  }

  addParticle(p: Particle): Particle {
    this.particles.push(p);
    return p;
  }

  addForce(field: ForceField, wakeAll = true): void {
    this.forces.push(field);
    if (wakeAll) this.wakeAll();
  }

  addConstraint(c: Constraint): void {
    this.constraints.push(c);
  }

  setBounds(bounds: Bounds | null): void {
    this.config.bounds = bounds;
  }

  /** Convenience: set bounds to a grid of cols × rows cells. */
  setGridBounds(cols: number, rows: number): void {
    this.config.bounds = { minX: 0, minY: 0, maxX: cols, maxY: rows };
  }

  wakeAll(): void {
    for (const p of this.particles) {
      p.sleeping = false;
      p.sleepTimer = 0;
    }
  }

  clear(): void {
    this.particles.length = 0;
    this.forces.length = 0;
    this.constraints.length = 0;
    this.accumulator = 0;
    this.stepCount = 0;
  }

  // ── Pixel bridge ────────────────────────────────────────

  /**
   * Seed the world from a grid buffer: every lit cell becomes a particle. Also
   * sets grid bounds. Existing particles/constraints are replaced; forces kept.
   */
  pixelize(data: Uint8ClampedArray, cols: number, rows: number): number {
    this.particles = pixelizeGrid(
      data,
      cols,
      rows,
      (x, y, color) => this.makeParticle(x, y, color),
      this.config.maxParticles,
    );
    this.constraints.length = 0;
    this.nextId = this.particles.length + 1;
    this.setGridBounds(cols, rows);
    return this.particles.length;
  }

  /** Write current particle positions to a grid buffer. */
  rasterizeTo(data: Uint8ClampedArray, cols: number, rows: number, background?: RGB): void {
    rasterize(this.particles, data, cols, rows, background);
  }

  /** Write interpolated positions (alpha from update()) for smooth rendering. */
  rasterizeInterpolatedTo(
    data: Uint8ClampedArray,
    cols: number,
    rows: number,
    alpha: number,
    background?: RGB,
  ): void {
    rasterizeInterpolated(this.particles, data, cols, rows, alpha, background);
  }

  // ── Simulation ──────────────────────────────────────────

  /**
   * Advance the simulation in real-time. Accumulates wall-clock delta and runs
   * as many fixed steps as fit, returning the interpolation alpha ∈ [0,1) for
   * smooth rendering between steps.
   */
  update(frameDelta: number): number {
    const dt = this.config.fixedDt;
    this.accumulator += Math.min(frameDelta, this.config.maxFrameTime);
    while (this.accumulator >= dt) {
      this.step(dt);
      this.accumulator -= dt;
    }
    return this.accumulator / dt;
  }

  /** One deterministic fixed step. */
  step(dt: number): void {
    this.applyForces(dt);
    this.integrate(dt);
    this.solveConstraints();
    this.solveCollisions();
    this.solveBounds();
    this.stepCount++;
  }

  private applyForces(dt: number): void {
    // per-step state for time-varying / one-shot fields
    for (const f of this.forces) f.update?.(dt);
    // drop spent one-shot fields (explosions)
    if (this.forces.some((f) => f.dead)) {
      this.forces = this.forces.filter((f) => !f.dead);
    }

    const g = this.config.gravity;
    for (const p of this.particles) {
      if (p.type !== BodyType.Dynamic || p.sleeping) continue;
      p.force.x += g.x * p.mass;
      p.force.y += g.y * p.mass;
      for (const f of this.forces) {
        if (f.enabled) f.apply(p, dt);
      }
    }
  }

  private integrate(dt: number): void {
    if (this.config.integrator === "verlet") {
      integrateVerlet(this.particles, dt);
    } else {
      integrateSymplectic(this.particles, dt, this.config);
    }
  }

  private solveConstraints(): void {
    const iters = this.config.constraintIterations;
    for (let it = 0; it < iters; it++) {
      for (const c of this.constraints) c.solve(this.config.fixedDt);
    }
  }

  private solveCollisions(): void {
    if (this.particles.length < 2) return;
    this.broadphase.rebuild(this.particles);
    const pairs = this.broadphase.pairs();
    const iters = this.config.velocityIterations;
    for (let it = 0; it < iters; it++) {
      for (const [a, b] of pairs) {
        const contact = circleVsCircle(a, b);
        if (contact) resolveContact(contact);
      }
    }
  }

  private solveBounds(): void {
    const b = this.config.bounds;
    if (!b) return;
    const mode = this.config.boundaryMode;
    if (mode === "kill") {
      this.particles = this.particles.filter((p) => resolveBounds(p, b, mode));
    } else {
      for (const p of this.particles) resolveBounds(p, b, mode);
    }
  }
}
