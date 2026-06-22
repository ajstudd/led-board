# Phase E — Developer Platform

> **Status:** not started. Phases 0–D are complete (stable build, headless deterministic
> physics engine, per-layer physics + presets, bake-to-animation, deterministic
> GIF/WebM export, physics record/replay + persistence, unified export panel).
>
> Phase E opens the engine up to **various developers** by turning the code Tenix already
> runs into things other people can build on.

---

## 1. Goal

Take the **headless, deterministic engine that already exists** (`app/lib/physics/`) and expose it
through four developer surfaces — all powered by the *same* engine code ("one engine, many
consumers"):

| Surface | One-liner |
|---|---|
| **E1 — `@tenix/physics` npm package** | `npm install` the headless engine |
| **E2 — `<tenix-board>` widget** | Drop an animated pixel/physics scene on any website |
| **E3 — Scripting sandbox** | Script the board/physics from inside Tenix |
| **E4 — Render / REST API + CLI** | `POST /render` a scene → get a GIF/MP4 |

Anchor (unchanged from the platform thesis): **physics you can create, replay, and export** — the
developer surfaces must preserve determinism so output stays reproducible.

---

## 2. Why this is feasible now

The hard part is already done. `app/lib/physics/` is **zero-dependency**: no React, no DOM, no
canvas — it writes to a plain `Uint8ClampedArray`. It already runs in Node (that's how
`npm run test:physics` executes `bakeSimulation` headlessly). So E1 is mostly *packaging*, and the
deterministic frame generation that E2/E4 need already exists.

What does **not** exist yet:
- A **portable scene format** (only the in-app `SerializedBoardState` today).
- **Headless encoding** — the current encoders are browser-only (`videoEncoder.ts` uses
  WebCodecs/MediaRecorder; `gifEncoder.ts` consumes canvas `getImageData`).
- A **build/publish pipeline** and (likely) a **monorepo** layout.

---

## 3. The four surfaces

### E1 — `@tenix/physics` npm package (the foundation)

**What:** a publishable, headless engine others can import.

**Already ready:** `app/lib/physics/{math,rng,types,integrator,spatialHash,collision,forces,constraints,rasterizer,world,presets,easings,baker,index}.ts`
are pure TS with a clean public API (`index.ts`) and run in Node today.

**Work:**
- Decide layout: **npm/pnpm workspaces (monorepo)** vs. a standalone `packages/physics` folder.
- Package `package.json` + build that emits **ESM + CJS + `.d.ts`** (e.g. `tsup` or `tsc`).
- Finalize/lock the public API (already in `physics/index.ts`).
- README with runnable examples; semver; `npm publish` (or private registry).
- Optionally have the Tenix app **consume the package** (dogfooding) instead of the local copy.

**Decisions:**
- Scope: **physics-only** (`@tenix/physics`) vs. **`@tenix/core`** = physics + grid model
  (`grid.ts`, pure) + export helpers.
- Monorepo tooling; build tool; public vs. private registry.

**Acceptance:** `npm install @tenix/physics` in a fresh Node project; the smoke-test scenarios
(determinism, presets, bake) pass against the published package.

---

### E2 — `<tenix-board>` embeddable widget

**What:** a framework-agnostic Web Component:
`<tenix-board src="scene.json" autoplay loop preset="explode"></tenix-board>`.

**Work:**
- A Custom Element that creates a `<canvas>`, loads a **scene**, runs the physics/animation loop,
  and renders. The rendering is simple grid-cell drawing — liftable from `app/components/Canvas.tsx`.
- Bundle as a single drop-in `<script>` (npm + CDN).
- Attributes: `src`, `autoplay`, `loop`, `preset`, `width/height`, etc.

**Depends on:** E1 + the portable **scene format** (§4).

**Decisions:** which scene features to support (static pixels, physics presets, baked clips);
distribution (npm package + CDN build).

**Acceptance:** a plain HTML file with one `<script>` + `<tenix-board>` renders and animates a
scene with no build step.

---

### E3 — In-app scripting sandbox

**What:** let power users drive the board/physics with JS from inside Tenix.

**Work:**
- A **Web Worker** sandbox (isolation so user code can't touch DOM/network/storage).
- A stable scripting API: `board`, `layers`, `physics.addForce(...)`, `world.pixelize(...)`,
  pattern/draw helpers, etc.
- A small code-editor panel (textarea, or CodeMirror/Monaco — adds a dependency), run/stop,
  and error surfacing.
- Bridge: the worker computes grid/physics and posts frames back to the main thread to render.

**Depends on:** E1's API being stable.

**Risks/decisions:** Worker vs. constrained main-thread eval; exact API surface; editor choice;
capability scope (procedural patterns, driving physics, custom animations).

**Acceptance:** a user-typed script (e.g. "spawn gravity + a vortex, run 5s") executes safely and
renders on the active layer; a malicious script cannot reach DOM/network.

---

### E4 — Render / REST API + CLI

**What:** `POST /render { scene, format, fps, scale }` → returns a GIF/MP4. Same render function
wrapped as a CLI.

**Already ready:** headless **frame generation** (`bakeSimulation` runs in Node).

**The real gap — headless encoding:**
- `videoEncoder.ts` is browser-only (WebCodecs/MediaRecorder).
- `gifEncoder.ts`'s LZW core is pure JS, but the current pipeline scales frames via canvas
  `getImageData`.
- Need: a **pure scaler** (no canvas) + a Node encoder — either **ffmpeg** (GIF/MP4) or a
  pure-JS GIF library.

**Work:**
- A headless `renderScene(scene, opts) → frames` (reuses physics + a pure rasterizer/scaler).
- A Node GIF/MP4 encoder path.
- Transport: a **Next.js API route** (`app/api/render/route.ts`) or a standalone Node service.
- A CLI that calls the same render function.

**Decisions:** encoder approach (ffmpeg dep vs. pure-JS); hosting (API route vs. service);
auth/rate-limits if public; max scene size/duration.

**Acceptance:** `curl -X POST /render -d @scene.json` returns a valid GIF; the CLI produces the
same file from the same scene (deterministic).

---

## 4. Cross-cutting prerequisites

These are shared by E2 and E4 and should be built once:

1. **Portable scene format** — a versioned JSON describing a board (layers, pixels, palette,
   physics config, baked clips). Extend the existing `SerializedBoardState` / `SerializedLayerState`
   (in `app/types/index.ts`) into a standalone, documented schema with `serialize` / `deserialize`.
2. **Headless renderer** — `scene → frames` without a browser. Frame generation exists
   (`bakeSimulation`); the new work is **headless encoding** (§ E4) and a canvas-free scaler.

---

## 5. Dependency graph & recommended order

```
E1 (npm engine)  ──►  E2 (widget)
      │           └─►  E4 (render API / CLI)
      └─────────────►  E3 (sandbox)

shared:  Scene format ─► E2, E4
         Headless encoder ─► E4
```

**Start with E1** — it's the foundation and is ~80% done (extract + package the existing headless
module). Then E2/E4 (which need the scene format + headless renderer), then E3.

---

## 6. Files (anticipated)

**Reuse / extract from:**
- `app/lib/physics/*` → the package source (E1).
- `app/components/Canvas.tsx` → grid rendering for the widget (E2).
- `app/lib/{gifEncoder,videoEncoder,exporter}.ts` → reference for the headless encoder (E4).
- `app/types/index.ts` (`SerializedBoardState`) → basis for the scene format.
- `app/lib/grid.ts` → include in `@tenix/core` if chosen.

**Likely new:**
- `packages/physics/{package.json,tsup.config,README}` (E1).
- `packages/widget/` + `tenix-board` element (E2).
- `app/hooks/useScriptSandbox.ts` + `app/components/ScriptPanel.tsx` + a worker (E3).
- `app/api/render/route.ts` + `packages/render/` + CLI (E4).
- `app/lib/scene.ts` (or `packages/core/scene.ts`) — scene serialize/deserialize.

---

## 7. Scope & risk note

Phase E is **bigger and more structural** than A–D: it's a packaging/infra phase that reorganizes
the repo (workspaces) and adds a build/publish pipeline, rather than a feature inside the app.
Treat it as sub-phases (**E1 → E2/E4 → E3**). The two genuinely new technical problems are
**headless encoding** (E4) and **sandbox security** (E3); the rest is packaging and a shared scene
format.

---

## 8. Open decisions before starting E1

1. **Monorepo (npm/pnpm workspaces)** vs. a standalone `packages/physics` folder.
2. Package scope: **`@tenix/physics`** (physics only) vs. **`@tenix/core`** (physics + grid + export).
3. Does the Tenix app then **consume the package** (dogfooding) or keep its local copy?
