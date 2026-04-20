# Tenix — Growth Plan & Future Scope

> **Date:** April 2026  
> **Project:** Tenix — Browser-based programmable LED matrix simulator  
> **Codebase:** ~8,300 lines of TypeScript across 23 files  

---

## 1. Current Project Audit

### What You've Built

Tenix is a surprisingly deep technical project. Here's what's already working:

| Feature | Implementation | Maturity |
|---|---|---|
| **Grid Engine** | `Uint8ClampedArray` flat buffer (RGB), `GridManager` class | ✅ Solid |
| **Canvas Renderer** | ImageData fast-path, offscreen buffers, nearest-neighbor upscale | ✅ Production-grade |
| **Drawing Tools** | Draw, Erase, Flood-fill, Vibe mode | ✅ Complete |
| **Patterns** | 13 procedural generators (checkerboard, plasma, spiral, gradient, etc.) | ✅ Rich |
| **Animations** | 16 content-aware animations (pulse, scroll, glow, matrix reveal, etc.) | ✅ Rich |
| **Effects Engine** | 13 GPU-accelerated presets (ripple, laser, firework, butterfly, etc.) | ✅ Impressive |
| **GLSL GPU Path** | Full WebGL fragment shader with CPU fallback | ✅ Advanced |
| **Pixel Font** | Custom 5×7 bitmap font with multi-scale + marquee | ✅ Complete |
| **Session Recording** | Frame-by-frame capture/playback with `.tenix-rec` export/import | ✅ Complete |
| **Gesture Control** | MediaPipe hand tracking — pinch to draw, swipe to clear, scroll panels | ✅ Working |
| **Persistence** | localStorage autosave/restore for grid, settings, animations | ✅ Complete |
| **Responsive** | ResizeObserver, fullscreen, cursor auto-hide, touch support | ✅ Complete |

### Architecture Strengths

1. **Zero dependencies for core logic** — Grid, patterns, animations, effects are all pure TypeScript with no library overhead
2. **GPU acceleration with graceful fallback** — The GLSL shader path (`effects-gl.ts`) is a properly engineered WebGL renderer with CPU fallback
3. **Performance-first data model** — `Uint8ClampedArray` flat buffers, offscreen canvas compositing, cached grid lines, pre-computed lookup tables
4. **Clean separation of concerns** — Rendering (`Canvas.tsx`) is separate from state (`LEDBoard.tsx`), which is separate from computation (`lib/`)
5. **Content-aware design** — Animations operate on user content (snapshots), not just procedural generation

### Architecture Weaknesses

1. **Monolith orchestrator** — `LEDBoard.tsx` at 1,546 lines does too much. State management, gesture coordination, recording lifecycle, animation control, and content layer tracking all in one component
2. **No export to video/GIF** — Session recording exports only `.tenix-rec` (JSON), not shareable media formats
3. **No collaborative/sharing features** — Everything is local-only
4. **No plugin/scripting system** — Patterns and effects are hardcoded, no way for users to add custom ones
5. **No timeline** — Animations are single-selection, no sequencing or keyframing

---

## 2. Should You Switch to Three.js? — Critical Analysis

### The Short Answer for 2D: **No.** The Short Answer for 3D: **Use Three.js as an optional view mode.**

### 2D Grid Rendering — Stay from Scratch

| Dimension | Building from Scratch (Current) | Switching to Three.js |
|---|---|---|
| **Performance** | ✅ You control every byte. Your `Uint8ClampedArray` → `ImageData` → scaled `drawImage` pipeline is optimal for a discrete grid. Your GLSL renderer does exactly what's needed. | ❌ Three.js adds ~600KB+ of scene graph, camera, material, geometry abstractions you don't need. Its particle systems are designed for continuous 3D space, not discrete 2D grids. |
| **Aesthetic Control** | ✅ You can implement any LED visual effect precisely — rounded cells, bloom, reflection, bevel — using targeted shader code. | ⚠️ You'd use Three.js as a thin shell around `ShaderMaterial`, using ~2% of the library. The abstraction fights you more than it helps for pixel-grid rendering. |
| **Learning / Portfolio** | ✅ Building a GLSL renderer, WebGL pipeline, and GPU effects from scratch is significantly more impressive on a resume/portfolio than wrapping Three.js. | ⚠️ "Used Three.js" is common. "Built a custom WebGL effects pipeline with GLSL shaders" is not. |
| **Future 3D Features** | ⚠️ If you ever want true 3D (rotating LED cube, perspective view, 3D particle effects), you'd need to build a lot yourself. | ✅ Three.js excels here. Camera controls, lighting, mesh rendering come free. |
| **Bundle Size** | ✅ Your entire app is ~8K lines. | ❌ Three.js alone is ~150K lines (600KB+ minified). |
| **Mobile Performance** | ✅ Minimal JS overhead, lean GPU usage. | ⚠️ Three.js scene graph management adds CPU overhead on every frame, even for 2D. |

### 3D Visualization — Build Custom or Use Three.js?

You've confirmed you **do** want 3D visualization (rotating LED cube, perspective view, etc.). Here's the honest breakdown:

**❌ Build 3D from Scratch — Don't do this.**

Building your own 3D engine would mean implementing:
- A 4×4 matrix math library (model, view, projection transforms)
- Camera orbit controls with mouse/touch
- Depth buffering (z-fighting between cells)
- Lighting models (ambient, diffuse, specular per-cell)
- Face culling on the cube
- Anti-aliased edges

This is months of work replicating what Three.js gives you in one `import`. The ongoing maintenance burden is massive — WebGL gotchas, browser differences, precision issues. It's not worth it.

**✅ Use Three.js specifically and only for 3D visualization — the right call.**

The correct architecture is a **dual-renderer strategy**:

```
┌─────────────────────────────────────────────────────┐
│                     Tenix Core                      │
│   GridManager (Uint8ClampedArray) — source of truth │
└────────────┬───────────────────────┬────────────────┘
             │                       │
    2D Mode (default)          3D Mode (optional)
    Canvas 2D + WebGL          Three.js scene
    (your existing engine)     (new renderer only)
             │                       │
    Fast, lightweight          Adds ~600KB gzipped
    Works on all devices       Requires WebGL2
```

- **The `GridManager` data never changes** — it's the single source of truth for both renderers
- **2D mode stays exactly as-is** — no disruption to existing features
- **3D mode is a separate renderer** that reads from `GridManager` and renders each cell as a lit 3D voxel (cube/box mesh), or as a flat LED panel at a tilted angle
- Users toggle between 2D and 3D with a button — think of it like different "view modes"

**What Three.js gives you for free in 3D mode:**
- `OrbitControls` — drag to rotate, scroll to zoom, no code needed
- `InstancedMesh` — render 20,000+ cells as a single GPU draw call (critical for performance)
- `MeshStandardMaterial` — physically-based lighting on each LED cell (glass, metal, emissive glow)
- `PointLight` — dynamic colored lighting from active cells
- `WebXR` — VR/AR mode with zero extra work

**Practical 3D implementation plan:**
- Each cell → one `InstancedMesh` instance (a flat quad or small box)
- Cell color → instance color attribute, updated each frame from `GridManager.data`
- Emissive material + bloom post-processing → makes active cells glow like real LEDs
- Camera: orthographic by default (less distortion for the grid), perspective on toggle

> [!IMPORTANT]
> **Final verdict:** Keep your custom 2D engine as-is — it's optimal. Add Three.js as a dedicated 3D view-mode renderer that reads from the same `GridManager`. You get the best of both worlds: lean 2D for drawing/animation, immersive 3D for presentation/showcase.

### What to Adopt for Each Problem

| Technology | Use Case in Tenix | Priority |
|---|---|---|
| **Three.js** | 3D LED cube/panel visualization, orbit camera, bloom effects, WebXR | Medium — Tier 2 feature |
| **WebGPU** | When effects get more complex (100+ concurrent effects, compute shaders) | Low — future proofing |
| **OffscreenCanvas + Web Worker** | Move effects loop off main thread to eliminate jank | High — do this now |
| **WASM** | CPU-bound grid operations: flood fill on huge grids, compression, pathfinding for smart effects | Medium — targeted use |
| **WebCodecs** | Native video export (MP4/WebM) without FFmpeg | High — needed for export pipeline |

---

## 3. Deep-Dive Q&A: Technology Decisions

*Detailed answers to specific technology questions for Tenix's evolution.*

---

### Q1: 3D Visualization — Build Custom or Use Three.js?

**Already answered in full in Section 2 above.** Short version:

- **2D rendering** → stay custom (optimal as-is)
- **3D visualization** → use Three.js as a dedicated optional view mode
- **Architecture** → dual-renderer pattern where `GridManager` is the shared data source
- **Three.js brings**: `InstancedMesh` (20K cells in 1 draw call), `OrbitControls`, PBR materials, WebXR — all for free

---

### Q2: If We Move to WebGPU, Will It Work on All Devices?

**Short answer: No — WebGPU does NOT work on all devices yet. Treat it as a progressive enhancement.**

#### Current WebGPU Device Coverage (April 2026)

| Platform | Status | Notes |
|---|---|---|
| **Chrome 113+ (Desktop)** | ✅ Supported | Windows, macOS, Linux — enabled by default |
| **Edge 113+ (Desktop)** | ✅ Supported | Same as Chrome (Chromium-based) |
| **Firefox (Desktop)** | ⚠️ Partial | Behind a flag (`dom.webgpu.enabled`). Not enabled by default as of early 2026. |
| **Safari 18+ (macOS)** | ✅ Supported | Apple added WebGPU in Safari 18 (macOS Sequoia). |
| **Chrome (Android)** | ⚠️ Limited | Supported on high-end Android devices. Mid/low-end phones may lack driver support. |
| **iOS Safari** | ⚠️ Partial | Available in Safari 18 on iOS 18+. Older iPhones (pre-A15) have incomplete support. |
| **Overall global coverage** | **~65-70% of users** | Significantly less than WebGL's ~97% |

> [!WARNING]
> **WebGPU is NOT a drop-in replacement for WebGL today.** Approximately 30-35% of global users cannot run WebGPU. This includes users on Firefox (without a flag), older Android devices, older iOS versions, and some enterprise Windows machines with outdated GPU drivers.

#### What WebGPU Gives You That WebGL Doesn't

| Capability | WebGL (current) | WebGPU |
|---|---|---|
| **Compute shaders** | ❌ Not available | ✅ Full compute pipeline — run arbitrary parallel GPU programs (physics, pathfinding, image processing) |
| **Multi-threading** | ❌ Main thread only | ✅ Can use from Web Workers |
| **Lower CPU overhead** | ❌ High driver overhead per draw call | ✅ Explicit GPU commands batched in command encoders |
| **Storage buffers** | ❌ Only textures/uniforms | ✅ Large read/write buffers on GPU — no `readPixels()` bottleneck |
| **Pipeline caching** | ❌ Shader recompile every context | ✅ Compiled GPU pipelines cached |

#### How to Adopt WebGPU Safely in Tenix

The pattern mirrors what you already do with WebGL:

```typescript
// Already in effects.ts — the right pattern to extend:
const glRenderer = GLEffectsRenderer.create(); // returns null if WebGL fails

// Add alongside it:
const gpuRenderer = await GPUEffectsRenderer.create(); // returns null if WebGPU unavailable

// Priority: WebGPU > WebGL > CPU
const renderer = gpuRenderer ?? glRenderer ?? cpuFallback;
```

**The immediate WebGPU win for Tenix:** Replace `gl.readPixels()` (the current bottleneck in `effects-gl.ts`) with a WebGPU storage buffer that writes directly to a `GPUBuffer` and maps it — no CPU-GPU roundtrip stall.

**Verdict:** Do NOT migrate to WebGPU now. Add it as a third enhancement tier (CPU → WebGL → WebGPU) when you need compute shaders for features like: particle physics simulation, real-time audio FFT on GPU, or A* pathfinding for smart effects across the grid.

---

### Q3: OffscreenCanvas + Web Worker — Benefits and Issues?

#### What It Does

`OffscreenCanvas` lets you detach a canvas from the DOM and hand it to a `Web Worker`. The worker then owns the canvas and can call all 2D/WebGL drawing APIs — without touching the main thread.

```
  Main Thread              Web Worker
  ──────────               ──────────
  React UI                 EffectsEngine._tick()
  Mouse events             GLEffectsRenderer
  Tool handling            AnimationManager.tick()
  Layout / CSS             Canvas drawing
       │                         │
       └── postMessage ──────────┘
       (grid data, tool events)
```

#### Benefits for Tenix

| Benefit | Impact |
|---|---|
| **Eliminates main thread jank** | Your effects loop + canvas redraw currently compete with React re-renders, mouse event handling, and layout. Moving to a worker means drawing never blocks the UI. |
| **60fps is now a real guarantee** | Even if the main thread is momentarily busy (garbage collection, React reconciliation), the worker continues rendering at full FPS. |
| **Zero-copy data transfer** | Your `Uint8ClampedArray` grid data is perfect for `postMessage` with transferable — the buffer transfers ownership to the worker with zero copying (O(1) instead of O(n)). |
| **Better multi-core usage** | Mobile/desktop CPUs have 4-8 cores. Currently you use 1. The worker uses a second core. |

#### Issues and Caveats

> [!WARNING]
> **OffscreenCanvas is not as simple to adopt as it sounds.**

| Issue | Severity | Detail |
|---|---|---|
| **Device coverage** | 🟡 Medium | ~92% coverage. iOS 15 and below (~8% of users) do not support `OffscreenCanvas`. You need a main-thread fallback. |
| **No DOM access in worker** | 🔴 High | Workers cannot access `document`, `window`, `localStorage`, or React state directly. All data must be passed via `postMessage`. This means you need to redesign the communication between `LEDBoard.tsx` ↔ worker carefully. |
| **React + OffscreenCanvas friction** | 🟡 Medium | React controls the canvas DOM element. To hand it to a worker, you call `canvas.transferControlToOffscreen()` — after which React can no longer read or write to that canvas. You lose the `ref` control model. |
| **Debugging is harder** | 🟡 Medium | Worker errors don't show in the same call stack as main thread code. You need explicit error messaging. Browser DevTools support has improved but is still less ergonomic than main-thread debugging. |
| **Serialization overhead** | 🟢 Low | Every frame, you post tool events (col, row, color) to the worker and get back render commands or the overlay buffer. JSON serialization is slow — use `SharedArrayBuffer` or transferable `ArrayBuffer` instead. |
| **SharedArrayBuffer security headers** | 🔴 High | `SharedArrayBuffer` (the most efficient approach) requires `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` HTTP headers. These are not set by default in Vercel/Next.js deployments and can break third-party scripts. |

#### Recommended Approach for Tenix

Don't move everything to a worker. Move **only the effects engine**:

```
Main Thread:  Canvas 2D drawing, React UI, grid state, mouse events
Worker:       EffectsEngine._tick() + GLEffectsRenderer (WebGL on OffscreenCanvas)
              → posts overlay Uint8ClampedArray back each frame
Main Thread:  Composites the overlay onto the main canvas (single drawImage call)
```

This gives you 80% of the benefit with 20% of the complexity. The animation tick (`AnimationManager`) can stay on the main thread since it's lightweight compared to the effects engine.

**Device support fallback:** Check `'OffscreenCanvas' in window` — if false, run the effects engine on the main thread as you do today. Your CPU/WebGL fallback pattern already exists.

---

### Q4: WASM — Are We Using It? What Are the Benefits?

#### Current Status: No, Tenix Does Not Use WASM

As of the current codebase (~8,300 lines of TypeScript), **everything runs as JavaScript** — including all grid operations, pattern generators, animation ticks, and even the CPU fallback for effects. The only non-JS execution path is the GLSL fragment shader in `effects-gl.ts`, which runs on the GPU (not WASM).

MediaPipe (used for gesture control) internally uses WASM under the hood — but that's bundled inside the `@mediapipe/hands` package, not something you control.

#### What is WASM?

WebAssembly (WASM) is a binary bytecode format that runs in the browser at near-native speed. You write code in Rust, C, C++, Go, or AssemblyScript, compile it to `.wasm`, and load it from JavaScript. The browser executes it in a sandbox at roughly **the same speed as native machine code**.

Critically: WASM is **not a replacement for JavaScript**. It's a tool for the specific cases where JS is too slow.

#### Where WASM Would Benefit Tenix

| Use Case | Why JS Falls Short | WASM Speedup |
|---|---|---|
| **Flood fill on huge grids** | At 1px cell size, the grid is ~1920×1080 = 2M cells. JS flood fill on 2M cells is slow and blocks the main thread. | 3-8× faster tight loops |
| **delta compression for recordings** | Comparing frame-by-frame pixel diffs to compress the `.tenix-rec` format is O(n) per frame — becomes slow at 30fps × 60s. | 3-5× faster bitwise ops |
| **GIF encoding** | GIF uses LZW compression + color quantization. Pure JS GIF encoders are noticeably slow for large/long recordings. | 5-10× faster for compression |
| **Pathfinding / smart effects** | A future "smart ripple that flows around obstacles" feature would need A\* or flood-fill-based pathfinding on the grid on every effect tick. | 3-5× |
| **Image import → pixel art conversion** | When importing a reference image and auto-converting to the grid's palette, `k-means color quantization` on 2M pixels is very CPU-heavy in JS. | 5-15× for numerical algorithms |

#### What WASM Does NOT Help With

- **Rendering** — WASM cannot call Canvas/WebGL APIs directly. It computes data; JS/WebGL renders it.
- **DOM manipulation** — WASM has no DOM access.
- **Async/IO** — Fetch, timers, events — all still JS.
- **Simple JS operations** — If it runs fast enough in JS already, WASM adds complexity for no gain.

#### How to Add WASM to Tenix (Recommended Approach)

Don't rewrite everything in Rust. **Target one bottleneck at a time:**

1. **Start with GIF encoding** — Use an existing WASM GIF encoder like `gif-encoder-wasm` or the Rust `image` crate compiled to WASM. This is a drop-in improvement; you call it from JS and get back a `Uint8Array` blob.
2. **Add WASM flood fill** — Write a single `flood_fill(grid_ptr, cols, rows, start_col, start_row, fill_r, fill_g, fill_b)` function in AssemblyScript (TypeScript-like syntax that compiles to WASM). Compile to `.wasm`, load it. This is ~50 lines of code.
3. **Never rewrite the whole engine in WASM** — The JS engine is fast enough for everything except the above edge cases.

> [!NOTE]
> **WASM works on 96%+ of global users** (all modern browsers since 2017). It has better device coverage than WebGPU and similar coverage to WebGL. There is no meaningful compatibility concern.

---

### Q5: What is WebCodecs? Will It Work on All Devices?

#### What is WebCodecs?

WebCodecs is a browser API that gives JavaScript **direct access to the browser's built-in video and audio encoders/decoders** — the same hardware-accelerated codecs that power YouTube, Netflix, and video calls in your browser.

Before WebCodecs, creating a video from canvas frames required:
1. Using `MediaRecorder` (low control, fixed quality, no seeking)
2. Or shipping a JavaScript port of FFmpeg (e.g., `ffmpeg.wasm` — adds 30MB+ to your bundle)

With WebCodecs, you can:
```javascript
// Encode a canvas frame to H.264/VP9/AV1 at precise quality settings
const encoder = new VideoEncoder({
  output: (chunk) => { /* collect encoded chunks */ },
  error: (e) => console.error(e),
});
encoder.configure({ codec: 'vp09.00.10.08', width: 1920, height: 1080, bitrate: 2_000_000 });

// For each animation frame:
const frame = new VideoFrame(canvas, { timestamp: frameTimestamp });
encoder.encode(frame);
frame.close();
```

The result: MP4/WebM video encoded at native browser speed (hardware accelerated on most devices), with precise control over codec, bitrate, resolution, and keyframes.

#### Device Coverage (April 2026)

| Platform | Status | Notes |
|---|---|---|
| **Chrome 94+ (Desktop)** | ✅ Supported | Windows, macOS, Linux — full hardware acceleration |
| **Edge 94+ (Desktop)** | ✅ Supported | Chromium-based |
| **Chrome (Android)** | ✅ Supported | Hardware-accelerated H.264/VP9 encoding |
| **Firefox (Desktop)** | ✅ Supported | Added in Firefox 130 (Sept 2024). Hardware acceleration varies by GPU. |
| **Safari (macOS/iOS)** | ⚠️ Partial | Decode supported; **encode** support added in Safari 18 but with limitations (H.264 only, no AV1). Older Safari versions have no encode support. |
| **iOS Safari (< 18)** | ❌ Not supported | Significant gap — iOS 16 and 17 users cannot use WebCodecs encoding. |
| **Overall global coverage** | **~78-82% of users** | The iOS Safari gap is the main limiter. |

> [!CAUTION]
> **WebCodecs encode does not work reliably on iOS Safari < 18.** This is a real problem since iOS Safari makes up ~15-20% of global mobile traffic. You cannot ship WebCodecs as your only export path.

#### How to Use WebCodecs in Tenix — Tiered Strategy

```
Tier 1 (works everywhere):     MediaRecorder → WebM  (low quality, limited control)
Tier 2 (~80% of users):        WebCodecs → MP4/WebM  (high quality, full control)
Tier 3 (fallback for iOS<18):  gif.js (pure JS GIF encoder)  (universal, always works)
```

```typescript
async function exportVideo(frames: Uint8ClampedArray[], fps: number) {
  if ('VideoEncoder' in window) {
    // WebCodecs path — high quality, hardware accelerated
    return exportWithWebCodecs(frames, fps);
  } else if ('MediaRecorder' in window) {
    // MediaRecorder fallback — replay and capture
    return exportWithMediaRecorder(frames, fps);
  } else {
    // Universal fallback — GIF
    return exportAsGif(frames, fps);
  }
}
```

#### WebCodecs vs ffmpeg.wasm

| | WebCodecs | ffmpeg.wasm |
|---|---|---|
| **Bundle size** | 0 bytes (built into browser) | 25-35MB |
| **Encoding speed** | Hardware-accelerated (fast) | Software-only (slow, can take minutes for long videos) |
| **Device support** | ~80% | ~97% (WASM works almost everywhere) |
| **Codec support** | H.264, VP8, VP9, AV1 (browser-dependent) | Every codec FFmpeg supports |
| **Control** | Full keyframe/bitrate/timestamp control | Full |
| **Complexity** | Medium | High (requires SharedArrayBuffer headers, large bundle) |

**Recommendation for Tenix:** Use WebCodecs as the primary video export path when available, fall back to `MediaRecorder` for the next tier, and GIF (via `gif.js` WASM or pure-JS) as a universal fallback. Do not ship `ffmpeg.wasm` — the bundle size is prohibitive for a browser-native creative tool.

---

## 4. Future Scope — Making Tenix Useful for Target Audiences

### 🎬 For Content Creators

Content creators need **output** — they want to create eye-catching visuals and share them easily.

#### Tier 1: Must-Have (High Impact, Achievable)

| Feature | What It Does | Why It Matters |
|---|---|---|
| **Export as GIF/MP4/WebM** | Record the canvas and export as shareable video files | Content creators can't use `.tenix-rec` on social media. This is table stakes. |
| **Export as PNG/SVG** | Single-frame exports at high resolution (with optional upscaling) | For thumbnails, social posts, blog headers. The pixel art aesthetic is in demand. |
| **Template Gallery** | Pre-made scenes: "Gaming Channel Intro", "Subscribe Animation", "Stream Alert", "Countdown Timer" | Lowers the barrier to entry. Creators can customize, not build from scratch. |
| **Custom Text Animations** | Type text → pick entrance animation (typewriter, glitch, bounce, wave, fade) | Every content creator needs animated text. Your pixel font + animation engine is perfect for this. |
| **Transparent Background Export** | Export with alpha channel (WebM with alpha, APNG) | Allows creators to overlay Tenix animations on their existing video content in editors. |

#### Tier 2: Power Features

| Feature | What It Does |
|---|---|
| **Timeline/Sequencer** | Stack multiple patterns + animations + text in a timeline with keyframes. E.g. "Pattern A plays for 3s → text types in → pulses for 2s → scrolls out" |
| **Audio Reactive Mode** | Microphone/audio input drives effects in real-time. Beat detection → ripple effects, volume → brightness, frequency bands → colors. Huge for music content. |
| **OBS Integration** | Browser source for OBS Studio — Tenix runs as a live overlay during streams with transparent background |
| **Preset Sharing (Community)** | Export/import preset packs (patterns + effects + color palettes as a `.tenix-pack` file) |
| **Brand Colors** | Define a color palette (brand colors) and all patterns/effects automatically use it |

#### Tier 3: Differentiation

| Feature | What It Does |
|---|---|
| **AI Prompt-to-Art** | "Create a sunset pixel art" → generates grid content using an AI model. The LED constraint makes every generation look stylized. |
| **Sprite Animation** | Import sprite sheets, define frame sequences, play as pixel animations on the grid |
| **Camera/Screen Capture → LED** | Feed a webcam or screen region into the grid as a pixelated live feed (low-res pixel cam effect) |

---

### 💻 For Software Developers

Developers need **tools, APIs, and integration** — they want to use Tenix in their own projects.

#### Tier 1: Must-Have

| Feature | What It Does | Why It Matters |
|---|---|---|
| **Scripting API / Sandbox** | JavaScript REPL / code editor built into Tenix where users write `grid.setCell(x, y, [r, g, b])`, `grid.animate(...)`, etc. | Turns Tenix into a creative coding playground like p5.js but constrained to the LED grid paradigm. |
| **Embeddable Widget** | `<tenix-board>` Web Component or React component with a simple API: `<TenixBoard pattern="rainbow" animation="pulse" text="HELLO" />` | Developers can embed LED-style displays in their own sites, dashboards, landing pages. |
| **NPM Package** | Publish the core engine (`grid.ts`, `patterns.ts`, `animations.ts`, `effects.ts`) as `@tenix/core` | Lets developers use the grid engine in their own projects without the UI |
| **REST/WebSocket API** | Remote control the board via API calls. POST `/api/text` with `{ text: "DEPLOY SUCCESS", color: "green" }` | CI/CD status boards, IoT dashboards, team notifications rendered on a Tenix board |

#### Tier 2: Power Features

| Feature | What It Does |
|---|---|
| **Plugin System** | Define plugins that add patterns, effects, tools, and panel sections via a plugin manifest. Hot-reload plugins from URL or local file. |
| **Data-Driven Visualization** | Feed JSON/CSV data and visualize as heatmaps, bar charts, sparklines on the LED grid. E.g. GitHub contribution graph, server metrics, stock tickers. |
| **Multiplayer / Collaborative** | WebRTC or WebSocket-based real-time collaboration — multiple people draw on the same board. Like r/place but with LED grid aesthetics. |
| **CLI Tool** | `npx tenix render --text "Hello" --pattern rainbow --animation scroll --out hello.gif` |
| **VS Code Extension** | Live LED board in VS Code sidebar showing build status, test results, or custom dev metrics |
| **Physical LED Board Bridge** | Serial/WebSerial API to drive real LED matrices (WS2812B, Adafruit NeoPixel) from the Tenix UI |

#### Tier 3: Differentiation

| Feature | What It Does |
|---|---|
| **WebAssembly Plugins** | Allow plugins written in Rust/C/Go compiled to WASM for maximum performance |
| **Shader Playground** | Write custom GLSL fragment shaders that render directly on the grid. Live preview + hot reload. |
| **Version Control for Creations** | Git-like branching of grid states — undo tree instead of linear undo stack |

---

### 🎨 For Animators

Animators need **frame-by-frame control, easing, and nuanced timing** — they think in keyframes and timelines.

#### Tier 1: Must-Have

| Feature | What It Does | Why It Matters |
|---|---|---|
| **Multi-Layer Canvas** | Independent layers with opacity, visibility toggle, blend modes (additive, multiply, screen) | Animators need to separate background, midground, character, effects layers |
| **Onion Skinning** | Show previous/next frames as semi-transparent overlays while drawing | The #1 feature request for any frame-by-frame animation tool |
| **Frame-by-Frame Editor** | Manual keyframe creation. Draw frame 1 → draw frame 2 → play sequence at adjustable FPS. Not just animations applied to static content. | This transforms Tenix from "animated display" to "pixel animation studio" |
| **Timeline with Keyframes** | Visual timeline bar showing frames, layers, with scrubbing, adding/deleting frames | Standard in all animation tools — Aseprite, Piskel, Animate CC |
| **Copy/Paste Frames** | Duplicate frames, copy frame ranges, insert blank frames | Essential for animation workflow efficiency |

#### Tier 2: Power Features

| Feature | What It Does |
|---|---|
| **Sprite Sheet Export** | Export animation frames as a sprite sheet (PNG with all frames in a grid) for use in games and web |
| **Easing Curves** | Tween between keyframes with easing (ease-in, ease-out, bounce, elastic) for smooth animations |
| **Selection & Transform** | Rectangle/lasso select regions → move, rotate, flip, scale (nearest-neighbor) |
| **Reference Image** | Load a reference image as a semi-transparent background to trace pixel art from |
| **Color Palette Management** | Named palettes (e.g. "Pico-8", "GameBoy", "NES"), auto-restrict to palette, palette swap animation |
| **Symmetry Mode** | Mirror drawing across X/Y/both axes — essential for character art and mandalas |

#### Tier 3: Differentiation

| Feature | What It Does |
|---|---|
| **Animation Graph** | Node-based visual programming for animation state machines (idle → walk → jump) |
| **Procedural Animation** | Physics-based secondary motion (hair bounce, cloth sway) applied to hand-drawn characters |
| **Export to Lottie/dotLottie** | Export animations in Lottie format for use in mobile apps and web |
| **Collaborative Animation** | Real-time collaboration on animation projects with per-layer locking |

---

## 5. Prioritised Roadmap

### Phase A: Export Pipeline (Weeks 1-2)
*Unblocks all three audiences simultaneously*

```
📦 This single phase makes Tenix useful overnight
```

- [ ] **Export as GIF** — Use `gif.js` or manual GIF encoder on the canvas
- [ ] **Export as WebM/MP4** — Use `MediaRecorder` API on the canvas stream
- [ ] **Export as PNG** — `canvas.toBlob()` with optional 2×/4× upscale
- [ ] **Export as SVG** — Convert grid to SVG rects (enables infinite scaling)
- [ ] **Transparent background export** — Alpha channel support in WebM/APNG

### Phase B: Scripting & Embeddability (Weeks 3-4)
*Targets developers, differentiates from pixel art tools*

- [ ] **JavaScript Sandbox** — Monaco editor in sidebar, eval in sandboxed iframe with `grid` API
- [ ] **Embeddable Widget** — Extract core into a standalone Web Component
- [ ] **NPM Package** — Publish `@tenix/core` with grid, patterns, animations, effects
- [ ] **URL-encodable boards** — Small grid states in URL hash for sharing

### Phase C: Timeline & Layers (Weeks 5-8)
*Targets animators, transforms Tenix into a creation tool*

- [ ] **Multi-layer support** — Array of `Uint8ClampedArray` buffers, composited at render time
- [ ] **Frame-by-frame editor** — Manual keyframe creation with frame list
- [ ] **Onion skinning** — Previous/next frame ghosting
- [ ] **Timeline UI** — Scrubber bar, frame thumbnails, layer list
- [ ] **Sprite sheet export** — All frames in a grid PNG

### Phase D: Content Creator Power Features (Weeks 9-12)
*Targets content creators, drives viral adoption*

- [ ] **Template gallery** — Pre-built animated scenes for common use cases
- [ ] **Audio reactive mode** — Web Audio API → effect triggers
- [ ] **OBS browser source support** — Transparent background streaming mode
- [ ] **Custom text animations** — Typewriter, glitch, bounce, wave entrance effects
- [ ] **Brand color palettes** — Define once, apply everywhere

### Phase E: Platform & Community (Ongoing)
*Network effects and ecosystem*

- [ ] **Shareable creations** — Cloud save/load, shareable URLs with previews
- [ ] **Plugin system** — Custom patterns, effects, tools via JS/WASM plugins
- [ ] **Community showcase** — Gallery of user creations, featured boards
- [ ] **Real-time collaboration** — WebRTC-based multi-user boards
- [ ] **Physical LED bridge** — WebSerial API to real WS2812B/NeoPixel hardware

---

## 6. Competitive Positioning

| Tool | What It Is | Where Tenix Wins |
|---|---|---|
| **Aseprite** | Pixel art + animation editor (desktop, $20) | Tenix is free, web-based, real-time effects, gesture control, LED-specific aesthetic |
| **Piskel** | Free web pixel art editor | Tenix has GPU effects, animations, audio-reactive potential, session recording |
| **p5.js** | Creative coding framework | Tenix is visual-first — zero code needed. But can add scripting for devs. |
| **LED matrix firmware** (WLED, etc.) | Physical LED controllers | Tenix simulates in-browser. Add WebSerial bridge and it controls real hardware too. |
| **Canva / Figma** | Design tools | Tenix is niche but owns the pixel-grid aesthetic. Content creators looking for retro/pixel effects won't find them in Canva. |

### Tenix's Unique Value Proposition

> **"The creative suite for pixel-grid content."**  
> Draw. Animate. Add effects. Export. Embed. Control real hardware.  
> Zero downloads. Works in any browser. GPU-accelerated.  
> One tool that serves content creators, developers, and animators through the unified lens of the LED matrix.

---

## 7. Technical Debt to Address Before Scaling

> [!WARNING]
> These should be tackled before building major new features, or they'll compound.

| Debt | Impact | Fix |
|---|---|---|
| `LEDBoard.tsx` is 1,546 lines | Hard to maintain, slow to add features | Extract state into a `useBoard()` hook or context/reducer pattern. Break into `useBoardAnimation()`, `useBoardEffects()`, `useBoardRecording()`, `useBoardGesture()`. |
| No state management | Props drilled 5+ levels deep through `ControlPanel → AnimationPanel → ...` | Consider Zustand or Jotai — lightweight stores that avoid prop drilling without heavy Redux overhead |
| No test coverage | Zero tests for core logic | Add Vitest unit tests for `grid.ts`, `patterns.ts`, `animations.ts`, `effects.ts`. These are pure functions — trivial to test. |
| Session recording stores raw frames | Memory-heavy for long recordings (30fps × 60s = 1800 frames × ~60KB each = ~100MB) | Delta compression — store only changed cells per frame. Or run-length encoding on the grid data. |
| No error boundaries | A shader compilation failure or WebGL context loss crashes everything | Add React error boundaries. Test WebGL context loss/restore. |
| No accessibility | No ARIA labels, keyboard navigation incomplete | Add ARIA roles, keyboard shortcuts for all tools, screen-reader descriptions |

---

## 8. Monetization Paths (If You Decide to Commercialize)

| Model | How | Target |
|---|---|---|
| **Freemium** | Free: draw, animate, export small GIFs. Paid: HD export, video export, templates, no watermark | Content creators |
| **API / SaaS** | Host Tenix as a service. REST API for programmatic board generation. Pay per render. | Developers building notification systems, dashboards |
| **Template Marketplace** | Sell/buy animated LED templates. Take 20% commission. | Creators selling to other creators |
| **Physical Hardware Bundle** | Sell Tenix-compatible LED matrix kits. Design in Tenix → flash to hardware. | Makers, IoT enthusiasts |
| **White-Label / Enterprise** | Licensed version for corporate dashboards, event displays, retail signage | Businesses |
| **Education** | "Learn creative coding through LED art" — curriculum + platform for schools | Schools, coding bootcamps |

---

## Summary

| Question | Answer |
|---|---|
| **Is building from scratch the right approach?** | **Yes for 2D** — your custom engine is optimal. **Use Three.js for 3D visualization** as an optional view mode reading from the same `GridManager`. |
| **Should you switch to Three.js entirely?** | **No.** Only use Three.js for the dedicated 3D renderer. Your existing 2D engine stays as-is. |
| **3D: build custom or Three.js?** | **Three.js** — building a 3D engine from scratch (transforms, depth buffering, orbit controls, lighting) is months of work. Three.js gives it free with `InstancedMesh` + `OrbitControls` + `MeshStandardMaterial`. |
| **WebGPU device coverage?** | **~65-70%.** Do not migrate now. Add as a third tier (CPU → WebGL → WebGPU) when you need compute shaders. Firefox and older iOS/Android are the main gaps. |
| **OffscreenCanvas + Worker?** | **High value, medium complexity.** Move only the `EffectsEngine` to a worker. Main benefit: effects never jank the UI. Main issue: `SharedArrayBuffer` requires special HTTP headers; iOS < 16.4 has no support (~8% of users). |
| **WASM in the project now?** | **No** (MediaPipe uses it internally but you don't control it). Add WASM for: GIF encoding, flood fill on huge grids, delta compression for recordings. 96%+ device coverage — no meaningful compat concern. |
| **What is WebCodecs?** | **Native browser video encoding** — hardware-accelerated MP4/WebM export without FFmpeg. ~80% coverage. iOS Safari < 18 is the gap. Use tiered fallback: WebCodecs → MediaRecorder → GIF. |
| **What's the most impactful next step?** | **Export pipeline (GIF/MP4/PNG/SVG).** Use WebCodecs + MediaRecorder + gif.js fallback. Unblocks all three audiences immediately. |
| **What makes Tenix special?** | The intersection of **visual creativity** (patterns, effects, animations), **technical depth** (GPU shaders, gesture control), and **accessibility** (browser-native, zero install). No other tool sits at this exact intersection. |
