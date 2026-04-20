# Tenix — Strategic & Technical Analysis

> **Date:** April 18, 2026  
> **Scope:** Lottie replacement viability, product positioning, growth plan review, current bugs, architecture direction

---

## 1. Can Tenix Replace Lottie File Makers? Does It Need a Rewrite?

### The Honest Answer: **Heavy structural change — yes. Full rewrite — no.**

Your current architecture and a Lottie animation maker have fundamentally different data models:

| Dimension                     | Tenix Today                                                        | Lottie Animation Maker                                                         |
| ----------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| **Core abstraction**          | Pixel grid (`Uint8ClampedArray`) — each cell is an independent LED | Vector shapes on a canvas — bezier paths, groups, transforms                   |
| **Animation model**           | Procedural tick functions that mutate a grid buffer each frame     | Keyframe interpolation — define state at time T₁ and T₂, engine tweens between |
| **Output format**             | `.tenix-rec` (frame dumps), GIF, WebM                              | `.json` (Lottie spec) — a declarative animation description                    |
| **Coordinate system**         | Discrete integer grid (col, row)                                   | Continuous floating-point (x, y) with transforms                               |
| **What the user manipulates** | Individual pixels/cells                                            | Shapes, layers, properties (position, scale, rotation, opacity, color)         |

#### What's Missing for Lottie Replacement

To compete with Lottie makers (LottieFiles creator, Haiku Animator, Spirit, Flow), Tenix would need:

1. **Keyframe interpolation engine** — You have none. Your animations are procedural (code-driven), not data-driven (user-drawn keyframes). This is the **single biggest gap**.
2. **Property animation system** — Lottie animates properties (x, y, scale, rotation, opacity, color) over time with easing curves. Your system animates *entire grid buffers* per tick.
3. **Lottie JSON export** — The Lottie spec is a [well-defined JSON schema](https://lottiefiles.github.io/lottie-docs/). You'd need to translate your grid-based creations into Lottie's vector shape model. This is non-trivial because Lottie thinks in vectors, not pixels.
4. **Vector shape primitives** — Lottie works with bezier paths, rectangles, ellipses, stars, etc. Your system only has pixels and bitmap fonts.
5. **Timeline with property curves** — Not just "clip A plays from 0-3s" (which your TimelineManager does), but "property X goes from value A to value B over 0-3s with ease-in-out."

#### Should You Rewrite From Scratch?

**No. Here's why:**

Your core engine (grid rendering, effects, GLSL shaders, layer compositing, session recording) is **genuinely strong engineering** that took significant effort. Throwing it away would cost you months of rebuilt work.

Instead, the right move is to **add a parallel animation engine on top of the existing architecture:**

```
┌──────────────────────────────────────────────────┐
│                  Tenix Platform                   │
├──────────────────────┬───────────────────────────┤
│  Pixel/Grid Engine   │  Animation/Keyframe Engine │
│  (existing)          │  (NEW — builds on layers)  │
│                      │                            │
│  • Grid buffer       │  • Property keyframes      │
│  • Procedural anims  │  • Easing/interpolation    │
│  • Effects/GLSL      │  • Timeline with curves    │
│  • Patterns          │  • Lottie JSON export      │
├──────────────────────┴───────────────────────────┤
│              Shared Infrastructure                │
│  LayerManager, Canvas renderer, Export pipeline,  │
│  Session recording, Palette system                │
└──────────────────────────────────────────────────┘
```

The key insight: **you don't need to replace your pixel engine to support Lottie-style animations.** You need to add a keyframe-based property animation system *alongside* it. Both can coexist — pixel art animations AND motion-graphics-style keyframe animations, exported to different formats.

> [!IMPORTANT]
> **Verdict:** ~60% of your codebase is reusable as-is (rendering, layers, effects, export pipeline, UI scaffolding). The remaining ~40% is new work: keyframe engine, property animation, easing curves, Lottie export, and timeline property editors. This is **not** a rewrite — it's a major feature addition on a stable foundation.

#### Structural Changes Required (Not a Rewrite)

| Component                | Change Required                                                        | Severity |
| ------------------------ | ---------------------------------------------------------------------- | -------- |
| `LayerManager`           | Add per-layer animated properties (position, opacity, scale, rotation) | Medium   |
| `TimelineManager`        | Extend from clip-based to property-curve-based keyframing              | High     |
| `animations.ts`          | Add keyframe interpolation alongside procedural animations             | High     |
| `Canvas.tsx`             | Support transform rendering (translate, scale, rotate per layer)       | Medium   |
| NEW: `keyframeEngine.ts` | Property animation with easing curves                                  | New file |
| NEW: `lottieExporter.ts` | Convert animated layers → Lottie JSON                                  | New file |
| NEW: `easings.ts`        | Easing function library                                                | New file |
| `LEDBoard.tsx`           | Wire keyframe engine into the render loop                              | Medium   |

---

## 2. Product Positioning: Creativity Tool vs Animation Maker vs Both?

### The Answer: **Both — but with a clear primary identity.**

Here's the strategic breakdown:

#### Option A: Pure Creativity Tool (Current)
- **Market:** Casual creators, pixel art hobbyists, streamers
- **Competitors:** Piskel (weak), Aseprite ($20 desktop), p5.js (code-only)
- **Ceiling:** Niche. Fun but not "useful" enough for professional workflows
- **Monetization:** Hard — creativity tools are expected to be free

#### Option B: Animation Maker (Lottie Replacement)
- **Market:** UI/UX designers, motion designers, app developers
- **Competitors:** LottieFiles Creator, Haiku Animator, Rive, After Effects (export via Bodymovin)
- **Ceiling:** Very high — Lottie is used in millions of apps
- **Monetization:** Strong — professional tools command subscription pricing
- **Risk:** Competing head-on with Rive (very well-funded, robust product)

#### Option C: Both (Recommended) — "Pixel Animation Engine"
- **Primary identity:** An animation engine that makes pixel/particle animations easy
- **Secondary identity:** A creative playground for visual experimentation
- **Unique angle:** No other Lottie maker focuses on pixel-grid aesthetics

Here's why **both** works and isn't a dilution:

```
                    ┌──────────────────────────────────┐
                    │   "Pixel Animation Engine"        │
                    │                                    │
     Creative Mode  │   ←  shared core  →   │  Pro Mode  │
     ─────────────  │                       │  ─────────  │
     • Draw pixels  │   LayerManager        │  • Keyframe │
     • Apply effects│   Canvas renderer     │  • Timeline │
     • Patterns     │   Export pipeline     │  • Easing   │
     • Vibe mode    │   Palette system      │  • Lottie   │
     • Gestures     │   Recording           │  • Templates│
                    │                                    │
                    └──────────────────────────────────┘
```

**Your unique value proposition becomes:**  
> *"The easiest way to create pixel-perfect animations — from playful LED effects to production-ready Lottie files. Define start and end, pick a template, export in seconds."*

This is genuinely differentiated. Rive, LottieFiles Creator, and Haiku all target vector motion graphics. **None of them** target pixel/particle/LED-style animations with built-in procedural effects. You own that intersection.

> [!TIP]
> **Positioning recommendation:** Lead with "Pixel Animation Engine" as identity. The creative playground draws users in (low barrier, fun, viral potential). The professional animation features (Lottie export, keyframing, templates) are what makes them *stay and pay*.

---

## 3. Growth Plan Analysis

Your growth plan ([growth_plan.md](file:///Users/appointy/work/led-board/growth_plan.md)) is thorough and well-structured. Here's my honest critique:

### What's Strong

1. **Technology decisions are correct** — staying custom for 2D, using Three.js only for 3D, the tiered fallback strategy (WebGPU > WebGL > CPU) — all solid calls.
2. **Phase ordering makes sense** — export pipeline first (unblocks all audiences), then layers, then timeline. Dependencies are mapped correctly.
3. **Competitive analysis is accurate** — the gap between Piskel (too simple) and Aseprite (desktop, paid) is real and underserved.
4. **Technical debt acknowledgment** — calling out the LEDBoard.tsx monolith problem is important. You've partially addressed this with custom hooks.

### What's Weak or Missing

| Issue                                               | Detail                                                                                                                                                                                                                                                        |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **No Lottie/animation-engine vision**               | The growth plan doesn't mention Lottie export or keyframe interpolation — the very features you now want to prioritize. The plan was written for "content creator + developer + animator" audiences but the animation engine angle isn't there.               |
| **Phase ordering needs revision**                   | If Lottie replacement is the goal, the keyframe engine should come *before* the plugin system and template gallery, not after. Templates are less valuable without a keyframe workflow to customize them.                                                     |
| **Export pipeline assumed working**                 | The plan treats Phase 2 (export) as complete, but as you noted, exports are broken. This needs immediate fixing before anything else.                                                                                                                         |
| **Recording model is wrong for your vision**        | The plan doubles down on frame-by-frame recording (delta compression, frame reconstruction). But your stated goal is config-based recording (record actions, not pixels). These are fundamentally different approaches — the plan doesn't address this pivot. |
| **No mention of "start/end point + template fill"** | Your stated goal of "define start and end point, use templates to fill in between" is essentially tweening/interpolation — the core of any animation engine. The growth plan has no architecture for this.                                                    |
| **LEDBoard.tsx is now 1,683 lines**                 | The plan called for decomposition to ~300 lines. You extracted hooks (good), but LEDBoard.tsx actually *grew* from 1,546 to 1,683 lines as features were added. The hooks exist but LEDBoard still orchestrates too much.                                     |
| **Monetization section is vague**                   | Six business models listed but no commitment to one. This matters because it shapes which features to prioritize. If freemium with pro export is the model, Lottie export + HD video become gated features.                                                   |

### Revised Phase Priority (for Animation Engine Vision)

```
Phase 0: Fix broken exports + clear button (immediate)
Phase 1: Config-based recording (replaces frame-based approach)
Phase 2: Independent layer animations (each layer has own animation state)
Phase 3: Keyframe interpolation engine (start point → end point → easing)  
Phase 4: Property timeline with curves (visual keyframe editing)
Phase 5: "Template fill" system (built-in transitions between keyframes)
Phase 6: Lottie JSON export
Phase 7: Plugin system + community templates
```

---

## 4. Color Palette Section — Show Names Only

Your request is clear and reasonable:

**Current state:** The palette section likely shows color swatches + names, duplicating what the color picker already shows.

**What you want:**
- Remove color swatch previews from the palette selector section
- Show only brand color set names (e.g., "Neon", "Sunset", "Ocean")
- Allow users to create their own brand color sets

This is a straightforward UI change in [PaletteSelector.tsx](file:///Users/appointy/work/led-board/app/components/PaletteSelector.tsx) and [palette.ts](file:///Users/appointy/work/led-board/app/lib/palette.ts). The palette data model already supports custom palettes (`isBuiltIn: boolean` flag exists). You'd need:
- A "Create New Set" button in the UI
- A name input
- The ability to add/remove colors from a custom set
- Persist custom sets to localStorage

---

## 5. Independent Layers — Each With Own Animations/Effects

This is a **significant architectural requirement** that your current system does NOT support.

### Current State

```
LayerManager                          AnimationManager (SINGLE)
├── Layer 0 (grid data only)         └── plays ONE animation on
├── Layer 1 (grid data only)             the composited output
└── Layer 2 (grid data only)
         ↓ composite()
   Single Uint8ClampedArray
         ↓
   AnimationManager.tick() mutates this
         ↓
   EffectsEngine overlays on top (SINGLE)
         ↓
   Canvas renders
```

**Problem:** There is ONE `AnimationManager` and ONE `EffectsEngine` shared across all layers. Animations run on the composited output, not on individual layers. Layers are just passive data buffers — they have no behavior.

### What You Need

```
LayerManager
├── Layer 0
│   ├── grid data
│   ├── OWN AnimationManager    ← new
│   ├── OWN EffectsEngine       ← new
│   └── OWN animation state     ← new
├── Layer 1
│   ├── grid data
│   ├── OWN AnimationManager
│   ├── OWN EffectsEngine
│   └── OWN animation state
└── Layer 2
    ├── grid data
    ├── OWN AnimationManager
    ├── OWN EffectsEngine
    └── OWN animation state
         ↓ each layer ticks independently
         ↓ composite() merges all layers
         ↓ Canvas renders composite
```

### Impact Assessment

| File                                                                                           | Change Required                                                                                                                    |
| ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| [layerManager.ts](file:///Users/appointy/work/led-board/app/lib/layerManager.ts)               | `Layer` interface must include animation state, effects state. `composite()` must tick each layer's animation before compositing.  |
| [LEDBoard.tsx](file:///Users/appointy/work/led-board/app/components/LEDBoard.tsx)              | Move from single `animRef`/`effectsRef` globals to per-layer animation/effects. The orchestration logic must change significantly. |
| [useAnimationEngine.ts](file:///Users/appointy/work/led-board/app/hooks/useAnimationEngine.ts) | Must support multiple instances or become per-layer.                                                                               |
| [useEffectsEngine.ts](file:///Users/appointy/work/led-board/app/hooks/useEffectsEngine.ts)     | Same — must support per-layer instances.                                                                                           |
| [LayerPanel.tsx](file:///Users/appointy/work/led-board/app/components/LayerPanel.tsx)          | Needs per-layer animation/effect controls.                                                                                         |
| [ControlPanel.tsx](file:///Users/appointy/work/led-board/app/components/ControlPanel.tsx)      | Animation/effect panels need to operate on the active layer, not globally.                                                         |

> [!WARNING]
> **This is the most impactful architectural change in the entire roadmap.** It touches nearly every system. But it's also foundational — without per-layer independence, you cannot build a proper animation engine. This should be prioritized highly.

---

## 6. Export Functions Not Working — Diagnosis

Looking at the export code in [exporter.ts](file:///Users/appointy/work/led-board/app/lib/exporter.ts), [gifEncoder.ts](file:///Users/appointy/work/led-board/app/lib/gifEncoder.ts), and [videoEncoder.ts](file:///Users/appointy/work/led-board/app/lib/videoEncoder.ts), here are the likely failure points:

### Probable Issues

1. **`reconstructFrames()` may return empty** — The function calls `recorder.exportToFile()`, creates a *new* `SessionRecorder`, imports the file, then tries to parse the binary blob manually. This round-trip serialization/deserialization is fragile. If the recorder has no frames (e.g., user never recorded), or if the blob parsing has an offset error, you get zero frames and the export throws `"No frames to export"`.

2. **GIF encoder is custom (~14KB)** — You wrote your own LZW + color quantization. Custom GIF encoders are notoriously tricky (GIF spec has many edge cases). If the quantization or LZW produces malformed output, the download will appear to work but the file won't open.

3. **Video encoder depends on `WebCodecs` or `MediaRecorder`** — The [videoEncoder.ts](file:///Users/appointy/work/led-board/app/lib/videoEncoder.ts) has a tiered strategy. If WebCodecs isn't available and MediaRecorder fallback has issues (e.g., codec not supported), the export silently fails.

4. **PNG/SVG single-frame exports should work** — These are simpler (`canvas.toBlob()` for PNG, string concatenation for SVG). If these are also failing, the issue is likely in how the grid data is being passed to the export functions (possibly `null` or wrong dimensions).

### What to Fix

The export pipeline needs debugging with actual error logging. The `ExportPanel.tsx` likely swallows errors. Each export path needs a `try/catch` that surfaces the actual error to the user.

---

## 7. Config-Based Recording (Not Frame Dumps)

This is a **fundamentally different recording philosophy** from what's currently implemented.

### Current Approach: Frame Recording
```
Record: snapshot entire grid buffer → store as frame → repeat at 30fps
Result: large binary blob (even with delta compression)
Replay: restore each frame buffer sequentially
File size: ~5-50MB for a 30-second recording
```

### Your Desired Approach: Action Recording
```
Record: log each user action as a command
  → { type: "draw", col: 5, row: 10, color: [255,0,0], t: 150 }
  → { type: "selectAnimation", name: "pulse", t: 500 }
  → { type: "applyPattern", name: "rainbow", t: 800 }
  → { type: "setEffect", preset: "ripple", t: 1200 }
Replay: re-execute each command programmatically
File size: ~5-50KB for a 30-second recording (1000× smaller!)
```

### Architecture for Config-Based Recording

```typescript
// New recording format
interface ActionRecord {
  version: 3;
  cols: number;
  rows: number;
  cellSize: number;
  initialState: string; // base64 of initial grid (one snapshot)
  actions: Action[];
}

type Action =
  | { t: number; type: "draw"; col: number; row: number; color: RGB }
  | { t: number; type: "erase"; col: number; row: number }
  | { t: number; type: "fill"; col: number; row: number; color: RGB }
  | { t: number; type: "pattern"; name: string; params: Record<string, unknown> }
  | { t: number; type: "animation"; name: string; action: "play" | "pause" | "stop" }
  | { t: number; type: "effect"; preset: string; col: number; row: number; color: RGB }
  | { t: number; type: "clear" }
  | { t: number; type: "text"; text: string; color: RGB; scale: number }
  | { t: number; type: "layer"; action: "add" | "delete" | "select"; layerId: string }
  // ... etc
```

### Tradeoffs

|                     | Frame Recording (Current) | Action Recording (Your Goal)                                 |
| ------------------- | ------------------------- | ------------------------------------------------------------ |
| **File size**       | Large (MBs)               | Tiny (KBs)                                                   |
| **Replay fidelity** | Perfect — pixel-exact     | Depends on deterministic replay                              |
| **Replay speed**    | Instant seek to any frame | Must replay from start (or nearest checkpoint)               |
| **Portability**     | Works across versions     | Breaks if animation/effect behavior changes between versions |
| **Implementation**  | Simple (dump buffer)      | Complex (must instrument every user action)                  |

> [!IMPORTANT]
> **Key risk with action recording:** Every user action must be deterministic. If `Math.random()` is used anywhere in animations, effects, or patterns, the replay will diverge. You'd need to seed all RNG with a recorded seed value. Your effects engine uses `Math.random()` in several effects (sparkle, raindrop, etc.), so this requires careful work.

### Recommendation
Keep frame recording as a **fallback/export** mechanism. Add action recording as the **primary** recording mode for `.tenix-rec` files. This gives you tiny files for sharing while maintaining the ability to export to video (which needs actual frames).

---

## 8. Clear Button Not Clearing Everything

Based on the code in [LEDBoard.tsx](file:///Users/appointy/work/led-board/app/components/LEDBoard.tsx), the clear handler likely only calls `grid.clear()` on the active layer. It probably doesn't:

- Stop running animations (`animRef.current.stop()`)
- Clear the snapshot buffer (`snapshotRef.current = null`)
- Stop/clear effects (`effectsRef.current.clearEffects()`)
- Clear content layer tracking (`contentLayersRef.current = []`)
- Stop session recording playback if active
- Clear the marquee buffer (`setMarqueeBuffer(null)`)
- Clear ALL layers (only clears active layer)
- Reset the undo stack

A proper "clear everything" function needs to touch all of these systems. This is a direct consequence of the monolith architecture — state is scattered across many refs.

---

## 9. Vision: Pixel/Particle Animation Engine

Taking all your stated goals together, here's what Tenix should evolve into:

```
┌────────────────────────────────────────────────────────────────┐
│                    TENIX ANIMATION ENGINE                       │
│                                                                 │
│  "The pixel animation platform — from creative playground       │
│   to production-ready Lottie files"                             │
│                                                                 │
├─────────────────────┬──────────────────┬───────────────────────┤
│   Creative Mode     │  Animation Mode  │  Engine/API Mode      │
│                     │                  │                        │
│  • Freehand draw    │  • Keyframes     │  • @tenix/core NPM    │
│  • Patterns         │  • Easing curves │  • Scripting sandbox   │
│  • Procedural FX    │  • Property anim │  • REST/WS API         │
│  • Gesture control  │  • Timeline      │  • Embeddable widget   │
│  • Vibe mode        │  • Onion skin    │  • CLI renderer        │
│                     │  • Templates     │                        │
│                     │  • "Fill between"│                        │
├─────────────────────┴──────────────────┴───────────────────────┤
│                     Export Pipeline                              │
│  GIF / WebM / MP4 / PNG / SVG / Lottie JSON / Sprite Sheet     │
├────────────────────────────────────────────────────────────────┤
│                     Core Engine                                  │
│  LayerManager (per-layer anims)  •  Grid/Pixel Engine           │
│  Effects/GLSL Pipeline           •  Config-based Recording      │
│  Palette System                  •  Delta Codec                 │
└────────────────────────────────────────────────────────────────┘
```

### The "Define Start & End, Fill With Template" Vision

This is essentially a tweening system with preset interpolation strategies:

```
User defines:
  Frame 0 (start state):  Text "HELLO" at position (0, 10), color red
  Frame 60 (end state):   Text "HELLO" at position (50, 10), color blue

User picks template:  "Bounce In"

Engine generates:
  Frames 1-59 automatically, using bounce easing to interpolate
  position from (0,10) → (50,10) and color from red → blue
```

This is achievable and is exactly what Lottie does internally. The implementation requires:
1. A keyframe data model (what properties, at what times, with what values)
2. An interpolation engine (linear, ease-in, ease-out, cubic-bezier, spring, bounce)
3. A template library (pre-configured keyframe sequences for common transitions)

**This is very buildable on your current architecture.** Each layer already has a data buffer. You just need to add animated properties to layers and an interpolation engine to drive them.

---

## Summary of Recommendations

| Question                   | Recommendation                                                                                                                                |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **Rewrite from scratch?**  | **No.** ~60% of codebase is reusable. Add keyframe engine alongside existing pixel engine.                                                    |
| **Product positioning?**   | **Both** — "Pixel Animation Engine." Creative playground draws users in, animation tools make them stay.                                      |
| **Growth plan valid?**     | Partially — technology decisions are solid, but the phase ordering needs revision to prioritize animation engine features over plugin system. |
| **Color palette**          | Show only palette names. Add "Create Custom Set" button. Small UI change.                                                                     |
| **Independent layers**     | Major architectural change needed. Each layer needs its own animation + effects state. This is foundational — do it before keyframes.         |
| **Broken exports**         | Debug with error logging. Likely issues in frame reconstruction, custom GIF encoder, or WebCodecs availability.                               |
| **Config-based recording** | Correct direction for file size. Requires deterministic replay (seed RNG). Keep frame recording as fallback for video export.                 |
| **Clear button**           | Needs to reset ALL state: animations, effects, snapshots, content layers, marquee, undo stack, all layers.                                    |
| **Lottie replacement**     | Achievable as a progressive enhancement. Core requirement: keyframe interpolation + property animation + Lottie JSON export.                  |

> [!IMPORTANT]
> **The single most impactful next step:** Fix the broken exports (immediate trust issue), then implement independent per-layer animations. Everything else — keyframes, Lottie export, config recording, templates — builds on top of layers having their own independent animation state.
