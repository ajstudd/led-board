# LED Board Simulator — Roadmap

## Concept

Turn the entire browser viewport into a programmable LED grid. The screen is divided into **10×10px cells** (e.g. a 1920×1080 viewport becomes a **192×108 grid**). Each cell acts as a single "LED" whose colour can be individually controlled, enabling patterns, animations, text, and effects — like a real LED matrix display.

---

## Tech Stack

| Layer     | Choice                      | Why                                                                                                        |
| --------- | --------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Framework | **Next.js 16 (App Router)** | Already scaffolded                                                                                         |
| Rendering | **HTML Canvas 2D**          | Drawing thousands of cells with DOM elements would be too slow; Canvas handles 20k+ rects at 60 fps easily |
| State     | **React state + useRef**    | Grid data lives in a `Uint8ClampedArray` (or flat array) for speed; React only re-renders the toolbar/UI   |
| Styling   | **Tailwind CSS 4**          | Already installed — used for the control panel UI                                                          |
| Language  | **TypeScript**              | Already configured                                                                                         |

---

## Architecture

```
app/
├── layout.tsx              — root layout (full-screen, no scroll)
├── page.tsx                — mounts <LEDBoard />
├── globals.css             — reset, full-screen body
│
├── components/
│   ├── LEDBoard.tsx        — main component: canvas + control panel
│   ├── Canvas.tsx          — the <canvas> element, draw loop, mouse events
│   ├── ControlPanel.tsx    — floating toolbar for tools & settings
│   ├── ColorPicker.tsx     — colour selection widget
│   └── PatternSelector.tsx — predefined pattern library
│
├── lib/
│   ├── grid.ts             — GridManager class (create, get/set pixel, clear, fill, resize)
│   ├── patterns.ts         — built-in pattern generators (checkerboard, gradient, rain, wave, text, etc.)
│   ├── animation.ts        — animation loop manager (start/stop/fps control)
│   └── utils.ts            — helpers (hsl↔rgb, coordinate math, etc.)
│
└── types/
    └── index.ts            — shared TypeScript types (Cell, GridState, Pattern, Tool, etc.)
```

---

## Implementation Phases

### Phase 1 — Core Grid & Canvas Renderer

- [ ] **Full-screen layout** — remove default Next.js content; make `<body>` and `<html>` fill the viewport with no overflow.
- [ ] **Grid data model** (`lib/grid.ts`) — `GridManager` class that:
  - Calculates columns & rows from `window.innerWidth / 10` and `window.innerHeight / 10`.
  - Stores colour per cell as `[r, g, b]` in a flat array.
  - Exposes `setCell(col, row, color)`, `getCell(col, row)`, `clear()`, `fill(color)`, `resize()`.
- [ ] **Canvas renderer** (`components/Canvas.tsx`) —
  - A `<canvas>` element sized to `window.innerWidth × window.innerHeight`.
  - `drawGrid()` iterates every cell and fills a 10×10 rect with its colour.
  - Optional grid lines toggle (1px borders between cells).
  - Listens to `resize` events and recalculates the grid.

### Phase 2 — Interactive Drawing

- [ ] **Mouse → cell mapping** — convert `clientX/clientY` to `col/row` via integer division by 10.
- [ ] **Draw tool** — click or drag to paint cells with the active colour.
- [ ] **Eraser tool** — paint cells back to black (background colour).
- [ ] **Fill (bucket) tool** — flood-fill a contiguous region of same-coloured cells.
- [ ] **Colour picker** — HSL/RGB colour selector + a palette of quick-pick colours.
- [ ] **Control panel UI** — floating, draggable toolbar with tool buttons, colour picker, grid-lines toggle, clear button.

### Phase 3 — Patterns & Presets

- [ ] **Pattern engine** (`lib/patterns.ts`) — functions that receive the grid and fill it:
  - `checkerboard(color1, color2)`
  - `gradient(startColor, endColor, direction)`
  - `randomNoise()`
  - `border(color, thickness)`
  - `stripes(colors[], orientation, width)`
- [ ] **Pattern selector UI** — grid of thumbnail previews; clicking applies the pattern.
- [ ] **Text renderer** — draw pixel-font text onto the grid (5×7 bitmap font).

### Phase 4 — Animation Engine

- [ ] **Animation loop** (`lib/animation.ts`) — `requestAnimationFrame`-based loop with adjustable FPS (1–60).
- [ ] **Built-in animations:**
  - Rainbow wave
  - Matrix rain
  - Scrolling text marquee
  - Pulse / breathe effect
  - Conway's Game of Life
- [ ] **Play / Pause / Stop controls** in the toolbar.
- [ ] **FPS slider** in the toolbar.

### Phase 5 — Import / Export & Persistence

- [ ] **Export grid as PNG** — `canvas.toBlob()` download.
- [ ] **Export grid as JSON** — save the cell array + metadata.
- [ ] **Import JSON** — load a previously saved grid.
- [ ] **LocalStorage autosave** — persist the current grid state between reloads.

### Phase 6 — Advanced Features (stretch goals)

- [ ] **Custom cell size** — let the user pick cell size (5px, 10px, 20px, etc.) via a slider.
- [ ] **Multi-layer support** — stackable layers with opacity, merged at render time.
- [ ] **Copy / paste region** — select a rectangle, copy it, paste it elsewhere.
- [ ] **Undo / redo** — history stack for draw operations.
- [ ] **Keyboard shortcuts** — `C` clear, `G` toggle grid, `Space` play/pause, `1-5` tools.
- [ ] **Shareable URL** — encode a small grid state into a URL hash or query param.

---

## How Each Piece Works

### Grid Calculation

```
const CELL_SIZE = 10; // px
const cols = Math.floor(window.innerWidth / CELL_SIZE);   // e.g. 192
const rows = Math.floor(window.innerHeight / CELL_SIZE);  // e.g. 108
const grid = new Uint8Array(cols * rows * 3);              // RGB per cell
```

### Canvas Draw Loop

```
function drawGrid(ctx, grid, cols, rows) {
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = (r * cols + c) * 3;
      ctx.fillStyle = `rgb(${grid[i]},${grid[i+1]},${grid[i+2]})`;
      ctx.fillRect(c * CELL_SIZE, r * CELL_SIZE, CELL_SIZE, CELL_SIZE);
    }
  }
}
```

### Mouse → Cell

```
canvas.addEventListener('mousemove', (e) => {
  const col = Math.floor(e.clientX / CELL_SIZE);
  const row = Math.floor(e.clientY / CELL_SIZE);
  if (isDrawing) gridManager.setCell(col, row, activeColor);
});
```

---

## Delivery Order

| Step | What ships | Outcome                                             |
| ---- | ---------- | --------------------------------------------------- |
| 1    | Phase 1    | Black screen with a visible grid — proof of concept |
| 2    | Phase 2    | You can draw on the grid with a mouse — interactive |
| 3    | Phase 3    | One-click patterns and pixel text                   |
| 4    | Phase 4    | Animated effects running on the board               |
| 5    | Phase 5    | Save/load your creations                            |
| 6    | Phase 6    | Power-user features                                 |

---

> **Awaiting your approval to begin implementation.** I'll start with Phase 1 (core grid + canvas renderer) and progress phase by phase. Let me know if you'd like to adjust anything — cell size, feature priority, or scope.
