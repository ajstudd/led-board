# Tenix — Master Implementation Plan

> **Last Updated:** April 24, 2026 (v3 — Product Spine & Roadmap Reordered)
> **Branch:** `animation-engine`
> **Product Vision:** "Pixel Animation Engine" — the fastest way to create pixel/LED-style animated assets and export them for real use. Lottie, physics, 3D, APIs, and community features are expansion layers after the core exportable-animation loop is proven.
> **This document is the SINGLE SOURCE OF TRUTH for all implementation work.**

---

## Table of Contents

1. [Product Vision & Positioning](#1-product-vision--positioning)
2. [Architecture Overview](#2-architecture-overview)
3. [Physics Engine Architecture](#physics-engine-architecture)
4. [Current Codebase State](#3-current-codebase-state)
5. [Work Already Completed](#4-work-already-completed-on-animation-engine-branch)
6. [Implementation Phases](#5-implementation-phases)
7. [Phase 0: Stabilization, Cleanup, and Export Trust](#phase-0-stabilization-cleanup-and-export-trust)
8. [Phase 1: Independent Per-Layer Animation & Effects](#phase-1-independent-per-layer-animation--effects)
9. [Phase 2: Exportable Animation MVP](#phase-2-exportable-animation-mvp)
10. [Phase 3: Action-Based Recording & Deterministic Replay](#phase-3-action-based-recording--deterministic-replay)
11. [Phase 4: Keyframe Interpolation Engine](#phase-4-keyframe-interpolation-engine)
12. [Phase 5: Property Timeline with Curves](#phase-5-property-timeline-with-curves)
13. [Phase 6: Template Fill System](#phase-6-template-fill-system)
14. [Phase 7: Lottie JSON Export](#phase-7-lottie-json-export)
15. [Phase 8: Physics-Enhanced Motion](#phase-8-physics-enhanced-motion)
16. [Phase 9: Platform, Developer, and Experimental Features](#phase-9-platform-developer-and-experimental-features)
17. [Technology Decisions](#6-technology-decisions)
18. [File Index](#7-file-index)
19. [Monetization Strategy](#8-monetization-strategy)
20. [Rules & Constraints for AI Agents](#9-rules--constraints-for-ai-agents)

---

## 1. Product Vision & Positioning

### Identity: "Pixel Animation Engine"

Tenix is positioned around one sharp wedge:

> **Open Tenix, make a beautiful pixel/LED animation in minutes, and export it as a file people can actually use.**

The product should not try to become a generic After Effects/Rive/LottieFiles replacement in the near term. Lottie is an important export target, not the entire identity. Tenix wins by owning the **pixel motion** niche: LED boards, pixel typography, procedural effects, animated badges, stream/social assets, dashboards, playful brand moments, and lightweight app UI animations.

### Product Spine

Every roadmap decision should serve this order:

1. **Create** — drawing, text, patterns, palettes, effects, layers.
2. **Animate** — per-layer animation, keyframes, timeline, templates.
3. **Export** — PNG/SVG/GIF/WebM/MP4 first; Lottie once the internal animation model is declarative enough.
4. **Expand** — physics, 3D, APIs, plugins, community, hardware bridge.

If a feature does not improve create/animate/export, it belongs in the expansion stage.

### Strategic Guardrails

| Guardrail | Meaning |
|---|---|
| **Export before ecosystem** | Sharing and production use must work before cloud/community/API work. |
| **Keyframes before Lottie** | Lottie export should translate declarative motion, not raw frame dumps. |
| **Templates before complexity** | The product promise is "define start/end, Tenix fills the motion." |
| **Physics after the core loop** | Physics is a powerful differentiator, but it should enhance templates after export/timeline/keyframes are stable. |
| **3D/API/plugins after product-market proof** | These are valuable second-act features, not MVP requirements. |

### Product Map

```
┌────────────────────────────────────────────────────────────────┐
│                    TENIX — Pixel Animation Engine               │
│                                                                 │
│  "Pixel motion you can create fast and export anywhere"         │
│                                                                 │
├─────────────────────┬──────────────────┬───────────────────────┤
│   Create Mode       │  Animate Mode    │  Expansion Mode       │
│   (core loop)       │  (retention/pay) │  (after proof)        │
│                     │                  │                        │
│  • Freehand draw    │  • Keyframes     │  • @tenix/core NPM    │
│  • 13 patterns      │  • Easing curves │  • Scripting sandbox   │
│  • 13 GPU effects   │  • Property anim │  • REST/WS API         │
│  • 16 animations    │  • Timeline      │  • Embeddable widget   │
│  • Gesture control  │  • Onion skin    │  • CLI renderer        │
│  • Vibe mode        │  • Templates     │                        │
│  • Layers/palettes  │  • "Fill between"│  • 3D/WebXR view       │
│                     │  • Lottie export │  • Physics bake        │
├─────────────────────┴──────────────────┴───────────────────────┤
│                     Export Pipeline                              │
│  GIF / WebM / MP4 / PNG / SVG / Lottie JSON / Sprite Sheet     │
├────────────────────────────────────────────────────────────────┤
│                     Core Engine                                  │
│  LayerManager (per-layer anims)  •  Grid/Pixel Engine           │
│  Keyframe Engine                 •  Template Fill System        │
│  Effects/GLSL Pipeline           •  Config-based Recording      │
│  Palette System                  •  Delta Codec                 │
│  PhysicsWorld (later expansion)  •  Developer API (later)       │
└────────────────────────────────────────────────────────────────┘
```

### Target Audiences

| Audience | What They Need | What Tenix Offers |
|---|---|---|
| **Content Creators** | Shareable animated visuals for social media, streams, thumbnails, and brand moments | Fast creation flow, GIF/WebM/MP4 export, templates, text animations, brand colors |
| **Designers / Animators** | Pixel-style motion assets without building everything frame by frame | Layers, keyframes, timeline, easing curves, template fill |
| **Developers** | Embeddable/programmatic pixel displays after the core engine stabilizes | NPM package, widget, scripting sandbox, REST/WebSocket API |

### Competitive Advantage

No other animation maker owns pixel-grid aesthetics with built-in procedural effects, easy templates, and production exports. Rive and LottieFiles target vector motion graphics. Piskel and Aseprite focus on pixel art creation. Raw physics libraries provide simulation but not creative tooling. Tenix should own the intersection of **pixel art + procedural motion + fast export**, then add physics-driven motion as a later differentiator.

---

## 2. Architecture Overview

### Core Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                         UI Layer                             │
│  LEDBoard.tsx (orchestrator)                                 │
│  ├── ControlPanel.tsx (accordion sidebar)                    │
│  │   ├── ColorPicker, PaletteSelector                       │
│  │   ├── AnimationPanel, EffectsPanel                       │
│  │   ├── PhysicsPanel (Phase 8)                            │
│  │   ├── LayerPanel                                          │
│  │   ├── RecordingPanel, ExportPanel                         │
│  │   └── PatternSelector                                     │
│  ├── Canvas.tsx (rendering surface)                          │
│  └── TimelinePanel.tsx (bottom bar)                          │
├─────────────────────────────────────────────────────────────┤
│                      Hooks Layer                             │
│  useLayerManager    useAnimationEngine    useEffectsEngine   │
│  useSessionRecording  useGestures   useTimelineEngine        │
│  usePhysicsEngine (Phase 8)                                  │
├─────────────────────────────────────────────────────────────┤
│                      Engine Layer                            │
│  GridManager (Uint8ClampedArray flat RGB buffer)             │
│  LayerManager (per-layer animation + effects; physics later) │
│  AnimationManager (rAF loop, tick functions)                 │
│  EffectsEngine (trigger-based VFX with GPU acceleration)     │
│  PhysicsWorld (Phase 8 particles/forces/collisions)          │
│  SessionRecorder (frame-based + action-based recording)      │
│  TimelineManager (clip-based sequencing)                     │
├─────────────────────────────────────────────────────────────┤
│                    Support Layer                             │
│  patterns.ts (13 procedural generators)                      │
│  animations.ts (16 content-aware animations)                 │
│  effects.ts (13 effect presets)                              │
│  effects-gl.ts (WebGL GPU renderer with CPU fallback)        │
│  physics/ (Phase 8: math, bodies, collisions, forces)        │
│  font.ts (custom 5×7 bitmap font with marquee)               │
│  deltaCodec.ts (delta compression for recordings)            │
│  gifEncoder.ts (custom LZW GIF encoder)                      │
│  videoEncoder.ts (WebCodecs → MediaRecorder → GIF fallback)  │
│  exporter.ts (export orchestrator)                           │
│  palette.ts (brand color system)                             │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow

```
User Input (mouse/touch/gesture)
    ↓
LEDBoard.tsx (routes to active layer)
    ↓
LayerManager → active Layer's GridManager.setCell()
    ↓
Each Layer ticks independently:
  Layer.animation.manager.tick() → mutates Layer.grid.data
  Layer.effects.engine.tick()    → produces Layer.effects.overlay
  Layer.physics.world.step()     → Phase 8 only: moves particles, writes back to grid
    ↓
LayerManager.composite() → merges all visible layers (bottom-to-top)
LayerManager.compositeEffectsOverlay() → merges all effects overlays
    ↓
Canvas.tsx renders composite + effects overlay
    ↓
SessionRecorder captures composite for frame-based recording
```

### Per-Layer Independence (KEY ARCHITECTURAL DECISION)

Each `Layer` in the `LayerManager` is a fully independent unit:

```typescript
interface Layer {
    id: string;
    name: string;
    visible: boolean;
    opacity: number;          // 0 to 1
    blendMode: "normal" | "add" | "multiply";
    grid: GridManager;         // pixel data buffer
    animation: {               // OWN animation instance
        manager: AnimationManager;
        currentAnim: AnimationConfig | null;
        snapshot: Uint8ClampedArray | null;
        fps: number;
        frame: number;
    };
    effects: {                 // OWN effects instance
        engine: EffectsEngine;
        enabled: boolean;
        preset: EffectPreset;
        distanceMultiplier: number;
        speedMultiplier: number;
        overlay: EffectsOverlay;
    };
    physics: {                 // Phase 8: OWN physics instance
        world: PhysicsWorld | null;   // null = physics disabled on this layer
        enabled: boolean;
        particles: Particle[];        // active pixel-particles
        forces: ForceField[];         // active force fields
        constraints: Constraint[];    // active constraints (springs, pins, etc.)
        config: PhysicsConfig;        // gravity, timestep, iterations, etc.
    };
}
```

**Why:** Without per-layer independence, you cannot build a proper animation engine. Layer 0 can run "rainbow scroll" while Layer 1 runs "sparkle" simultaneously — they animate independently and composite together. Physics follows the same per-layer model: Layer 0 can have gravity dropping pixels while Layer 1 has a wind field blowing particles sideways.

---

## Physics Engine Architecture

> **Roadmap placement:** This architecture is intentionally preserved, but it is **not** the next implementation priority. Physics now belongs to Phase 8, after export, deterministic replay, keyframes, property timeline, templates, and Lottie export are stable. Treat this section as the design reference for that future phase, not as permission to start physics before the core exportable-animation loop is proven.

> [!IMPORTANT]
> **The physics engine is a FIRST-CLASS subsystem in Tenix.** It is not a bolt-on library — it is designed to integrate deeply with the pixel grid, per-layer model, keyframe engine, and template system. It is also designed to be **standalone** so it can be published as part of `@tenix/core`.

### The Core Problem: Pixels vs. Continuous Physics

Tenix operates on a **discrete grid** (`cols × rows` cells). Physics operates on **continuous coordinates** (float x, float y). The bridge between them is the key architectural insight:

```
Pixel Grid (discrete)              Physics World (continuous)
┌──┬──┬──┬──┬──┐                   ┌───────────────────────┐
│  │  │██│  │  │                   │       •(2.3, 0.7)    │
├──┼──┼──┼──┼──┤    Rasterize ←    │   •(1.1, 1.4)        │
│  │██│  │  │  │                   │           •(3.8, 2.1)│
├──┼──┼──┼──┼──┤    Pixelize →     │     •(0.5, 3.2)      │
│  │  │  │██│  │                   │                       │
└──┴──┴──┴──┴──┘                   └───────────────────────┘

"Pixelize": Take lit grid cells → create particles at cell centers
"Rasterize": Take particle positions → round to nearest cell → write color
```

**Each lit pixel becomes a `Particle`** with:
- Continuous position `(x, y)` — initialized to `(col + 0.5, row + 0.5)`
- Velocity `(vx, vy)` — initialized to `(0, 0)`
- Color `[r, g, b]` — copied from the pixel
- Mass — default `1.0`, configurable per pixel or region

**On every physics step:**
1. Apply forces (gravity, wind, etc.) to all particles
2. Integrate (Symplectic Euler or Verlet)
3. Detect collisions (spatial hash → narrow phase)
4. Resolve collisions (impulse-based)
5. Solve constraints (springs, pins, distance)
6. **Rasterize** particles back to the grid — clear grid, then for each particle, write its color to `grid[round(y)][round(x)]`

### Full Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    PhysicsWorld (per-layer)                   │
│                                                               │
│  step(dt)  ┬─→ applyForces()                                 │
│            ├─→ integrate(dt)           Symplectic Euler       │
│            ├─→ broadPhase.query()      Spatial Hash Grid      │
│            ├─→ narrowPhase(pairs)      AABB + Circle tests    │
│            ├─→ solver.solve(contacts)  Sequential Impulse     │
│            ├─→ constraintSolver.solve() Springs, Pins, Dist   │
│            └─→ rasterize(grid)         Particles → Grid cells │
│                                                               │
│  Bodies:                                                      │
│  ├── Particle (position, velocity, mass, color, radius)       │
│  ├── StaticBody (walls, floor — infinite mass)                │
│  └── KinematicBody (moved by animation, not forces)           │
│                                                               │
│  Forces:                                                      │
│  ├── Gravity (directional or point-source)                    │
│  ├── Wind (directional + turbulence noise)                    │
│  ├── Vortex (rotational field around a point)                 │
│  ├── Explosion (radial impulse with falloff)                  │
│  ├── Attraction/Repulsion (magnetic-like)                     │
│  └── Drag (velocity-proportional damping)                     │
│                                                               │
│  Constraints:                                                 │
│  ├── Distance (fixed-length rod between two particles)        │
│  ├── Spring (elastic connection with stiffness + damping)     │
│  ├── Pin (locks particle to a grid position)                  │
│  └── Boundary (keeps particles within grid bounds)            │
│                                                               │
│  Collision Shapes:                                            │
│  ├── Circle (default for particles, radius = 0.5 cells)       │
│  ├── AABB (axis-aligned boxes for static walls)               │
│  └── Line Segment (for sloped surfaces)                       │
└─────────────────────────────────────────────────────────────┘
```

### Mathematical Primitives

The physics engine needs a small, focused math library. Since Tenix is **2D**, we use `Vec2` for everything, but design the API so a `Vec3` extension is trivial:

```typescript
// app/lib/physics/math.ts

export class Vec2 {
  constructor(public x: number = 0, public y: number = 0) {}

  add(v: Vec2): Vec2 { return new Vec2(this.x + v.x, this.y + v.y); }
  sub(v: Vec2): Vec2 { return new Vec2(this.x - v.x, this.y - v.y); }
  scale(s: number): Vec2 { return new Vec2(this.x * s, this.y * s); }
  dot(v: Vec2): number { return this.x * v.x + this.y * v.y; }
  cross(v: Vec2): number { return this.x * v.y - this.y * v.x; } // 2D cross = scalar
  len(): number { return Math.sqrt(this.x * this.x + this.y * this.y); }
  lenSq(): number { return this.x * this.x + this.y * this.y; }
  normalize(): Vec2 {
    const l = this.len();
    return l > 0 ? this.scale(1 / l) : new Vec2();
  }
  lerp(v: Vec2, t: number): Vec2 {
    return new Vec2(this.x + (v.x - this.x) * t, this.y + (v.y - this.y) * t);
  }
  distTo(v: Vec2): number { return this.sub(v).len(); }
  rotate(angle: number): Vec2 {
    const c = Math.cos(angle), s = Math.sin(angle);
    return new Vec2(this.x * c - this.y * s, this.x * s + this.y * c);
  }
  clone(): Vec2 { return new Vec2(this.x, this.y); }

  // ── Mutating variants (avoid allocation in hot loops) ──
  addMut(v: Vec2): this { this.x += v.x; this.y += v.y; return this; }
  subMut(v: Vec2): this { this.x -= v.x; this.y -= v.y; return this; }
  scaleMut(s: number): this { this.x *= s; this.y *= s; return this; }
  set(x: number, y: number): this { this.x = x; this.y = y; return this; }
  copyFrom(v: Vec2): this { this.x = v.x; this.y = v.y; return this; }
}
```

> [!TIP]
> **Performance:** In the hot simulation loop, use the mutating `*Mut()` methods to avoid allocating thousands of `Vec2` objects per frame. The immutable methods are for API clarity outside the hot path. For even higher performance (1000+ particles), consider a Structure-of-Arrays layout with `Float32Array`s for positions/velocities.

### Integration Method: Symplectic Euler (Default)

```typescript
// Sympletic Euler — energy-conserving, simple, used by Box2D
function integrate(particles: Particle[], dt: number): void {
  for (const p of particles) {
    if (p.type !== BodyType.Dynamic) continue;
    // velocity += acceleration * dt  (acceleration = force / mass)
    p.velocity.x += (p.force.x * p.inverseMass) * dt;
    p.velocity.y += (p.force.y * p.inverseMass) * dt;
    // Apply damping (air resistance)
    p.velocity.x *= p.damping;
    p.velocity.y *= p.damping;
    // position += velocity * dt  (using NEW velocity — key difference from Euler)
    p.position.x += p.velocity.x * dt;
    p.position.y += p.velocity.y * dt;
    // Reset force accumulator
    p.force.x = 0;
    p.force.y = 0;
  }
}
```

### Alternative: Verlet Integration (for Cloth/Rope)

For particle chains, cloth grids, and rope simulations, Verlet is preferred because position constraints are trivially satisfied without velocity tracking:

```typescript
// Verlet — no explicit velocity, great for constrained systems
function integrateVerlet(particles: Particle[], dt: number): void {
  const dtSq = dt * dt;
  for (const p of particles) {
    if (p.type !== BodyType.Dynamic) continue;
    const ax = p.force.x * p.inverseMass;
    const ay = p.force.y * p.inverseMass;
    const newX = 2 * p.position.x - p.prevPosition.x + ax * dtSq;
    const newY = 2 * p.position.y - p.prevPosition.y + ay * dtSq;
    p.prevPosition.x = p.position.x;
    p.prevPosition.y = p.position.y;
    p.position.x = newX;
    p.position.y = newY;
    p.force.x = 0;
    p.force.y = 0;
  }
}
```

### Fixed Timestep Loop

Physics **must** run at a fixed timestep for determinism and stability. This is critical for action-based recording replay:

```typescript
const FIXED_DT = 1 / 60; // 60Hz physics
let accumulator = 0;

function update(frameDelta: number): void {
  accumulator += frameDelta;
  // Cap to prevent spiral of death
  if (accumulator > 0.1) accumulator = 0.1;

  while (accumulator >= FIXED_DT) {
    world.step(FIXED_DT);
    accumulator -= FIXED_DT;
  }
  // Interpolation alpha for smooth rendering between physics steps
  const alpha = accumulator / FIXED_DT;
  rasterizeInterpolated(alpha);
}
```

### Collision Detection

#### Broad Phase: Spatial Hash Grid

Since Tenix particles are uniformly-sized (radius ≈ 0.5 cells), a spatial hash grid is optimal — it's O(1) per lookup and naturally maps to the pixel grid:

```typescript
// app/lib/physics/spatialHash.ts

export class SpatialHashGrid {
  private cellSize: number;
  private cells: Map<number, Particle[]> = new Map();

  constructor(cellSize: number = 2) { // 2x2 cell grid buckets
    this.cellSize = cellSize;
  }

  private hash(x: number, y: number): number {
    const cx = Math.floor(x / this.cellSize);
    const cy = Math.floor(y / this.cellSize);
    return cx * 73856093 ^ cy * 19349663; // Spatial hash function
  }

  rebuild(particles: Particle[]): void {
    this.cells.clear();
    for (const p of particles) {
      const key = this.hash(p.position.x, p.position.y);
      let cell = this.cells.get(key);
      if (!cell) { cell = []; this.cells.set(key, cell); }
      cell.push(p);
    }
  }

  query(p: Particle): Particle[] {
    // Check the 9 surrounding cells (3x3 neighborhood)
    const results: Particle[] = [];
    const cx = Math.floor(p.position.x / this.cellSize);
    const cy = Math.floor(p.position.y / this.cellSize);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const key = (cx + dx) * 73856093 ^ (cy + dy) * 19349663;
        const cell = this.cells.get(key);
        if (cell) results.push(...cell);
      }
    }
    return results;
  }
}
```

#### Narrow Phase: Circle-Circle + Circle-AABB

For pixel particles (circles) and walls (AABBs):

```typescript
interface Contact {
  a: Particle;
  b: Particle | StaticBody;
  normal: Vec2;         // collision normal (A → B)
  penetration: number;  // overlap depth
  point: Vec2;          // contact point
}

function circleVsCircle(a: Particle, b: Particle): Contact | null {
  const dx = b.position.x - a.position.x;
  const dy = b.position.y - a.position.y;
  const distSq = dx * dx + dy * dy;
  const minDist = a.radius + b.radius;
  if (distSq >= minDist * minDist) return null;
  const dist = Math.sqrt(distSq);
  const normal = dist > 0
    ? new Vec2(dx / dist, dy / dist)
    : new Vec2(1, 0); // arbitrary if overlapping perfectly
  return {
    a, b,
    normal,
    penetration: minDist - dist,
    point: new Vec2(
      a.position.x + normal.x * a.radius,
      a.position.y + normal.y * a.radius
    ),
  };
}
```

### Collision Response: Impulse-Based

```typescript
function resolveContact(contact: Contact, restitution: number, friction: number): void {
  const { a, b, normal, penetration } = contact;
  // Relative velocity
  const rvx = a.velocity.x - (b.velocity?.x ?? 0);
  const rvy = a.velocity.y - (b.velocity?.y ?? 0);
  const vAlongNormal = rvx * normal.x + rvy * normal.y;
  if (vAlongNormal > 0) return; // separating

  const e = restitution;
  const invMassSum = a.inverseMass + (b.inverseMass ?? 0);
  const j = -(1 + e) * vAlongNormal / invMassSum;

  // Apply impulse
  a.velocity.x += j * normal.x * a.inverseMass;
  a.velocity.y += j * normal.y * a.inverseMass;
  if (b.velocity) {
    b.velocity.x -= j * normal.x * b.inverseMass;
    b.velocity.y -= j * normal.y * b.inverseMass;
  }

  // Tangential friction impulse
  const tx = rvx - vAlongNormal * normal.x;
  const ty = rvy - vAlongNormal * normal.y;
  const tLen = Math.sqrt(tx * tx + ty * ty);
  if (tLen > 0.0001) {
    const jt = Math.max(-j * friction, Math.min(j * friction,
      -(tx * normal.y - ty * normal.x) / invMassSum));
    a.velocity.x += jt * (tx / tLen) * a.inverseMass;
    a.velocity.y += jt * (ty / tLen) * a.inverseMass;
  }

  // Position correction (Baumgarte stabilization — prevent sinking)
  const slop = 0.01;
  const percent = 0.4;
  const correction = Math.max(penetration - slop, 0) / invMassSum * percent;
  a.position.x -= correction * normal.x * a.inverseMass;
  a.position.y -= correction * normal.y * a.inverseMass;
  if (b.position && b.inverseMass > 0) {
    b.position.x += correction * normal.x * b.inverseMass;
    b.position.y += correction * normal.y * b.inverseMass;
  }
}
```

### Force Field System

Force fields are the primary way users interact with physics. They integrate with the existing EffectsPanel paradigm — select a force field type, configure its parameters, and it affects the active layer's particles:

```typescript
// app/lib/physics/forces.ts

export interface ForceField {
  type: string;
  /** Apply force to a particle based on its position */
  apply(particle: Particle, dt: number): void;
}

export class DirectionalGravity implements ForceField {
  type = "gravity";
  constructor(public direction: Vec2 = new Vec2(0, 9.81)) {}
  apply(p: Particle): void {
    p.force.x += this.direction.x * p.mass;
    p.force.y += this.direction.y * p.mass;
  }
}

export class PointGravity implements ForceField {
  type = "point-gravity";
  constructor(public center: Vec2, public strength: number = 500) {}
  apply(p: Particle): void {
    const dx = this.center.x - p.position.x;
    const dy = this.center.y - p.position.y;
    const distSq = dx * dx + dy * dy + 0.01; // avoid division by zero
    const force = this.strength * p.mass / distSq;
    const dist = Math.sqrt(distSq);
    p.force.x += (dx / dist) * force;
    p.force.y += (dy / dist) * force;
  }
}

export class WindField implements ForceField {
  type = "wind";
  constructor(
    public direction: Vec2 = new Vec2(5, 0),
    public turbulence: number = 0.3,
    private _time: number = 0
  ) {}
  apply(p: Particle, dt: number): void {
    this._time += dt;
    // Perlin-like noise approximation using sin
    const noise = Math.sin(p.position.x * 0.3 + this._time * 2)
                * Math.cos(p.position.y * 0.5 + this._time * 1.5);
    p.force.x += (this.direction.x + noise * this.turbulence * this.direction.x) * p.mass;
    p.force.y += (this.direction.y + noise * this.turbulence * this.direction.y) * p.mass;
  }
}

export class VortexField implements ForceField {
  type = "vortex";
  constructor(public center: Vec2, public strength: number = 200) {}
  apply(p: Particle): void {
    const dx = p.position.x - this.center.x;
    const dy = p.position.y - this.center.y;
    const distSq = dx * dx + dy * dy + 0.01;
    const force = this.strength / distSq;
    // Perpendicular force (tangential to circle around center)
    p.force.x += -dy * force;
    p.force.y += dx * force;
  }
}

export class ExplosionImpulse implements ForceField {
  type = "explosion";
  private _applied = false;
  constructor(
    public center: Vec2,
    public strength: number = 1000,
    public radius: number = 20
  ) {}
  apply(p: Particle): void {
    if (this._applied) return; // one-shot
    const dx = p.position.x - this.center.x;
    const dy = p.position.y - this.center.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > this.radius) return;
    const falloff = 1 - dist / this.radius;
    const impulse = this.strength * falloff;
    p.velocity.x += (dx / (dist + 0.01)) * impulse * p.inverseMass;
    p.velocity.y += (dy / (dist + 0.01)) * impulse * p.inverseMass;
  }
  markApplied(): void { this._applied = true; }
}

export class DragForce implements ForceField {
  type = "drag";
  constructor(public coefficient: number = 0.1) {}
  apply(p: Particle): void {
    p.force.x -= p.velocity.x * this.coefficient;
    p.force.y -= p.velocity.y * this.coefficient;
  }
}

export class AttractRepel implements ForceField {
  type = "attract-repel";
  constructor(
    public center: Vec2,
    public strength: number = 300, // positive = attract, negative = repel
    public maxRadius: number = 30
  ) {}
  apply(p: Particle): void {
    const dx = this.center.x - p.position.x;
    const dy = this.center.y - p.position.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > this.maxRadius || dist < 0.01) return;
    const falloff = 1 - dist / this.maxRadius;
    const force = this.strength * falloff * p.mass;
    p.force.x += (dx / dist) * force;
    p.force.y += (dy / dist) * force;
  }
}
```

### Constraint System

Constraints connect particles to each other or to fixed points. Essential for rope, cloth, and structural simulations:

```typescript
// app/lib/physics/constraints.ts

export interface Constraint {
  type: string;
  solve(dt: number): void;
}

/** Fixed-length rod between two particles */
export class DistanceConstraint implements Constraint {
  type = "distance";
  constructor(
    public a: Particle,
    public b: Particle,
    public restLength: number,      // natural length
    public stiffness: number = 1.0  // 0..1, how rigidly to enforce
  ) {}
  solve(): void {
    const dx = this.b.position.x - this.a.position.x;
    const dy = this.b.position.y - this.a.position.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 0.0001) return;
    const diff = (dist - this.restLength) / dist;
    const correction = diff * this.stiffness * 0.5;
    const invMassSum = this.a.inverseMass + this.b.inverseMass;
    if (invMassSum === 0) return;
    const aRatio = this.a.inverseMass / invMassSum;
    const bRatio = this.b.inverseMass / invMassSum;
    this.a.position.x += dx * correction * aRatio;
    this.a.position.y += dy * correction * aRatio;
    this.b.position.x -= dx * correction * bRatio;
    this.b.position.y -= dy * correction * bRatio;
  }
}

/** Elastic spring between two particles */
export class SpringConstraint implements Constraint {
  type = "spring";
  constructor(
    public a: Particle,
    public b: Particle,
    public restLength: number,
    public stiffness: number = 50,  // spring constant k
    public damping: number = 0.5
  ) {}
  solve(dt: number): void {
    const dx = this.b.position.x - this.a.position.x;
    const dy = this.b.position.y - this.a.position.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 0.0001) return;
    const extension = dist - this.restLength;
    const fx = (dx / dist) * extension * this.stiffness;
    const fy = (dy / dist) * extension * this.stiffness;
    // Damping force
    const dvx = this.b.velocity.x - this.a.velocity.x;
    const dvy = this.b.velocity.y - this.a.velocity.y;
    const dampX = dvx * this.damping;
    const dampY = dvy * this.damping;
    this.a.force.x += (fx + dampX) * dt;
    this.a.force.y += (fy + dampY) * dt;
    this.b.force.x -= (fx + dampX) * dt;
    this.b.force.y -= (fy + dampY) * dt;
  }
}

/** Pin a particle to a fixed position */
export class PinConstraint implements Constraint {
  type = "pin";
  constructor(
    public particle: Particle,
    public position: Vec2
  ) {}
  solve(): void {
    this.particle.position.x = this.position.x;
    this.particle.position.y = this.position.y;
    this.particle.velocity.x = 0;
    this.particle.velocity.y = 0;
  }
}

/** Keep all particles within grid bounds */
export class BoundaryConstraint implements Constraint {
  type = "boundary";
  constructor(
    public minX: number, public minY: number,
    public maxX: number, public maxY: number,
    public restitution: number = 0.5
  ) {}
  solve(): void { /* called per-particle during broadphase */ }
  applyToParticle(p: Particle): void {
    if (p.position.x - p.radius < this.minX) {
      p.position.x = this.minX + p.radius;
      p.velocity.x *= -this.restitution;
    }
    if (p.position.x + p.radius > this.maxX) {
      p.position.x = this.maxX - p.radius;
      p.velocity.x *= -this.restitution;
    }
    if (p.position.y - p.radius < this.minY) {
      p.position.y = this.minY + p.radius;
      p.velocity.y *= -this.restitution;
    }
    if (p.position.y + p.radius > this.maxY) {
      p.position.y = this.maxY - p.radius;
      p.velocity.y *= -this.restitution;
    }
  }
}
```

### Cloth & Rope Simulation (Position-Based Dynamics)

For cloth and rope, use PBD with the Verlet integrator and distance constraints:

```typescript
// Cloth = grid of particles + stretch/shear/bend constraints
function createCloth(
  startX: number, startY: number,
  width: number, height: number,
  spacing: number,
  stiffness: number = 0.8
): { particles: Particle[]; constraints: Constraint[] } {
  const particles: Particle[] = [];
  const constraints: Constraint[] = [];
  const cols = Math.ceil(width / spacing);
  const rows = Math.ceil(height / spacing);

  // Create particle grid
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      particles.push(new Particle(
        new Vec2(startX + c * spacing, startY + r * spacing),
        1.0,
        [200, 200, 200] // default cloth color
      ));
    }
  }

  // Stretch constraints (horizontal + vertical neighbors)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      if (c < cols - 1) constraints.push(new DistanceConstraint(
        particles[idx], particles[idx + 1], spacing, stiffness
      ));
      if (r < rows - 1) constraints.push(new DistanceConstraint(
        particles[idx], particles[idx + cols], spacing, stiffness
      ));
    }
  }

  // Shear constraints (diagonals) for stability
  const diagLen = spacing * Math.SQRT2;
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const idx = r * cols + c;
      constraints.push(new DistanceConstraint(
        particles[idx], particles[idx + cols + 1], diagLen, stiffness * 0.5
      ));
      constraints.push(new DistanceConstraint(
        particles[idx + 1], particles[idx + cols], diagLen, stiffness * 0.5
      ));
    }
  }

  // Pin top row (or any row) to create hanging cloth
  for (let c = 0; c < cols; c += Math.max(1, Math.floor(cols / 4))) {
    constraints.push(new PinConstraint(
      particles[c],
      new Vec2(particles[c].position.x, particles[c].position.y)
    ));
  }

  return { particles, constraints };
}
```

### Pixelize / Rasterize Bridge

The critical function that converts physics state back to the pixel grid:

```typescript
// app/lib/physics/rasterizer.ts

/** Convert lit pixels on a grid into physics particles */
export function pixelize(
  grid: Uint8ClampedArray,
  cols: number,
  rows: number
): Particle[] {
  const particles: Particle[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = (r * cols + c) * 3;
      const red = grid[idx], green = grid[idx + 1], blue = grid[idx + 2];
      if (red > 5 || green > 5 || blue > 5) {
        particles.push(new Particle(
          new Vec2(c + 0.5, r + 0.5), // center of cell
          1.0,
          [red, green, blue]
        ));
      }
    }
  }
  return particles;
}

/** Write physics particles back to the grid */
export function rasterize(
  particles: Particle[],
  grid: Uint8ClampedArray,
  cols: number,
  rows: number
): void {
  grid.fill(0); // clear
  for (const p of particles) {
    if (!p.alive) continue;
    const c = Math.round(p.position.x - 0.5);
    const r = Math.round(p.position.y - 0.5);
    if (c < 0 || c >= cols || r < 0 || r >= rows) continue;
    const idx = (r * cols + c) * 3;
    // Additive blend (handles overlapping particles)
    grid[idx]     = Math.min(255, grid[idx] + p.color[0]);
    grid[idx + 1] = Math.min(255, grid[idx + 1] + p.color[1]);
    grid[idx + 2] = Math.min(255, grid[idx + 2] + p.color[2]);
  }
}

/** Interpolated rasterize for smooth rendering between physics steps */
export function rasterizeInterpolated(
  particles: Particle[],
  grid: Uint8ClampedArray,
  cols: number, rows: number,
  alpha: number // 0..1, how far between previous and current step
): void {
  grid.fill(0);
  for (const p of particles) {
    if (!p.alive) continue;
    const x = p.prevPosition.x + (p.position.x - p.prevPosition.x) * alpha;
    const y = p.prevPosition.y + (p.position.y - p.prevPosition.y) * alpha;
    const c = Math.round(x - 0.5);
    const r = Math.round(y - 0.5);
    if (c < 0 || c >= cols || r < 0 || r >= rows) continue;
    const idx = (r * cols + c) * 3;
    grid[idx]     = Math.min(255, grid[idx] + p.color[0]);
    grid[idx + 1] = Math.min(255, grid[idx + 1] + p.color[1]);
    grid[idx + 2] = Math.min(255, grid[idx + 2] + p.color[2]);
  }
}
```

### "Bake to Keyframes" Bridge

Physics simulations can be captured as keyframe data, making them editable in the timeline (Phase 5) and exportable as Lottie (Phase 7):

```typescript
// app/lib/physics/baker.ts

/** Run a physics simulation and capture particle positions as keyframes */
export function bakePhysicsToKeyframes(
  world: PhysicsWorld,
  duration: number,   // in seconds
  fps: number = 60
): BakedAnimation {
  const dt = 1 / fps;
  const totalFrames = Math.ceil(duration * fps);
  const tracks: Map<string, { time: number; x: number; y: number }[]> = new Map();

  // Initialize tracks for each particle
  for (const p of world.particles) {
    tracks.set(p.id, []);
  }

  // Step the simulation and capture
  for (let frame = 0; frame < totalFrames; frame++) {
    world.step(dt);
    for (const p of world.particles) {
      tracks.get(p.id)!.push({
        time: frame,
        x: p.position.x,
        y: p.position.y,
      });
    }
  }

  return { tracks, fps, totalFrames };
}

/**
 * Convert baked physics data into KeyframeEngine tracks
 * (bridges Physics → Keyframe system from Phase 4)
 */
export function bakedToPropertyTracks(
  baked: BakedAnimation
): PropertyTrack[] {
  // Each particle's x,y positions become position keyframes
  // Simplify: remove redundant keyframes where position didn't change
  // This is the "physics bake" workflow
}
```

### Performance & Sleeping

For grids with many lit pixels (e.g., 1000+ particles), performance optimization is critical:

```typescript
// Sleeping: bodies with near-zero velocity for N frames go dormant
const SLEEP_VELOCITY_THRESHOLD = 0.01;
const SLEEP_FRAMES = 30; // frames of low velocity before sleeping

function updateSleepStates(particles: Particle[]): void {
  for (const p of particles) {
    if (p.type !== BodyType.Dynamic) continue;
    const speed = p.velocity.lenSq();
    if (speed < SLEEP_VELOCITY_THRESHOLD * SLEEP_VELOCITY_THRESHOLD) {
      p.sleepCounter++;
      if (p.sleepCounter >= SLEEP_FRAMES) p.sleeping = true;
    } else {
      p.sleepCounter = 0;
      p.sleeping = false;
    }
  }
}

// Sleeping particles skip integration AND collision detection
function step(dt: number): void {
  this.applyForces();  // only to non-sleeping particles
  this.integrate(dt);  // only to non-sleeping particles
  const pairs = this.broadPhase.query(this.activeParticles); // excludes sleeping
  const contacts = this.narrowPhase(pairs);
  this.solver.solve(contacts, dt);
  // Wake sleeping particles near a contact
  for (const c of contacts) { c.a.wake(); c.b.wake?.(); }
  this.updateSleepStates();
}
```

### Determinism Requirements

> [!WARNING]
> **For action-based recording replay (Phase 3) to work with physics, the simulation MUST be deterministic.** This means:
> 1. **Fixed timestep** (already enforced above)
> 2. **Seeded PRNG** for any randomness in forces (turbulence noise, particle spawn jitter)
> 3. **Consistent processing order** — sort particles by ID before integration
> 4. **No `Math.random()`** — use the same seeded RNG from Phase 2's `seededRng.ts`
> 5. **IEEE 754 compliance** — standard for all modern browsers, no special action needed

### Integration Points with Existing Systems

| Existing System | How Physics Integrates |
|---|---|
| **LayerManager** | Each layer gets an optional `PhysicsWorld`. `layer.physics.world` is `null` when disabled. When enabled, the world runs per-layer, independent of other layers. |
| **AnimationManager** | Physics and procedural animations can coexist on the same layer. The animation tick runs first, then physics reads the resulting grid as input. OR physics can be the sole animator (replacing the procedural tick). |
| **EffectsEngine** | Effects overlay renders on top of physics-rasterized pixels. Physics particles can trigger effects (e.g., a collision generates a ripple effect at the contact point). |
| **SessionRecorder** | Frame-based: physics runs during recording, composite is captured normally. Action-based: physics config (forces, constraints) is recorded as actions, deterministic replay reconstructs the simulation. |
| **Templates** | Physics-powered templates ("Explode", "Gravity Drop", "Shatter") set up initial physics conditions and force fields, then let the simulation run for N frames. |
| **Keyframe Engine** | "Bake to keyframes" converts a physics simulation into editable keyframe tracks. Physics-based easing functions (spring, damped oscillation) feed into the easing library. |
| **Lottie Export** | Baked physics keyframes can be exported as Lottie position/opacity animations. |
| **Canvas.tsx** | No direct integration — Canvas renders whatever is in the grid. Physics writes to the grid, Canvas reads from it. |
| **Debug Visualization** | Optional debug overlay: show particle circles, velocity arrows, force field regions, constraint lines, contact points. Renders to a second canvas overlay (similar to effects overlay). |

### Physics-Based Easing Functions

These go into `app/lib/easings.ts` and bridge physics into the keyframe system:

```typescript
/** Spring easing — overshoots then settles (like a physical spring) */
export function springEasing(
  stiffness: number = 100,
  damping: number = 10,
  mass: number = 1
): EasingFunction {
  // Pre-compute spring response curve via simulation
  const steps = 100;
  const dt = 1 / steps;
  let x = 0, v = 0;
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
    const idx = Math.min(steps, Math.floor(t * steps));
    const frac = t * steps - idx;
    const v0 = values[idx];
    const v1 = values[Math.min(steps, idx + 1)];
    return v0 + (v1 - v0) * frac;
  };
}

/** Bounce easing — simulates a ball bouncing */
export function bounceEasing(restitution: number = 0.6): EasingFunction {
  return (t: number) => {
    // Simulate ball under gravity hitting floor at y=1
    let v = 0, y = 0;
    const g = 10;
    const dt = 0.01;
    const targetTime = t;
    let elapsed = 0;
    while (elapsed < targetTime) {
      v += g * dt;
      y += v * dt;
      if (y >= 1) { y = 1; v *= -restitution; }
      elapsed += dt;
    }
    return Math.min(1, y);
  };
}

/** Damped harmonic oscillation */
export function dampedOscillation(
  frequency: number = 3,
  decay: number = 5
): EasingFunction {
  return (t: number) => {
    return 1 - Math.exp(-decay * t) * Math.cos(frequency * Math.PI * 2 * t);
  };
}
```

### Debug Visualization Mode

Debug mode renders physics state as an overlay on the canvas:

| Visual | What It Shows | Color |
|---|---|---|
| Circles | Particle collision shapes | Semi-transparent cyan |
| Arrows | Velocity vectors | Green |
| Lines | Constraint connections | Yellow |
| Dots | Contact points | Red |
| Regions | Force field areas (circle/rect) | Semi-transparent magenta |
| Gray tint | Sleeping particles | Gray overlay |
| Grid overlay | Spatial hash grid cells | Faint grid lines |

This renders to a separate `<canvas>` overlay (similar to how effects overlay works) and is toggled via a button in PhysicsPanel.

### Files to Create (Phase 8)

| File | Size Est. | Purpose |
|---|---|---|
| `app/lib/physics/math.ts` | ~3KB | Vec2 class with immutable + mutating operations |
| `app/lib/physics/types.ts` | ~2KB | Particle, BodyType, Contact, PhysicsConfig interfaces |
| `app/lib/physics/world.ts` | ~6KB | PhysicsWorld container — step(), addParticle(), addForce(), addConstraint() |
| `app/lib/physics/integrator.ts` | ~2KB | Symplectic Euler + Verlet integration functions |
| `app/lib/physics/spatialHash.ts` | ~3KB | Spatial hash grid for broad-phase collision |
| `app/lib/physics/collision.ts` | ~4KB | Narrow phase (circle-circle, circle-AABB, circle-line) + impulse resolution |
| `app/lib/physics/forces.ts` | ~5KB | All force fields (gravity, wind, vortex, explosion, drag, attract/repel) |
| `app/lib/physics/constraints.ts` | ~4KB | All constraints (distance, spring, pin, boundary) |
| `app/lib/physics/rasterizer.ts` | ~3KB | pixelize(), rasterize(), rasterizeInterpolated() |
| `app/lib/physics/presets.ts` | ~4KB | Pre-built configs (explode, gravity drop, cloth, rope, bounce, scatter) |
| `app/lib/physics/baker.ts` | ~3KB | bakePhysicsToKeyframes() + bakedToPropertyTracks() |
| `app/lib/physics/index.ts` | ~1KB | Public API re-export |
| `app/components/PhysicsPanel.tsx` | ~8KB | UI for physics controls (force fields, presets, debug toggle) |
| `app/hooks/usePhysicsEngine.ts` | ~2KB | React hook bridging PhysicsWorld to component lifecycle |

---

## 3. Current Codebase State

### File Inventory (as of April 24, 2026)

| Directory | File | Size | Status |
|---|---|---|---|
| `app/lib/` | `grid.ts` | 6.9KB | ✅ Stable |
| `app/lib/` | `layerManager.ts` | 10.6KB | 🔄 Modified (per-layer animation/effects added) |
| `app/lib/` | `animation.ts` | 3.9KB | ✅ Stable |
| `app/lib/` | `animations.ts` | 23KB | ✅ Stable (16 animations) |
| `app/lib/` | `effects.ts` | 32.8KB | ✅ Stable (13 presets + engine) |
| `app/lib/` | `effects-gl.ts` | 27.3KB | ✅ Stable (WebGL renderer) |
| `app/lib/` | `patterns.ts` | 7.7KB | ✅ Stable (13 patterns) |
| `app/lib/` | `font.ts` | 9.4KB | ✅ Stable |
| `app/lib/` | `palette.ts` | 4KB | 🔄 Modified (addCustomPalette, deleteCustomPalette added) |
| `app/lib/` | `sessionRecorder.ts` | 22.9KB | 🔄 Modified (getFrames, getRecDims added) |
| `app/lib/` | `exporter.ts` | 13KB | 🔄 Modified (reconstructFrames rewritten for direct access) |
| `app/lib/` | `deltaCodec.ts` | 5.4KB | ✅ Stable |
| `app/lib/` | `gifEncoder.ts` | 14.4KB | ✅ Stable (custom LZW) |
| `app/lib/` | `videoEncoder.ts` | 14.2KB | ✅ Stable (tiered WebCodecs/MediaRecorder) |
| `app/lib/` | `timelineManager.ts` | 7.8KB | ✅ Stable (clip-based) |
| `app/lib/` | `recorder.ts` | 4.6KB | ✅ Stable (stroke recorder) |
| `app/lib/` | `textAnimations.ts` | 4.5KB | ✅ Stable |
| `app/lib/` | `utils.ts` | 3.8KB | ✅ Stable |
| `app/components/` | `LEDBoard.tsx` | 78.6KB | 🔄 Active modification (per-layer wiring in progress) |
| `app/components/` | `Canvas.tsx` | 13.7KB | ✅ Stable |
| `app/components/` | `ControlPanel.tsx` | 30.9KB | 🔄 Modified (activeColor prop to PaletteSelector) |
| `app/components/` | `PaletteSelector.tsx` | 8.1KB | 🔄 Rewritten (names only, custom set creation) |
| `app/components/` | `LayerPanel.tsx` | 7.7KB | 📋 Pending (needs per-layer animation indicators) |
| `app/components/` | `AnimationPanel.tsx` | 7.9KB | ✅ Stable |
| `app/components/` | `EffectsPanel.tsx` | 12.2KB | ✅ Stable |
| `app/components/` | `ExportPanel.tsx` | 11.7KB | ✅ Stable |
| `app/components/` | `RecordingPanel.tsx` | 14.9KB | ✅ Stable |
| `app/components/` | `TimelinePanel.tsx` | 15.5KB | ✅ Stable |
| `app/components/` | `ColorPicker.tsx` | 4.8KB | ✅ Stable |
| `app/components/` | `PatternSelector.tsx` | 15.8KB | ✅ Stable |
| `app/components/` | `GestureController.tsx` | 17.7KB | ✅ Stable |
| `app/components/` | `InfoTooltip.tsx` | 3.1KB | ✅ Stable |
| `app/hooks/` | `useLayerManager.ts` | 2.3KB | 🔄 Modified (passes redraw to constructor) |
| `app/hooks/` | `useAnimationEngine.ts` | 1.5KB | 📋 May become unused (per-layer model replaces it) |
| `app/hooks/` | `useEffectsEngine.ts` | 3.6KB | 📋 May become unused (per-layer model replaces it) |
| `app/hooks/` | `useSessionRecording.ts` | 3.6KB | ✅ Stable |
| `app/hooks/` | `useGestures.ts` | 3.5KB | ✅ Stable |
| `app/hooks/` | `useTimelineEngine.ts` | 3.5KB | ✅ Stable |
| **Dead code** | `LEDBoard.new.tsx` | 69.9KB | ❌ Unused alternative — DELETE |
| **Dead code** | `LEDBoardLayered.tsx` | 8.7KB | ❌ Unused prototype — DELETE |

### Git State

- **Branch:** `animation-engine` (forked from `master` at `f852ad7`)
- Working tree may change as implementation continues. Always check `git status --short` before editing or committing.

---

## 4. Work Already Completed on `animation-engine` Branch

### Phase 0 — Bug Fixes ✅

| Task | Status | Detail |
|---|---|---|
| Fix Clear Button | ✅ Done | `clearBoard()` now resets ALL state: stops animations, clears effects, nulls snapshot, resets content layers, stops playback, clears ALL layers' grids, clears undo stack |
| Fix Export Pipeline | ✅ Done | `reconstructFrames()` rewritten to use direct `getFrames()` access instead of fragile serialize→deserialize round-trip. Added `getFrames()` and `getRecDims()` to SessionRecorder |
| Palette UI | ✅ Done | PaletteSelector rewritten to show names only (no swatches). Added "New Set" creation flow. Added delete for custom palettes. Added `addCustomPalette()` and `deleteCustomPalette()` to palette.ts |

### Phase 1 — Per-Layer Animation/Effects 🔄 In Progress

| Task | Status | Detail |
|---|---|---|
| Extend Layer interface | ✅ Done | `Layer` now has `animation: LayerAnimationState` and `effects: LayerEffectsState`. Each layer gets its own `AnimationManager` and `EffectsEngine` on creation |
| LayerManager constructor | ✅ Done | Accepts `redraw` callback, passes to per-layer engines. Added `destroy()`, `compositeEffectsOverlay()` |
| LEDBoard rewiring | 🔄 Partial | `animRef`/`effectsRef` now point to active layer's instances. `syncActiveLayerState()` syncs UI when switching layers. Resize handlers update ALL layers. Recording uses composited effects. Some handlers still need verification. |
| LayerPanel UI indicators | 📋 Pending | Needs `▶`/`✦` icons per layer showing animation/effects status |
| Canvas rendering verification | 📋 Pending | Need to verify effects overlay compositing works with per-layer model |
| TypeScript compilation | ✅ Verified | `tsc --noEmit` passes with zero errors (as of last check) |

---

## 5. Implementation Phases

The roadmap is now ordered around Tenix's product spine: **create → animate → export → expand**. The immediate product proof is not "can Tenix do every future thing?" but:

> Can a user make a compelling pixel/LED animation quickly and export a usable file?

Everything before Phase 7 should strengthen that proof. Physics, 3D, APIs, plugins, and community features remain planned, but they are second-act work.

### Dependency Graph

```
Phase 0: Stabilization + Export Trust ───────── ✅ DONE / VERIFY
    ↓
Phase 1: Independent Per-Layer Anim/FX ───────── 🔄 IN PROGRESS
    ↓
Phase 2: Exportable Animation MVP ────────────── prove GIF/WebM/MP4/PNG/SVG
    ↓
Phase 3: Action-Based Recording ──────────────── tiny files + deterministic replay
    ↓
Phase 4: Keyframe Interpolation Engine ───────── declarative animation model
    ↓
Phase 5: Property Timeline with Curves ───────── visual keyframe editing
    ↓
Phase 6: Template Fill System ────────────────── start/end → generated motion
    ↓
Phase 7: Lottie JSON Export ──────────────────── export declarative motion
    ↓
Phase 8: Physics-Enhanced Motion ─────────────── differentiating templates/sims
    ↓
Phase 9: Platform/Developer/Experimental ─────── ecosystem after proof
```

---

## Phase 0: Stabilization, Cleanup, and Export Trust

> **Status: ✅ Mostly complete, final verification required**

See [Section 4](#4-work-already-completed-on-animation-engine-branch) above.

### Goal

Make the current app trustworthy before adding new feature surface. Users should be able to draw, clear, record, and export without silent failures.

### Completed

| Task | Status | Detail |
|---|---|---|
| Clear button reset | ✅ Done | Clears grids, animations, effects, snapshots, playback, undo, and layer state. |
| Export pipeline repair | ✅ Done | `reconstructFrames()` uses direct `getFrames()` access instead of serialize/import round-trip. |
| Palette UI cleanup | ✅ Done | Palette selection and custom set creation are cleaner. |

### Remaining Cleanup

#### Files to Delete

| File | Reason |
|---|---|
| `app/components/LEDBoard.new.tsx` (69.9KB) | Unused alternative implementation |
| `app/components/LEDBoardLayered.tsx` (8.7KB) | Unused prototype |
| `app/hooks/useAnimationEngine.ts` (1.5KB) | Replaced by per-layer model (delete AFTER Phase 1 is verified) |
| `app/hooks/useEffectsEngine.ts` (3.6KB) | Replaced by per-layer model (delete AFTER Phase 1 is verified) |

#### Planning Documents to Move

These root-level `.md` files are planning artifacts, not source code. They should NOT be deleted but can be moved to a `docs/` directory if desired:
- `growth_plan.md`, `Growth_plan_implementation.md`, `Growth_plan_tasks.md`, `GLSL_Plan.md`, `Phase_7_Growth.md`, `18_Apr_Analysis.md`, `18_April_plan.md`

### Phase 0 Verification

1. `npx tsc --noEmit` passes.
2. Drawing, erase, fill, vibe, patterns, text, animations, effects, layers, recording, and export still work.
3. Export errors are visible to users instead of failing silently.
4. PNG export works even without a recording.
5. GIF/WebM/MP4 export works from a short recording or reports a useful unsupported-browser message.

---

## Phase 1: Independent Per-Layer Animation & Effects

> **Status: 🔄 Partially complete. See Section 4 for what's done.**

### Goal

Make layers a real animation primitive. Each layer owns its own grid, animation manager, effects engine, opacity, visibility, and blend mode. This is the foundation for timeline, keyframes, export, and future physics.

### Remaining Work

> **UI/Product Addendum (April 20, 2026):** Before moving to Phase 2, Phase 1 now also includes sidebar and layer-workflow polish. This addendum supersedes older assumptions that `Clear` should fully reset the app.

**New immediate priorities:**
- Simplify the sidebar so each top-level dropdown opens directly into real controls with no second nested disclosure step
- Restyle the Layers section so it matches the main panel theme
- Remove the unnecessary `Apply to Board` palette action
- Improve automatic layer naming so new and duplicated layers get sensible unique names
- Add explicit layer order controls (`Bring Forward` / `Send Back`)
- Add a `Select` tool so clicking visible content on the canvas activates the owning layer
- Split destructive actions into `Clear Canvas` and `Reset Workspace`
- Redesign the recording dropdown presentation to match the product theme and reduce icon noise

#### 1A. Fix Per-Layer Animation Runtime Isolation

**Files:** `app/lib/animations.ts`, `app/lib/animation.ts`, `app/lib/textAnimations.ts`, `app/lib/layerManager.ts`, `app/components/LEDBoard.tsx`

**Critical bug:** Multiple layers are still not truly independent because animation runtime state is still partially global:
- The content animation snapshot in `animations.ts` is module-global
- The marquee text buffer in `animations.ts` is module-global
- `LEDBoard.tsx` still treats the active layer's animation snapshot as a shared operational buffer in too many places

**Required fix:**
- Move animation runtime state to the layer / manager level
- Each `AnimationManager` must render from its own runtime context
- Each layer must own its own snapshot buffer, marquee buffer, and marquee buffer width
- Switching the active layer must only change which layer the UI edits, not which runtime other visible layers render from

**Target result:** Layer A can run animation X while Layer B runs animation Y and both remain visible and correct at the same time.

> **Superseding Note (April 20, 2026):** The remaining Phase 1 work below should now be interpreted through the lens of full layer independence. In practical terms this means:
> - the selected layer is an editor target only
> - visible non-active layers must keep rendering their own animation/effects unchanged
> - each layer must own its own snapshot / marquee animation runtime
> - hide/show state must affect live composite, live overlay composite, and export
> - PNG / SVG / GIF / WebM export must match the visible on-screen composite, not just the active layer

**Status (April 20, 2026):** Implemented. Animation snapshot and marquee runtime now live per layer, visible layers composite together, and export uses the visible composite path.

#### 1B. Sidebar / Control Panel Cleanup

**Files:** `app/components/ControlPanel.tsx`, `app/components/LayerPanel.tsx`, `app/components/PatternSelector.tsx`, `app/components/AnimationPanel.tsx`, `app/components/EffectsPanel.tsx`, `app/components/RecordingPanel.tsx`, `app/components/PaletteSelector.tsx`

**Goal:** Make the sidebar feel like one coherent professional control surface instead of nested controls with mismatched visual language.

**Required work:**
- Restyle `LayerPanel` so it matches the main panel theme instead of using a separate indigo/slate treatment
- Remove the unnecessary `Apply to Board` action from the palette section
- Convert nested component-level dropdowns into one-step sections: when a top-level accordion opens, the actual controls should be visible immediately
- If a section has an enable/disable control, that control should appear at the top of the opened section
- Redesign the recording section controls to match the rest of the theme; remove decorative icons from the dropdown label and reduce visual noise
- Keep mobile usability intact while simplifying the hierarchy

#### 1C. Layer Workflow Polish

**Files:** `app/components/LayerPanel.tsx`, `app/components/LEDBoard.tsx`, `app/lib/layerManager.ts`, `app/types/index.ts`

**Goal:** The app should behave like a proper layered editor, not just a stack selector.

**Required work:**
- Add better automatic layer naming so newly added and duplicated layers get sensible unique names
- Expose layer ordering controls in the UI (`Bring Forward` / `Send Back`)
- Add a `Select` tool that lets the user click visible content on the canvas and automatically select the owning layer
- Layer hit-testing should respect visibility and stack order, choosing the topmost visible non-empty layer at the clicked cell
- Keep existing hide/show behavior and per-layer status indicators intact

#### 1D. Split Clear Canvas vs Reset Workspace

**Files:** `app/components/ControlPanel.tsx`, `app/components/LEDBoard.tsx`, `app/lib/layerManager.ts`

**Goal:** Separate destructive content clearing from a true first-launch reset.

**Required work:**
- `Clear Canvas` should clear content buffers and stop active animations/playback without resetting the whole workspace configuration
- `Reset Workspace` should return the app to a first-launch state: default tool/color/settings, fresh layer stack, cleared recordings, cleared undo/history, and cleared persisted local state
- Gesture shortcuts and any existing clear-related code paths must be updated to call the intended action explicitly

#### 1E. Verification Steps

1. `npx tsc --noEmit` must pass with zero errors
2. Open sidebar sections once and confirm controls are immediately visible with no second nested disclosure step
3. Create 2+ layers and confirm names are unique and ordering controls move layers predictably
4. Use the `Select` tool on visible content and confirm the topmost owning layer becomes active
5. Create 2 layers, start different animations on each, and confirm both play simultaneously
6. Create 2 layers, enable effects on both with different presets, and confirm both render
7. `Clear Canvas` should clear pixels and stop playback/animations while preserving workspace structure and settings
8. `Reset Workspace` should return the app to first-launch state
9. PNG / SVG / GIF / WebM export should match the visible on-screen composite

#### 1B. Update LayerPanel.tsx — Per-Layer Status Indicators

**File:** `app/components/LEDBoard.tsx`

Add visual indicators to each layer row:
- `▶` icon (green) if that layer's animation is playing
- `⏸` icon (yellow) if paused
- `✦` icon (purple) if that layer's effects are enabled
- These should be small, non-intrusive icons next to the layer name

**How to access the data:**
```typescript
// In the layer map:
const isAnimPlaying = layer.animation.manager.state === "playing";
const isAnimPaused = layer.animation.manager.state === "paused";
const hasEffects = layer.effects.enabled;
```

#### 1C. Verify Canvas Effects Overlay Rendering

**File:** `app/components/Canvas.tsx`

The Canvas component's `drawGrid` function reads the effects overlay. With per-layer effects, it should now read the composited overlay from `LayerManager.compositeEffectsOverlay()` instead of a single engine's overlay.

Check how `Canvas.tsx` accesses the effects overlay and update if needed. The change is in how the overlay reference is passed — it should come from `layerManagerRef.current.compositeEffectsOverlay()` instead of `effectsOverlayRef.current`.

#### 1D. Verification Steps

1. `npx tsc --noEmit` — must pass with zero errors
2. Create 2 layers → start different animations on each → both should play simultaneously
3. Create 2 layers → enable effects on both with different presets → both should render
4. Switch active layer → animation/effect panels should update to show that layer's state
5. Clear → everything should reset completely
6. Record → export as GIF → verify file works

#### 1E. Orchestrator Decomposition Gate

`app/components/LEDBoard.tsx` is now large enough that every major feature increases coordination risk. Before starting Phase 3+ work, extract focused hooks/modules so export, recording, layer state, gesture handling, animation state, effects state, and keyboard/fullscreen behavior are easier to reason about.

Recommended split:

| Module | Responsibility |
|---|---|
| `useBoardPersistence.ts` | localStorage load/save for settings, grid, tool, color, effects |
| `useBoardActions.ts` | draw/erase/fill/vibe/text/pattern action handlers |
| `useBoardExport.ts` | export data preparation and current-frame/render-to-offscreen helpers |
| `useBoardPlayback.ts` | animation, timeline, and recording playback coordination |
| `useBoardShortcuts.ts` | keyboard shortcuts and fullscreen behavior |

This is not a product feature, but it is a roadmap gate: do it before action recording, keyframes, or physics make the component harder to safely change.

---

## Phase 2: Exportable Animation MVP

> **Status: 📋 Not started**
> **Depends on:** Phase 1 complete
> **Estimated effort:** 4-8 hours
> **This phase proves Tenix is a usable product, not only a creative toy.**

### Goal

Make export reliable, discoverable, and useful for real workflows. A user should be able to create a small animation and leave with a valid asset.

### Export Targets

| Format | Priority | Use Case |
|---|---|---|
| PNG | P0 | Static poster/thumbnail/current frame |
| SVG | P0 | Static scalable pixel-vector export |
| GIF | P0 | Universal social/chat sharing |
| WebM | P0 | High-quality browser/social animation |
| MP4 | P1 | Broad social compatibility where browser APIs allow it |
| Sprite sheet | P1 | Game/dev workflows |
| Transparent PNG/WebM/APNG | P2 | Overlays, stream assets, compositing |
| Lottie JSON | Later | Phase 7, after declarative keyframes exist |

### Implementation Work

| Area | Work |
|---|---|
| ExportPanel UX | Show progress, success, exact failure reason, and browser support notes. |
| Current-frame export | PNG/SVG should work without requiring a recording. |
| Recording export | GIF/WebM/MP4 should export short recordings reliably. |
| Quality presets | Small/medium/HD size presets with FPS and duration caps. |
| Canvas renderer | Add `renderToOffscreen(width, height, options)` for high-res and transparent export. |
| Frame source | Keep frame-based recording as the canonical source for video export until action replay is deterministic. |
| Validation | Exported files must be loadable in standard viewers/players. |

### Files to Modify

| File | Change |
|---|---|
| `app/components/ExportPanel.tsx` | Export progress, errors, format availability, quality presets. |
| `app/lib/exporter.ts` | Normalize export paths and avoid fragile frame reconstruction. |
| `app/lib/videoEncoder.ts` | Harden WebCodecs → MediaRecorder fallback behavior. |
| `app/lib/gifEncoder.ts` | Keep pure-JS fallback; profile only if GIF export becomes too slow. |
| `app/components/Canvas.tsx` | Add offscreen/high-res/transparent render support. |
| `app/components/LEDBoard.tsx` | Pass correct composited grid/effects/layers to export. |

### Verification

1. Draw a static board → export PNG/SVG → files open correctly.
2. Record a 3-5 second animation → export GIF/WebM → files play correctly.
3. Try export in a browser without WebCodecs → fallback path works or gives a clear message.
4. Export uses composited layer/effects output, not only the active layer.
5. Export failure never disappears silently.

---

## Phase 3: Action-Based Recording & Deterministic Replay

> **Status: 📋 Not started**
> **Depends on:** Phase 1 + Phase 2
> **Estimated effort:** 4-8 hours

### Goal

Replace frame-by-frame recording with action-based recording for `.tenix-rec` project files. File sizes drop from MBs to KBs. Frame-based recording is retained as an export/render cache for GIF/WebM/MP4.

### Architecture

```typescript
// NEW file: app/lib/actionRecorder.ts

interface ActionRecord {
  version: 3;
  cols: number;
  rows: number;
  cellSize: number;
  /** Base64 of the initial grid state (one snapshot) */
  initialState: string;
  /** Ordered list of user actions with timestamps */
  actions: Action[];
  /** RNG seed for deterministic replay of procedural effects */
  rngSeed: number;
}

type Action =
  | { t: number; type: "draw"; col: number; row: number; color: [number, number, number] }
  | { t: number; type: "erase"; col: number; row: number }
  | { t: number; type: "fill"; col: number; row: number; color: [number, number, number] }
  | { t: number; type: "pattern"; name: string }
  | { t: number; type: "animation"; name: string; action: "play" | "pause" | "stop"; layerId: string }
  | { t: number; type: "effect"; preset: string; enabled: boolean; layerId: string }
  | { t: number; type: "effectTrigger"; col: number; row: number; color: [number, number, number]; layerId: string }
  | { t: number; type: "clear" }
  | { t: number; type: "text"; text: string; color: [number, number, number]; scale: number }
  | { t: number; type: "layer"; action: "sync"; layers: SerializedLayerState[]; activeLayerId: string | null }
  | { t: number; type: "layer"; action: "add" | "delete" | "select"; layerId: string; name?: string }
  | { t: number; type: "palette"; paletteId: string | null }
  | { t: number; type: "tool"; tool: "draw" | "erase" | "fill" | "vibe" }
  | { t: number; type: "color"; color: [number, number, number] };
```

### Files to Create

| File | Purpose |
|---|---|
| `app/lib/actionRecorder.ts` | Action recording and replay engine |

### Files to Modify

| File | Change |
|---|---|
| `app/components/LEDBoard.tsx` | Instrument all user actions to emit events to the action recorder |
| `app/components/RecordingPanel.tsx` | Add toggle between "Action" and "Frame" recording modes |
| `app/components/ControlPanel.tsx` | Pass recording mode controls through the sidebar |
| `app/lib/layerManager.ts` | Restore serialized layer stacks for deterministic action replay |
| `app/lib/animations.ts` / `app/lib/patterns.ts` | Replace non-deterministic random calls with seeded RNG |

### Current Scope

- `.tenix-rec` v3 import/export is handled by `actionRecorder.ts`
- Frame recording remains the source for GIF/WebM export
- Action playback restores the layered board state and then reapplies timed actions
- Imported action recordings do not yet auto-generate a frame cache for GIF/WebM export

### Critical Implementation Detail: Deterministic Replay

> [!WARNING]
> **If `Math.random()` is used anywhere in animations, effects, or patterns, the replay will diverge.** You MUST:
> 1. Create a seeded PRNG (e.g., `mulberry32` or `xoshiro128**`)
> 2. Replace all `Math.random()` calls in `effects.ts`, `patterns.ts`, and `animations.ts` with the seeded PRNG
> 3. Record the seed in the action record
> 4. Reset the PRNG to the recorded seed before replay

### Verification

- Record a 30-second drawing session → export → file size should be < 50KB
- Import the recording → replay → result should be pixel-identical to the original
- Frame recording still works for video export (GIF/WebM)

---

## Phase 4: Keyframe Interpolation Engine

> **Status: 📋 Not started**
> **Depends on:** Phase 1 + Phase 3
> **Estimated effort:** 6-8 hours
> **This is the CORE of the animation-engine vision.**

### Goal

Build a data-driven animation system where the user defines state at time T1 and T2, and the engine interpolates between them. This replaces the current procedural-only animation model and makes future Lottie export realistic.

### Architecture

```
User defines:
  Keyframe at t=0:   Layer 1 position=(0,0), opacity=1.0, color=red
  Keyframe at t=60:  Layer 1 position=(50,10), opacity=0.5, color=blue
  Easing: "ease-in-out"

Engine computes frame 30:
  position = lerp((0,0), (50,10), easeInOut(0.5)) = (25, 5)
  opacity = lerp(1.0, 0.5, easeInOut(0.5)) = 0.75
  color = lerpRGB(red, blue, easeInOut(0.5)) = purple
```

### Files to Create

#### `app/lib/easings.ts`
All standard easing functions (30+ functions):
```typescript
export type EasingFunction = (t: number) => number;

export const easings = {
  linear: (t: number) => t,
  easeInQuad: (t: number) => t * t,
  easeOutQuad: (t: number) => t * (2 - t),
  easeInOutQuad: (t: number) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
  easeInCubic: (t: number) => t * t * t,
  easeOutCubic: (t: number) => (--t) * t * t + 1,
  easeInOutCubic: (t: number) => t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1,
  easeInElastic: (t: number) => /* ... */,
  easeOutBounce: (t: number) => /* ... */,
  spring: (t: number) => /* ... */,
};
```

#### `app/lib/keyframeEngine.ts`
The core interpolation engine:

```typescript
interface Keyframe<T> {
  time: number;
  value: T;
  easing: EasingFunction;
}

interface PropertyTrack<T> {
  property: string;
  keyframes: Keyframe<T>[];
  interpolate: (a: T, b: T, t: number) => T;
}

interface LayerAnimation {
  layerId: string;
  tracks: PropertyTrack<number | RGB | [number, number]>[];
}

interface AnimationProject {
  duration: number;
  fps: number;
  layers: LayerAnimation[];
}

class KeyframeEngine {
  evaluate(project: AnimationProject, time: number): Map<string, AnimatedValues>;
  addKeyframe(layerId: string, property: string, time: number, value: unknown, easing: EasingFunction): void;
  removeKeyframe(layerId: string, property: string, time: number): void;
  getKeyframesForLayer(layerId: string): PropertyTrack<unknown>[];
}
```

### Animatable Properties

| Property | Type | Default | Description |
|---|---|---|---|
| `position.x` | `number` | 0 | Horizontal offset in cells |
| `position.y` | `number` | 0 | Vertical offset in cells |
| `opacity` | `number` | 1.0 | Layer transparency |
| `scale` | `number` | 1.0 | Uniform scale factor |
| `rotation` | `number` | 0 | Rotation in degrees |
| `color.hueShift` | `number` | 0 | Shift all pixel hues by degrees |
| `color.brightness` | `number` | 1.0 | Brightness multiplier |
| `visibility` | `boolean` | true | Show/hide layer |

### Files to Modify

| File | Change |
|---|---|
| `app/lib/layerManager.ts` | Add animated layer properties and ensure `composite()` can apply transforms. |
| `app/components/Canvas.tsx` | Support per-layer transforms during render/export. |
| `app/components/LEDBoard.tsx` | Wire keyframe evaluation into the render loop and export paths. |

### Verification

- Create a 2-layer project → add position keyframes → play → Layer 1 should slide from left to right while Layer 2 stays still
- Verify all 30+ easing functions produce smooth curves
- Verify color interpolation is perceptually smooth (use HSL interpolation, not RGB)

---

## Phase 5: Property Timeline with Curves

> **Status: 📋 Not started**
> **Depends on:** Phase 4
> **Estimated effort:** 8-10 hours

### Goal

A visual timeline UI where users can see keyframes, drag to reposition them, adjust easing curves visually, scrub through the animation, and see a live preview.

### Architecture

This extends the existing `TimelinePanel.tsx` (which currently does clip-based sequencing) into a property-curve-based timeline:

```
┌────────────────────────────────────────────────────────────┐
│  Timeline Panel                                     ■ ▶ ❚❚ │
├────────────────────────────────────────────────────────────┤
│  ▸ Layer 1 "Background"                                    │
│    ├─ position.x  ●──────────────────────●─────────●      │
│    ├─ opacity      ●════════════════●                      │
│    └─ color        ●──────●──────────────●                 │
│  ▸ Layer 2 "Text"                                          │
│    ├─ position.x  ●──────●                                 │
│    └─ scale       ●════════════●                           │
├────────────────────────────────────────────────────────────┤
│  0f        15f       30f        45f       60f              │
│  |─────────|─────────|─────────|─────────|                 │
│            ▲ (scrubber)                                     │
└────────────────────────────────────────────────────────────┘
```

### Features

1. **Keyframe diamonds** (`●`) — click to select, drag to move in time
2. **Property rows** — expandable per layer, one row per animated property
3. **Easing curves** — click the segment between two keyframes to change easing (dropdown or bezier curve editor)
4. **Scrubber** — drag along the timeline to preview any frame
5. **Playback controls** — play/pause/stop with FPS control
6. **Add keyframe** — click on property row at desired time, or "set keyframe at current time" button
7. **Onion skinning** — toggle to show ghosted previous/next frames while scrubbing

### Files to Create

| File | Purpose |
|---|---|
| `app/components/PropertyTimeline.tsx` | The main timeline UI component |
| `app/components/KeyframeEditor.tsx` | Popup for editing a single keyframe's value + easing |
| `app/components/EasingPicker.tsx` | Visual easing function selector |

### Files to Modify

| File | Change |
|---|---|
| `app/components/TimelinePanel.tsx` | Integrate the new PropertyTimeline into the existing panel, or replace it |
| `app/components/LEDBoard.tsx` | Connect timeline scrubbing to keyframe engine evaluation |

---

## Phase 6: Template Fill System

> **Status: 📋 Not started**
> **Depends on:** Phases 4+5
> **Estimated effort:** 4-6 hours

### Goal

Pre-built animation templates that users can apply between keyframes. "Define start and end → pick a template → export in seconds."

### How It Works

```
User defines:
  Start state: Text "SUBSCRIBE" visible at center
  End state: Text gone, particles scattered

User picks template: "Explode"

Engine auto-generates:
  Keyframes for each pixel: position moves outward, opacity fades, scale shrinks
  Easing: easeOutExpo (fast start, slow end)
```

### Template Categories

| Category | Templates |
|---|---|
| **Entrances** | Fade In, Slide In (L/R/U/D), Bounce In, Scale Up, Typewriter, Glitch In |
| **Exits** | Fade Out, Slide Out, Scale Down, Dissolve, **Explode (physics)**, Swipe Away |
| **Emphasis** | Pulse, Shake, Wiggle, Flash, Rubber Band |
| **Transitions** | Cross Fade, Wipe (L/R/U/D), Pixelate, Morph |
| **Loops** | Breathe, Float, Rotate, Color Cycle, Wave |
| **Physics-ready** | Explode, Gravity Drop, Wind Scatter, Vortex Swirl, Shatter, Black Hole, Cloth Wave. These start as keyframe approximations and become true physics templates in Phase 8. |

### Files to Create

| File | Purpose |
|---|---|
| `app/lib/templates.ts` | Template definitions (each is a function that generates keyframes OR sets up physics) |
| `app/components/TemplatePicker.tsx` | UI for browsing and applying templates |

### Template Rule

Templates should generate editable keyframes first. This keeps the core workflow simple: apply template, scrub timeline, tweak keyframes, export. Physics-backed templates are allowed later, but they must bake into keyframes so the result remains editable and exportable.

### Future Physics Template Behavior

Physics-powered templates don't generate keyframes directly. Instead, they:
1. Call `pixelize()` to convert the current grid into particles
2. Set up the appropriate force fields and constraints from the physics presets
3. Run the simulation for N frames (or until particles settle)
4. Optionally "bake to keyframes" via `bakePhysicsToKeyframes()` for editing

This means a physics template like "Explode" is just:
```typescript
const explodeTemplate: Template = {
  name: "Explode",
  category: "physics",
  apply: (layer: Layer) => {
    const world = layer.physics.world!;
    world.addForce(new ExplosionImpulse(gridCenter, 1000));
    world.addForce(new DragForce(0.02));
    world.addConstraint(new BoundaryConstraint(0, 0, cols, rows));
  }
};
```

---

## Phase 7: Lottie JSON Export

> **Status: 📋 Not started**
> **Depends on:** Phases 4, 5, 6
> **Estimated effort:** 8-12 hours

### Goal

Export Tenix animations as Lottie JSON (`.json`) files usable in any Lottie player (web, iOS, Android, React Native).

### Architecture

Tenix works with pixels; Lottie works with vectors. The bridge:

```
Tenix Layer (pixel grid)
    ↓
Convert each non-transparent pixel to a Lottie "rectangle shape" at (col, row) with size (1, 1)
    ↓
Group adjacent same-color pixels into larger rectangles (optimization)
    ↓
Apply keyframe tracks as Lottie property animations
    ↓
Output Lottie JSON
```

### Lottie Spec Mapping

| Tenix Concept | Lottie Equivalent |
|---|---|
| Layer | Lottie Layer (type: shape) |
| Pixel at (x,y) with color | Rectangle shape at position (x,y) with fill color |
| position.x keyframe | Lottie transform.position.x keyframe |
| opacity keyframe | Lottie transform.opacity keyframe |
| scale keyframe | Lottie transform.scale keyframe |
| Easing function | Lottie bezier curve (ix, iy, ox, oy) |

### Files to Create

| File | Purpose |
|---|---|
| `app/lib/lottieExporter.ts` | Convert AnimationProject + layers → Lottie JSON |
| `app/lib/pixelToVector.ts` | Convert pixel grid → optimized rectangle shapes |

### Files to Modify

| File | Change |
|---|---|
| `app/components/ExportPanel.tsx` | Add "Export as Lottie" button |
| `app/lib/exporter.ts` | Add Lottie export path |

### Optimization: Pixel Grouping

A naive approach (one Lottie shape per pixel) would produce enormous JSON for large grids. Use rectangle merging:

1. Scan the grid left-to-right, top-to-bottom
2. Group adjacent same-color pixels into maximal horizontal runs
3. Merge adjacent same-color horizontal runs vertically
4. Each merged rectangle becomes one Lottie shape

This can reduce shape count by 10-100×.

---

## Phase 8: Physics-Enhanced Motion

> **Status: 📋 Not started**
> **Depends on:** Phases 3, 4, 5, 6
> **Estimated effort:** 10-14 hours for core; more for advanced presets
> **This phase creates the physics subsystem documented in [Physics Engine Architecture](#physics-engine-architecture).**

### Goal

Add physics as a differentiating animation generator, not as a distraction from the core product. The primary user-facing promise is: "draw text or pixels, choose a physics template, bake it into editable motion."

### Implementation Order

1. **Math primitives** (`physics/math.ts`) — Vec2 with mutating hot-path operations
2. **Types** (`physics/types.ts`) — Particle, BodyType, Contact, PhysicsConfig
3. **Integrator** (`physics/integrator.ts`) — Symplectic Euler + Verlet
4. **Rasterizer** (`physics/rasterizer.ts`) — pixelize() + rasterize() bridge
5. **Spatial hash** (`physics/spatialHash.ts`) — broad-phase collision
6. **Collision** (`physics/collision.ts`) — narrow phase + impulse resolution
7. **Forces** (`physics/forces.ts`) — gravity, wind, vortex, explosion, drag, attract/repel
8. **Constraints** (`physics/constraints.ts`) — distance, spring, pin, boundary
9. **World** (`physics/world.ts`) — PhysicsWorld orchestration
10. **Presets** (`physics/presets.ts`) — explode, gravity, cloth, vortex, etc.
11. **Baker** (`physics/baker.ts`) — bakePhysicsToKeyframes()
12. **Hook/UI** (`usePhysicsEngine.ts`, `PhysicsPanel.tsx`) — integrate only after engine is deterministic

### Physics Presets

| Preset | Forces | Constraints | Use Case |
|---|---|---|---|
| **Gravity Drop** | DirectionalGravity + floor boundary | optional boundary | Pixels fall and pile up |
| **Explode** | ExplosionImpulse + drag | optional boundary | Text or drawings burst outward |
| **Wind Scatter** | WindField + turbulence | none | Pixels drift sideways |
| **Vortex Swirl** | VortexField + drag | boundary | Pixels spiral around a point |
| **Black Hole** | PointGravity + drag | none | Pixels collapse toward center |
| **Cloth** | Gravity | distance + pin constraints | Hanging pixel fabric |
| **Rope** | Gravity | distance chain + pin | Dangling pixel rope |
| **Bounce** | Gravity | boundary with restitution | Bouncing pixel objects |
| **Magnet** | AttractRepel | boundary | Cursor-driven attraction/repulsion |
| **Zero Gravity** | low drag | boundary | Floating particle field |

### Files to Modify

| File | Change |
|---|---|
| `app/lib/layerManager.ts` | Add `physics: LayerPhysicsState` to `Layer` only when Phase 8 begins. |
| `app/components/LEDBoard.tsx` | Add physics tick and bake workflow after keyframes/timeline are stable. |
| `app/components/ControlPanel.tsx` | Add PhysicsPanel section after core animation UI is usable. |
| `app/components/LayerPanel.tsx` | Add physics status indicator. |
| `app/lib/templates.ts` | Upgrade physics-ready templates to true simulation-backed templates. |

### Verification

1. Deterministic replay produces identical particle/keyframe output from the same seed.
2. Draw text → apply "Explode" → bake → editable keyframes are generated.
3. Multi-layer: one layer uses gravity while another remains normal.
4. Physics particles rasterize cleanly back to the pixel grid.
5. Exported GIF/WebM/Lottie reflects baked physics motion.

---

## Phase 9: Platform, Developer, and Experimental Features

> **Status: 📋 Not started**
> **Depends on:** Core product proof from Phases 0-8
> **Estimated effort:** Weeks/months of work, split into separate projects

### Features (prioritized)

| Priority | Feature | Placement |
|---|---|---|
| 1 | **Cloud Save/Share** | After export works, because share links need previews and stored project files. |
| 2 | **Template Gallery / Marketplace** | After templates are useful locally. |
| 3 | **NPM Package** | After `app/lib/` APIs stabilize around grid, patterns, effects, keyframes, templates. |
| 4 | **Embeddable Widget** | After NPM/core API is stable. |
| 5 | **Plugin System** | After core extension points are proven; sandboxing required. |
| 6 | **Scripting Sandbox** | After plugin/core APIs exist; likely Monaco in a sandboxed iframe. |
| 7 | **Audio Reactive Mode** | After effects/timeline/export are stable; useful for stream visuals. |
| 8 | **3D View Mode** | Three.js-only optional renderer for LED panel/cube showcase. |
| 9 | **Physical LED Bridge** | WebSerial/WebUSB bridge to WS2812B/NeoPixel hardware. |
| 10 | **REST/WebSocket API / CLI Renderer** | Only after there is demand from developers/dashboard users. |

### Explicitly Out of Scope

These are discarded from the product scope unless a future strategy changes:

| Idea | Reason |
|---|---|
| Generic vector animation editor | Competes directly with Rive/LottieFiles/After Effects and weakens Tenix's pixel-first wedge. |
| Full custom 3D engine | Three.js should handle 3D view mode; building transforms/cameras/lighting from scratch is not core value. |
| General-purpose social network | Tenix may have sharing/community templates, but not a broad social platform. |

---

## 6. Technology Decisions

These decisions are FINAL and should not be revisited without strong justification:

| Decision | Choice | Rationale |
|---|---|---|
| **2D Rendering** | Custom engine (keep as-is) | Optimal for discrete grids. Full control over every byte. |
| **3D Rendering** | Three.js (optional view mode only) | For 3D LED cube visualization. `InstancedMesh` + `OrbitControls`. Don't build custom 3D. |
| **GPU Effects** | Custom WebGL + GLSL (keep as-is) | Your `effects-gl.ts` is correctly engineered. Don't switch to Three.js for 2D effects. |
| **GPU Fallback Tiers** | WebGPU → WebGL → CPU | WebGPU only when needed for compute shaders. Your WebGL → CPU fallback already exists. |
| **Physics Engine** | Custom TypeScript (NO external library) | Custom engine gives full control over pixel-grid bridge, determinism, and integration with existing systems. Rapier/Matter.js are overkill and add 100KB+ of bundle. |
| **Physics Integration** | Symplectic Euler default, Verlet for cloth/rope | Energy-conserving, simple, industry-standard (Box2D uses this). Verlet for constrained systems only. |
| **Physics Collision** | Spatial hash grid + circle/AABB narrow phase | Natural fit for uniform-sized pixel particles on a grid. O(1) lookup per particle. |
| **Video Export** | WebCodecs → MediaRecorder → GIF | Tiered strategy already implemented in `videoEncoder.ts`. |
| **State Management** | React refs + hooks (keep as-is) | No Redux/Zustand needed for current complexity. Revisit if prop drilling becomes unmanageable. |
| **Framework** | Next.js (keep as-is) | Project is already Next.js. No reason to change. |
| **WASM** | Targeted use only | For GIF encoding, flood fill on huge grids, delta compression. Physics engine stays in TS unless profiling shows need for WASM. |
| **OffscreenCanvas** | Move only EffectsEngine to worker | 80% of benefit with 20% of complexity. Main thread stays responsive. |
| **Bundle** | Keep lean | The entire app is ~8K lines. Don't add large libraries. Three.js only for 3D view mode. |

---

## 7. File Index

### Files That Will Be CREATED in Future Phases

| Phase | File | Purpose |
|---|---|---|
| 3 | `app/lib/actionRecorder.ts` | Action-based recording and deterministic replay |
| 3 | `app/lib/seededRng.ts` | Seeded PRNG for deterministic replay |
| 4 | `app/lib/easings.ts` | 30+ easing functions, including later physics-inspired easings |
| 4 | `app/lib/keyframeEngine.ts` | Core keyframe interpolation engine |
| 5 | `app/components/PropertyTimeline.tsx` | Visual keyframe timeline UI |
| 5 | `app/components/KeyframeEditor.tsx` | Keyframe value + easing editor popup |
| 5 | `app/components/EasingPicker.tsx` | Visual easing function selector |
| 6 | `app/lib/templates.ts` | Pre-built animation templates; physics-ready templates become true physics in Phase 8 |
| 6 | `app/components/TemplatePicker.tsx` | Template browser UI |
| 7 | `app/lib/lottieExporter.ts` | Lottie JSON export |
| 7 | `app/lib/pixelToVector.ts` | Pixel → optimized vector rectangles |
| 8 | `app/lib/physics/math.ts` | Vec2 class with immutable + mutating operations |
| 8 | `app/lib/physics/types.ts` | Particle, BodyType, Contact, PhysicsConfig interfaces |
| 8 | `app/lib/physics/world.ts` | PhysicsWorld container — step(), addParticle(), addForce() |
| 8 | `app/lib/physics/integrator.ts` | Symplectic Euler + Verlet integration functions |
| 8 | `app/lib/physics/spatialHash.ts` | Spatial hash grid for broad-phase collision |
| 8 | `app/lib/physics/collision.ts` | Narrow phase + impulse-based collision response |
| 8 | `app/lib/physics/forces.ts` | All 7 force field types (gravity, wind, vortex, explosion, drag, attract, point-gravity) |
| 8 | `app/lib/physics/constraints.ts` | All constraints (distance, spring, pin, boundary) |
| 8 | `app/lib/physics/rasterizer.ts` | pixelize(), rasterize(), rasterizeInterpolated() |
| 8 | `app/lib/physics/presets.ts` | Pre-built configs (explode, gravity drop, cloth, rope, bounce, etc.) |
| 8 | `app/lib/physics/baker.ts` | bakePhysicsToKeyframes() + bakedToPropertyTracks() |
| 8 | `app/lib/physics/index.ts` | Public API re-export |
| 8 | `app/components/PhysicsPanel.tsx` | UI for physics controls (force fields, presets, debug toggle) |
| 8 | `app/hooks/usePhysicsEngine.ts` | React hook bridging PhysicsWorld to component lifecycle |

### Files That Will Be DELETED

| File | When | Reason |
|---|---|---|
| `app/components/LEDBoard.new.tsx` | Phase 0 cleanup | Dead code (unused alternative) |
| `app/components/LEDBoardLayered.tsx` | Phase 0 cleanup | Dead code (unused prototype) |
| `app/hooks/useAnimationEngine.ts` | After Phase 1 verified | Replaced by per-layer model |
| `app/hooks/useEffectsEngine.ts` | After Phase 1 verified | Replaced by per-layer model |

---

## 8. Monetization Strategy

**Model: Freemium with Pro Export**

| Tier | Features | Price |
|---|---|---|
| **Free** | All creative tools, draw, patterns, effects, GIF export (watermarked), PNG/SVG export | $0 |
| **Pro** | HD video export (WebM/MP4), Lottie export, custom templates, no watermark, cloud save | $9/month or $79/year |
| **Enterprise** | White-label, API access, custom branding, priority support | Custom pricing |

**Revenue gates** (features that should be implemented as Pro-only from the start):
- Lottie JSON export
- HD video export (1080p+)
- Template marketplace (selling templates)
- Cloud save/share
- API access

---

## 9. Rules & Constraints for AI Agents

> [!CAUTION]
> **Any AI agent implementing features on this project MUST follow these rules:**

### Code Rules

1. **Never delete comments or docstrings** that are unrelated to the code being changed
2. **TypeScript strict mode** — `tsc --noEmit` must pass with zero errors after every change
3. **No new dependencies without justification** — the project is intentionally lean (~8K lines, zero runtime dependencies for core logic). The physics engine MUST be custom TypeScript, not Matter.js/Rapier/etc.
4. **Performance-first data model** — Always use `Uint8ClampedArray` flat buffers for grid data. Never use nested arrays or objects for pixel data.
5. **GPU fallback pattern** — Any GPU-accelerated feature must have a CPU fallback. Pattern: `const renderer = gpuRenderer ?? cpuFallback;`
6. **Per-layer isolation** — Animations and effects are per-layer now; physics becomes per-layer in Phase 8. Never create global instances. Access through `layer.animation.manager`, `layer.effects.engine`, and, once Phase 8 exists, `layer.physics.world`.
7. **Preserve existing functionality** — Every change must be verified to not break drawing, patterns, animations, effects, recording, export, gestures, or layers.
8. **Physics determinism** — The physics engine must be fully deterministic: fixed timestep, seeded PRNG for any randomness, consistent processing order (sort by particle ID). No `Math.random()` anywhere in the simulation loop.
9. **Physics-grid bridge** — Physics always operates on continuous coordinates. Conversion to/from grid cells is ONLY done by `pixelize()` and `rasterize()` in `physics/rasterizer.ts`. Never write physics positions directly to the grid.

### Architecture Rules

1. **LEDBoard.tsx is the orchestrator** — All state coordination happens here via hooks and refs. Don't create parallel state management.
2. **Engine layer has no React dependencies** — Files in `app/lib/` (including `app/lib/physics/`) must be pure TypeScript with no React imports. They are importable by any framework.
3. **Components receive data via props** — Components in `app/components/` never directly import engine instances. They receive data and callbacks from LEDBoard.tsx via ControlPanel.tsx.
4. **Hooks are adapters** — Files in `app/hooks/` bridge between React lifecycle and engine instances. They create/manage engine instances and expose state + handlers.
5. **Physics is a standalone module once Phase 8 begins** — The `app/lib/physics/` directory must have ZERO imports from other `app/lib/` files. It exports a clean public API via `physics/index.ts`. Integration happens in `layerManager.ts` and `LEDBoard.tsx`, not inside the physics module.
6. **Physics simulation loop once Phase 8 begins** — Physics world runs at a fixed 60Hz timestep, decoupled from the render frame rate. Use accumulator pattern with interpolated rendering. Never tie physics step to `requestAnimationFrame` directly.

### Testing Rules

1. After every phase, verify:
   - `tsc --noEmit` passes
   - Drawing (freehand, erase, fill) works
   - At least one animation plays correctly
   - At least one effect triggers correctly
   - Layer switching works
   - Clear button resets everything
   - Export produces valid files (PNG at minimum)

### Branch Rules

1. All work happens on the `animation-engine` branch
2. Commit after each completed sub-phase
3. Never force-push to master
4. PR to master only when a full phase is verified

### Node.js Path (for this machine)

```bash
# Node is installed via nvm at this non-standard path:
export PATH="/Users/appointy/.local/share/nvm/v24.14.1/bin:$PATH"

# Then run:
npx tsc --noEmit
npm run dev
npm run build
```

---

## Appendix: Key Type Definitions

### `app/types/index.ts`

```typescript
export type RGB = [number, number, number];
export type ToolKind = "draw" | "erase" | "fill" | "vibe";

export interface AnimationConfig {
  name: string;
  fps: number;
  tick: (cols: number, rows: number, data: Uint8ClampedArray, frame: number) => void;
}

export interface BoardSettings {
  cellSize: number;
  showGrid: boolean;
  backgroundColor: RGB;
}
```

### Recording States

```typescript
export type RecordingState = "idle" | "recording" | "playing" | "paused";
export type AnimationState = "stopped" | "playing" | "paused";
```
