# LED Board — Desktop App: Full Roadmap & Analysis

## 1. Current Web App Feature Inventory

Before choosing a stack, here's everything the desktop version must replicate:

| Category             | Features                                                                                                                                                            |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Grid Engine**      | Flat `Uint8ClampedArray` (RGB×3), dynamic resize, preserve-on-resize, adjustable cell size (2–40px), flood-fill                                                     |
| **Rendering**        | ImageData → offscreen Canvas → nearest-neighbor upscale, grid-lines overlay, effects overlay, 60fps RAF loop                                                        |
| **Tools**            | Draw, Erase, Fill (flood), Vibe (effect trigger)                                                                                                                    |
| **Patterns**         | Checkerboard, gradient (H/V/diagonal), noise, border, stripes, rainbow, plasma, dots, crosshatch, spiral, diamond, heart, zigzag, waves                             |
| **Animations (15+)** | Pulse, Rainbow Cycle, Scroll (L/R/U/D), Blink, Twinkle, Color Wave, Matrix Rain, Fire, Sparkle Field, Marquee, Replay Draw — all content-aware with snapshot system |
| **Effects (7)**      | Ripple, Wave, Raindrop, Star Burst, Helix, Sparkle, Laser — per-pixel intensity + hue-shift functions                                                               |
| **Text**             | 5×7 bitmap font, scalable, centered/wrapped, marquee scrolling via wide buffer                                                                                      |
| **Gesture Control**  | MediaPipe Hands (WASM): pinch-to-draw, pinch release, slap-clear, swipe, scroll, EMA cursor smoothing                                                               |
| **Recording**        | Stroke recorder: captures every pixel change in order for "Replay Draw" animation                                                                                   |
| **Persistence**      | localStorage: grid data (base64), color, tool, animation, effects, cell size                                                                                        |
| **UI**               | Control panel, color picker, animation panel, effects panel, pattern selector, info tooltips, fullscreen                                                            |
| **Undo**             | 50-level undo stack (full grid snapshots)                                                                                                                           |

---

## 2. Language & Framework Analysis

### Option A: **Rust + wgpu + egui** ⭐ RECOMMENDED

| Aspect             | Details                                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------------------ |
| **Performance**    | Zero-cost abstractions, no GC, SIMD intrinsics, GPU-accelerated rendering via wgpu (Vulkan/DX12/Metal) |
| **Grid engine**    | `Vec<u8>` or `[u8; N]` — identical to `Uint8ClampedArray`, SIMD-friendly tight loops                   |
| **Rendering**      | wgpu compute shaders for grid→pixel conversion, instanced rendering for cells, 144+ fps trivially      |
| **Gestures**       | `opencv-rust` bindings + MediaPipe C++ via FFI, or `ort` (ONNX Runtime) for hand landmark models       |
| **UI**             | `egui` (immediate-mode) or `iced` (Elm-architecture) — both GPU-accelerated, cross-platform            |
| **Binary size**    | ~5–15 MB statically linked                                                                             |
| **Cross-platform** | Windows, macOS, Linux natively                                                                         |
| **Difficulty**     | 🔴 Hard — steep learning curve, borrow checker, async patterns                                         |

### Option B: **C++ + SDL2 + OpenGL/Vulkan**

| Aspect             | Details                                                                          |
| ------------------ | -------------------------------------------------------------------------------- |
| **Performance**    | Maximum possible — direct hardware access, SIMD intrinsics, manual memory layout |
| **Grid engine**    | Raw `uint8_t[]` array with pointer arithmetic                                    |
| **Rendering**      | SDL2 textures with streaming pixel upload, or raw OpenGL texture quads           |
| **Gestures**       | Native OpenCV + MediaPipe C++ (first-class support)                              |
| **UI**             | Dear ImGui (immediate mode, integrates with SDL+OpenGL)                          |
| **Binary size**    | ~3–10 MB                                                                         |
| **Cross-platform** | Windows, macOS, Linux                                                            |
| **Difficulty**     | 🔴 Hard — manual memory management, build system complexity (CMake)              |

### Option C: **C# + AvaloniaUI + SkiaSharp**

| Aspect             | Details                                                                                     |
| ------------------ | ------------------------------------------------------------------------------------------- |
| **Performance**    | Good — JIT compilation, `Span<byte>` / unsafe blocks for hot pixel loops, GPU via SkiaSharp |
| **Grid engine**    | `byte[]` with `Span<byte>` slicing — very close to the JS model                             |
| **Rendering**      | SkiaSharp `SKBitmap` + `SKCanvas` — hardware-accelerated, similar API to HTML Canvas        |
| **Gestures**       | OpenCvSharp4 + custom MediaPipe integration or ONNX Runtime (.NET)                          |
| **UI**             | AvaloniaUI — XAML-based, mature, looks native on all platforms                              |
| **Binary size**    | ~30–60 MB (self-contained) or ~5 MB if .NET runtime pre-installed                           |
| **Cross-platform** | Windows, macOS, Linux                                                                       |
| **Difficulty**     | 🟡 Medium — familiar OOP patterns, strong typing, good tooling                              |

### Option D: **Tauri 2.0 (Rust backend + WebView frontend)**

| Aspect             | Details                                                                                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Performance**    | UI renders in WebView (Chromium on Windows, WebKit on macOS) — nearly identical to current web app. Heavy computation offloaded to Rust backend via IPC |
| **Grid engine**    | Can keep the TypeScript grid engine as-is, or move to Rust for hot paths                                                                                |
| **Rendering**      | Same Canvas API as current app — minimal rewrite                                                                                                        |
| **Gestures**       | Rust backend handles camera + MediaPipe via `ort` or OpenCV, sends coordinates via Tauri events                                                         |
| **UI**             | Reuse your existing React + Tailwind UI verbatim                                                                                                        |
| **Binary size**    | ~5–10 MB (uses OS WebView, no bundled Chromium)                                                                                                         |
| **Cross-platform** | Windows, macOS, Linux                                                                                                                                   |
| **Difficulty**     | 🟢 Easy — reuse 80%+ of existing code                                                                                                                   |

### Option E: **Electron** (least recommended)

| Aspect          | Details                                                                   |
| --------------- | ------------------------------------------------------------------------- |
| **Performance** | Same as web app — no improvement. Chromium overhead: 150+ MB RAM baseline |
| **Reuse**       | ~95% code reuse                                                           |
| **Binary size** | 150–250 MB                                                                |
| **Difficulty**  | 🟢 Trivial                                                                |

---

## 3. Recommendation Matrix

| Priority                                   | Best Choice                     | Why                                                         |
| ------------------------------------------ | ------------------------------- | ----------------------------------------------------------- |
| **Max performance + polish**               | **Rust + wgpu + egui**          | GPU compute shaders, zero GC, SIMD animation loops, 144fps+ |
| **Balanced performance + developer speed** | **C# + AvaloniaUI + SkiaSharp** | Familiar OOP, SkiaSharp GPU, fast iteration, decent perf    |
| **Fastest time-to-market**                 | **Tauri 2.0**                   | Reuse existing React codebase, offload hot paths to Rust    |
| **Best gesture support**                   | **C++ + SDL2** or **Rust**      | Native MediaPipe / OpenCV integration, no WASM overhead     |

### **My recommendation: Rust + wgpu + egui**

Reasons:

1. Your grid is already a flat byte array — maps 1:1 to Rust `Vec<u8>`
2. Animation tick functions are pure math on byte arrays — perfect for SIMD
3. wgpu compute shaders can process 200×200 cells (120K pixels) in microseconds
4. egui gives immediate-mode UI with zero layout overhead
5. Single ~10MB binary, no runtime dependencies
6. Future-proof: can target WebAssembly too (full circle back to web)

---

## 4. System Requirements

### Development Machine

- **OS**: Windows 10/11, macOS 12+, or Linux (Ubuntu 22.04+)
- **RAM**: 8 GB minimum (16 GB recommended)
- **GPU**: Vulkan 1.1 or DirectX 12 capable (any GPU from 2016+)
- **Disk**: ~5 GB for toolchain + dependencies
- **Camera**: USB webcam or built-in (for gesture control)

### End-User Runtime

- **OS**: Windows 10+, macOS 12+, Linux (glibc 2.31+)
- **RAM**: 50–100 MB (vs 300+ MB for Electron)
- **GPU**: Any GPU with Vulkan/DX12/Metal support (graceful fallback to software rasterizer)
- **Camera**: Optional (only for gesture features)

---

## 5. Dependencies & Toolchain

```
# Core toolchain
rustup                          # Rust installer + toolchain manager
cargo                           # Package manager & build system

# Key crates (Rust packages)
wgpu = "24.x"                   # GPU abstraction (Vulkan/DX12/Metal/WebGPU)
egui = "0.31"                   # Immediate-mode GUI
eframe = "0.31"                 # egui integration frame (windowing + rendering)
winit = "0.30"                  # Cross-platform window creation
pollster = "0.4"                # Lightweight async runtime for wgpu
image = "0.25"                  # Image encoding (PNG export, clipboard)
serde = "1"                     # Serialization (save/load projects)
serde_json = "1"                # JSON format for project files
rfd = "0.15"                    # Native file dialogs (open/save)
arboard = "3"                   # Cross-platform clipboard
ort = "2.x"                     # ONNX Runtime for hand-tracking ML model
nokhwa = "0.10"                 # Cross-platform camera capture
directories = "5"               # OS-appropriate config/data paths

# Optional — performance
rayon = "1.10"                  # Parallel iterators for multi-core animation
wide = "0.7"                    # Portable SIMD wrappers
```

### For Gesture/Hand Tracking

```
# Option A: ONNX Runtime (recommended — simpler, cross-platform)
ort = "2.x"                     # Run MediaPipe hand landmark ONNX model
                                # Download: hand_landmark_full.onnx from MediaPipe

# Option B: OpenCV (heavier but more features)
opencv = "0.93"                 # OpenCV Rust bindings
                                # Requires OpenCV 4.x C++ libraries installed
```

---

## 6. Architecture Design

```
┌─────────────────────────────────────────────────────────┐
│                     LED Board Desktop                    │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────┐    ┌──────────┐    ┌──────────────────┐   │
│  │  egui UI  │◄──│  State   │──►│  GPU Renderer     │   │
│  │  Panels   │   │  Manager │   │  (wgpu pipeline)  │   │
│  └──────────┘    └────┬─────┘   └────────┬──────────┘   │
│                       │                   │              │
│  ┌──────────┐    ┌────┴─────┐    ┌───────┴──────────┐   │
│  │  Camera   │──►│  Grid    │   │  Compute Shader   │   │
│  │  + Hand   │   │  Engine  │   │  (animation tick) │   │
│  │  Tracker  │   │ Vec<u8>  │   └───────────────────┘   │
│  └──────────┘    └────┬─────┘                           │
│                       │                                  │
│  ┌──────────┐    ┌────┴─────┐    ┌──────────────────┐   │
│  │  Effects  │   │Animation │   │  File I/O         │   │
│  │  Engine   │   │ Manager  │   │  (serde JSON)     │   │
│  └──────────┘    └──────────┘   └──────────────────────┘│
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### Module Breakdown

```
src/
├── main.rs                  # Entry point, eframe::run_native()
├── app.rs                   # Top-level App struct, implements eframe::App
├── state.rs                 # Central state: grid data, tool, color, settings
│
├── grid/
│   ├── mod.rs               # GridManager (direct port of grid.ts)
│   ├── flood_fill.rs        # Stack-based flood fill
│   └── resize.rs            # Resize with data preservation
│
├── render/
│   ├── mod.rs               # Renderer trait + orchestration
│   ├── gpu_pipeline.rs      # wgpu render pipeline (cell texture → screen)
│   ├── compute.rs           # wgpu compute shader for animation ticks
│   └── grid_lines.rs        # Grid overlay rendering
│
├── animation/
│   ├── mod.rs               # AnimationManager (port of animation.ts)
│   ├── animations.rs        # All 15+ animation tick functions
│   ├── snapshot.rs          # Content snapshot system
│   └── marquee.rs           # Wide-buffer marquee scrolling
│
├── effects/
│   ├── mod.rs               # EffectsEngine
│   └── presets.rs           # 7 effect presets (ripple, wave, etc.)
│
├── patterns/
│   └── mod.rs               # All pattern generators
│
├── text/
│   ├── font.rs              # 5x7 bitmap font data
│   └── render.rs            # Text rendering, centering, wrapping
│
├── tools/
│   ├── mod.rs               # Tool enum + dispatch
│   ├── draw.rs              # Draw tool (Bresenham line for smooth strokes)
│   ├── erase.rs             # Erase tool
│   ├── fill.rs              # Fill tool (delegates to grid flood_fill)
│   └── vibe.rs              # Vibe tool (effect trigger)
│
├── gesture/
│   ├── mod.rs               # GestureController
│   ├── camera.rs            # Camera capture (nokhwa)
│   ├── hand_tracker.rs      # ONNX hand landmark model
│   ├── pinch.rs             # Pinch detection with hysteresis
│   ├── slap.rs              # Slap/clear gesture
│   └── smoothing.rs         # EMA cursor smoothing
│
├── ui/
│   ├── mod.rs               # UI root layout
│   ├── control_panel.rs     # Tool selector, grid settings, text input
│   ├── color_picker.rs      # HSL color picker
│   ├── animation_panel.rs   # Animation list, play/pause/stop, FPS slider
│   ├── effects_panel.rs     # Effect preset selector, distance/speed
│   ├── pattern_panel.rs     # Pattern grid
│   ├── gesture_panel.rs     # Camera preview, pinch threshold, status
│   └── toolbar.rs           # Top toolbar (undo, fullscreen, export)
│
├── io/
│   ├── project.rs           # Save/load project files (.tenix JSON)
│   ├── export.rs            # PNG/GIF export
│   └── clipboard.rs         # Copy grid image to clipboard
│
├── recorder/
│   └── mod.rs               # StrokeRecorder (port of recorder.ts)
│
└── util/
    ├── color.rs             # HSL↔RGB, color math (SIMD-optimized)
    └── math.rs              # Shared math helpers
```

---

## 7. Development Roadmap

### Phase 0 — Environment Setup (1–2 days)

- [ ] Install Rust toolchain: `rustup default stable`
- [ ] Create project: `cargo new led-board-desktop`
- [ ] Add core dependencies to `Cargo.toml`
- [ ] Set up `eframe` hello-world window
- [ ] Verify wgpu renders a colored quad on target OS
- [ ] Set up CI (GitHub Actions: `cargo build`, `cargo test`, `cargo clippy`)

### Phase 1 — Grid Engine (3–4 days)

- [ ] `GridManager` struct: `Vec<u8>`, cols, rows, cell_size
- [ ] `set_cell()`, `get_cell()`, `clear()`, `fill()`, `in_bounds()`
- [ ] `resize()` and `resize_preserve()` with data copy
- [ ] `resize_cell_size()` — change cell size, recalculate dims
- [ ] `flood_fill()` — iterative stack-based (identical to JS version)
- [ ] `load_data()`, `clone_data()` — for undo/serialization
- [ ] Unit tests for all grid operations

### Phase 2 — GPU Rendering Pipeline (4–5 days)

- [ ] Create wgpu device, surface, swap chain
- [ ] Upload grid `Vec<u8>` as GPU texture (RGB8, cols × rows)
- [ ] Write vertex shader: fullscreen quad with UV mapping
- [ ] Write fragment shader: sample grid texture with `texelFetch` (nearest-neighbor)
- [ ] Uniform buffer: cell_size, viewport_size, grid_offset
- [ ] Grid lines: thin lines via fragment shader (cheaper than geometry)
- [ ] Background color handling (black cells → background color in shader)
- [ ] Render loop: 60fps vsync, only re-upload texture when grid data changes (dirty flag)
- [ ] Effects overlay: second texture layer, alpha-blended

**Performance target**: 200×200 grid @ 144fps, <2ms frame time

### Phase 3 — Tools & Interaction (3–4 days)

- [ ] Mouse → grid cell coordinate mapping (with cell_size)
- [ ] Draw tool: set cell on click/drag, Bresenham interpolation for smooth lines
- [ ] Erase tool: set cell to [0,0,0]
- [ ] Fill tool: trigger `flood_fill()` on click
- [ ] Vibe tool: trigger effect at click position
- [ ] Undo system: ring buffer of 50 grid snapshots (clone `Vec<u8>`)
- [ ] Stroke recorder: capture (col, row, r, g, b) per pixel change
- [ ] Keyboard shortcuts: Ctrl+Z undo, Space pause, F11 fullscreen

### Phase 4 — Patterns (1–2 days)

Port all pattern functions from `patterns.ts`:

- [ ] `checkerboard()` — configurable colors and size
- [ ] `gradient()` — horizontal, vertical, diagonal with color interpolation
- [ ] `random_noise()` — random RGB per cell
- [ ] `border()` — configurable color and thickness
- [ ] `stripes()` — H/V, configurable colors and width
- [ ] `rainbow()` — HSL gradient across grid
- [ ] `plasma()` — sine-based procedural plasma
- [ ] `dots()`, `crosshatch()` — spacing-based patterns
- [ ] `spiral()`, `diamond()`, `heart()`, `zigzag()`, `waves_pattern()`

These are all pure `fn(cols, rows, &mut [u8])` — straight ports from JS.

### Phase 5 — Animations (4–5 days)

Port the animation system from `animation.ts` + `animations.ts`:

- [ ] `AnimationManager`: state machine (Stopped/Playing/Paused), FPS control, frame counter
- [ ] Snapshot system: `capture_snapshot()`, `update_snapshot_pixel()`
- [ ] **Content-aware animations** (operate on snapshot):
  - Pulse/Breathe, Rainbow Cycle, Scroll (L/R/U/D), Blink, Twinkle, Color Wave
- [ ] **Generative animations** (ignore existing content):
  - Matrix Rain, Fire, Sparkle Field
- [ ] **Replay animation**: reads `StrokeRecorder` entries, replays N pixels/frame
- [ ] **Marquee**: render text into wide buffer, scroll viewport window across it
- [ ] FPS slider (1–60), play/pause/stop controls
- [ ] **GPU compute shader** path for heavy animations (optional optimization):
  - Upload snapshot + frame number as uniforms
  - Compute shader writes output grid texture
  - 10–50× faster than CPU for large grids

### Phase 6 — Effects Engine (3–4 days)

Port from `effects.ts`:

- [ ] `EffectsEngine`: manages active effect instances (position, age, preset)
- [ ] `EffectsOverlay`: separate RGBA buffer composited on top of grid
- [ ] 7 preset intensity functions: Ripple, Wave, Raindrop, Star Burst, Helix, Sparkle, Laser
- [ ] Hue-shift support: convert trigger color to HSL, shift, convert back
- [ ] Distance multiplier and speed multiplier controls
- [ ] Efficient pixel iteration: only process cells within `max_radius` of each active effect

### Phase 7 — Text Rendering (1–2 days)

- [ ] Port `FONT` bitmap data (5×7, binary rows)
- [ ] `render_char()` with scale parameter
- [ ] `render_text_centered()` — auto-center on grid
- [ ] `render_text_to_wide_buffer()` — for marquee
- [ ] `measure_text()` — calculate pixel width
- [ ] Text input field in UI, color selector, scale slider, wrap toggle

### Phase 8 — UI Panels (5–7 days)

Build the full egui interface:

- [ ] **Layout**: left sidebar (collapsible) + central canvas viewport
- [ ] **Control Panel**: tool selector (icon buttons), brush size, grid toggle, cell size slider
- [ ] **Color Picker**: HSL wheel/sliders, hex input, preset swatches, recent colors
- [ ] **Animation Panel**: animation list, play/pause/stop, FPS slider, frame counter
- [ ] **Effects Panel**: preset selector, enable toggle, distance/speed sliders
- [ ] **Pattern Panel**: visual thumbnails grid, click to apply
- [ ] **Text Panel**: input field, color, scale, centered/wrapped checkboxes
- [ ] **Gesture Panel**: camera preview (as egui texture), status indicator, threshold slider
- [ ] **Toolbar**: undo button, fullscreen toggle, export button, clear button
- [ ] **Info tooltips**: hover descriptions for all controls
- [ ] **Keyboard shortcuts overlay**: `?` key shows all shortcuts

### Phase 9 — Gesture Control (5–7 days)

This is the most complex subsystem to port:

- [ ] **Camera capture**: `nokhwa` crate for cross-platform webcam access
  - Request 640×480 @ 30fps
  - Run capture on a dedicated thread
  - Send frames to hand tracker via channel
- [ ] **Hand tracking model**:
  - Download MediaPipe hand landmark ONNX model
  - Load with `ort` (ONNX Runtime)
  - Pre-process: resize frame to 224×224, normalize to [0,1]
  - Post-process: extract 21 landmark (x,y,z) coordinates
- [ ] **Gesture detection** (port from GestureController.tsx):
  - Pinch detection: index-thumb distance with hysteresis band
  - Slap detection: 4 fingers straight + tight + thumb spread, hold for N frames
  - Swipe detection: wrist velocity accumulation
  - Scroll: two-finger vertical movement delta
- [ ] **Cursor smoothing**: EMA filter (α = 0.35), landmark → screen coordinate mapping
- [ ] **Camera preview**: render camera frame as egui texture in gesture panel
- [ ] **Performance**: hand tracking on background thread, ~30ms per inference
  - Gesture results sent to main thread via `mpsc::channel`

### Phase 10 — File I/O & Export (2–3 days)

- [ ] **Project format** (`.tenix`): JSON with serde
  ```json
  {
    "version": 1,
    "cols": 128, "rows": 64, "cellSize": 10,
    "data": "<base64-encoded grid bytes>",
    "settings": { "showGrid": true, "gridColor": [30,30,30], "bgColor": [0,0,0] },
    "strokeRecording": [ { "col": 5, "row": 3, "r": 255, "g": 0, "b": 0 }, ... ]
  }
  ```
- [ ] Save/Load via native file dialog (`rfd` crate)
- [ ] Auto-save to OS config directory (`directories` crate)
- [ ] **PNG export**: render grid to `image::RgbImage`, save via `image` crate
- [ ] **GIF export**: animated GIF from animation frames (using `gif` crate)
- [ ] **Clipboard**: copy rendered image to system clipboard (`arboard` crate)

### Phase 11 — Optimization Pass (3–4 days)

- [ ] **Dirty-region tracking**: only re-upload changed rows to GPU texture
- [ ] **SIMD animation loops**: use `std::simd` (nightly) or `wide` crate for bulk pixel math
- [ ] **Multi-threaded animations**: `rayon` parallel iterators for per-row processing
- [ ] **Memory pool**: pre-allocate undo snapshots, reuse buffers
- [ ] **Profiling**: `tracy` or `puffin` profiler integration
- [ ] **Benchmarks**: `criterion` benchmarks for grid ops, animations, effects
- [ ] **Target metrics**:
  - Grid 200×200 (120K cells): <0.5ms per animation tick
  - Full frame (tick + render + UI): <4ms (>240fps headroom)
  - Memory: <100MB including undo stack
  - Binary: <15MB

### Phase 12 — Polish & Distribution (2–3 days)

- [ ] App icon (Windows .ico, macOS .icns, Linux .png)
- [ ] Windows: `cargo-wix` for MSI installer, or just .exe
- [ ] macOS: `cargo-bundle` for .app bundle + DMG
- [ ] Linux: AppImage via `cargo-appimage`
- [ ] Auto-updater (optional): `self_update` crate
- [ ] Error handling: `anyhow` for clean error messages, crash reporter
- [ ] First-run tutorial / onboarding overlay

---

## 8. Mapping: Web → Desktop (Key Translations)

| Web (TypeScript/React)       | Desktop (Rust)                                        |
| ---------------------------- | ----------------------------------------------------- |
| `Uint8ClampedArray`          | `Vec<u8>` (or `Box<[u8]>` for fixed-size)             |
| `ImageData` + Canvas2D       | wgpu `Texture` + compute/render pipeline              |
| `requestAnimationFrame`      | `eframe::App::update()` (called every frame by winit) |
| React `useState` / `useRef`  | Struct fields on `App`                                |
| `localStorage`               | `serde_json` + `directories::ProjectDirs`             |
| `@mediapipe/hands` (WASM)    | `ort` ONNX Runtime (native, ~3× faster)               |
| `@mediapipe/camera_utils`    | `nokhwa` crate (native camera)                        |
| CSS Tailwind UI              | egui widgets (immediate-mode)                         |
| `Math.sin()`, `Math.floor()` | `f32::sin()`, `.floor()` / integer cast               |
| `performance.now()`          | `std::time::Instant::now()`                           |
| `base64` encode/decode       | `base64` crate                                        |
| `console.log()`              | `tracing` crate                                       |
| `window.innerWidth`          | `egui::Context::screen_rect()`                        |

---

## 9. Performance Comparison Estimates

| Metric                        | Web (Chrome)            | Desktop (Rust+wgpu)               | Improvement |
| ----------------------------- | ----------------------- | --------------------------------- | ----------- |
| Animation tick (128×64 grid)  | ~2ms (JS)               | ~0.05ms (SIMD)                    | **40×**     |
| Animation tick (200×200 grid) | ~8ms (JS)               | ~0.2ms (SIMD)                     | **40×**     |
| Grid render                   | ~3ms (Canvas2D)         | ~0.1ms (GPU texture)              | **30×**     |
| Full frame time               | ~12ms (83fps)           | ~0.5ms (>1000fps, vsync'd to 144) | **24×**     |
| Gesture inference             | ~30ms (WASM)            | ~10ms (native ONNX)               | **3×**      |
| Memory (idle)                 | ~150MB (Chrome tab)     | ~30MB                             | **5×**      |
| Memory (with camera)          | ~300MB                  | ~80MB                             | **3.7×**    |
| Startup time                  | ~2s (Next.js hydration) | ~200ms                            | **10×**     |
| Binary/install size           | N/A (web)               | ~10MB                             | —           |

---

## 10. Timeline Summary

| Phase                     | Duration | Cumulative     |
| ------------------------- | -------- | -------------- |
| 0. Environment Setup      | 1–2 days | 1–2 days       |
| 1. Grid Engine            | 3–4 days | 4–6 days       |
| 2. GPU Rendering          | 4–5 days | 8–11 days      |
| 3. Tools & Interaction    | 3–4 days | 11–15 days     |
| 4. Patterns               | 1–2 days | 12–17 days     |
| 5. Animations             | 4–5 days | 16–22 days     |
| 6. Effects Engine         | 3–4 days | 19–26 days     |
| 7. Text Rendering         | 1–2 days | 20–28 days     |
| 8. UI Panels              | 5–7 days | 25–35 days     |
| 9. Gesture Control        | 5–7 days | 30–42 days     |
| 10. File I/O & Export     | 2–3 days | 32–45 days     |
| 11. Optimization          | 3–4 days | 35–49 days     |
| 12. Polish & Distribution | 2–3 days | **37–52 days** |

**Total estimate: 6–8 weeks** (solo developer, full-time)

---

## 11. Quick Start Commands

```bash
# 1. Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
# On Windows: download rustup-init.exe from https://rustup.rs

# 2. Create project
cargo new led-board-desktop
cd led-board-desktop

# 3. Add dependencies (Cargo.toml)
cargo add eframe egui wgpu pollster image serde serde_json rfd arboard directories rayon

# 4. Verify it builds
cargo run

# 5. Run with optimizations (for benchmarking)
cargo run --release

# 6. Build distributable binary
cargo build --release
# Binary at: target/release/led-board-desktop(.exe)
```

---

## 12. Risk Assessment

| Risk                      | Impact                                   | Mitigation                                                                                         |
| ------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------- |
| **Rust learning curve**   | High — borrow checker, lifetimes         | Start with grid engine (simple data, no references). Use `clone()` liberally first, optimize later |
| **wgpu complexity**       | Medium — shader debugging is hard        | Use `eframe`'s built-in wgpu integration; start with CPU rendering, add GPU later                  |
| **Gesture ML model**      | Medium — ONNX model compatibility        | Test MediaPipe hand_landmark_full.onnx early. Fallback: mouse-only mode                            |
| **Camera cross-platform** | Medium — nokhwa has platform quirks      | Test on all target OS early. Fallback: `opencv` camera capture                                     |
| **egui limitations**      | Low — no rich text, limited layout       | Custom painting for specialized widgets (color wheel, pattern thumbnails)                          |
| **Binary size**           | Low — wgpu shaders + ONNX model add bulk | Strip debug symbols (`strip = true`), compress ONNX model, use LTO                                 |

---

## 13. Alternative Fast Path: Tauri 2.0

If the Rust-native approach feels too ambitious, **Tauri 2.0** offers a pragmatic middle ground:

```
Current web app (React + Canvas)
         │
         ▼
┌─────────────────────┐
│     Tauri 2.0       │
│  ┌───────────────┐  │
│  │  WebView       │  │  ← Your existing React UI + Canvas rendering
│  │  (OS native)   │  │     runs here with ~0% code changes
│  └───────┬───────┘  │
│          │ IPC       │
│  ┌───────┴───────┐  │
│  │  Rust Backend  │  │  ← Camera capture, hand tracking, file I/O,
│  │  (sidecar)     │  │     heavy computation offloaded here
│  └───────────────┘  │
└─────────────────────┘
```

**Migration effort**: ~1 week to wrap existing app in Tauri, ~2 weeks to add Rust gesture backend.

**Trade-off**: You get ~80% of the desktop benefits (native feel, file system access, smaller binary than Electron, system tray) but only ~20% of the performance gains (rendering still happens in WebView).

---

## 14. Final Verdict

| If you want...                                              | Choose                                    |
| ----------------------------------------------------------- | ----------------------------------------- |
| A learning project that produces the best possible software | **Rust + wgpu + egui**                    |
| A production app shipped in 2–3 weeks                       | **Tauri 2.0**                             |
| Something in between                                        | **C# + AvaloniaUI**                       |
| Quick prototype to validate desktop UX                      | **Electron** (then migrate to Rust later) |
