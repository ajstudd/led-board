import { AnimationConfig, AnimationRuntimeContext } from "../types";
import { random, randomInt, randomRange } from "./seededRng";
import { hslToRgb, hslToRgbInto } from "./utils";
import { strokeRecorder, StrokeEntry } from "./recorder";

/**
 * Content-aware animations — these effects work on the user's
 * existing drawing/text. On frame 0 they snapshot whatever is on
 * the grid and then apply a visual effect to that snapshot.
 *
 * The "snapshot" (original pixel data) is captured once when the
 * animation starts. Each tick reads the snapshot and writes the
 * modified result into the live grid data.
 */

// ── Active animation runtime (set by AnimationManager per tick) ──
let snapshot: Uint8ClampedArray | null = null;
let marqueeBuffer: Uint8ClampedArray | null = null;
let marqueeBufCols = 0;

export function setAnimationRuntimeContext(runtime: AnimationRuntimeContext | null): void {
  snapshot = runtime?.snapshot ?? null;
  marqueeBuffer = runtime?.marqueeBuffer ?? null;
  marqueeBufCols = runtime?.marqueeBufferCols ?? 0;
}

/** Capture (or update) the content snapshot the animations read from */
export function captureSnapshot(
  data: Uint8ClampedArray,
  runtime: AnimationRuntimeContext,
): Uint8ClampedArray {
  if (!runtime.snapshot || runtime.snapshot.length !== data.length) {
    runtime.snapshot = new Uint8ClampedArray(data);
  } else {
    runtime.snapshot.set(data);
  }

  return runtime.snapshot;
}

/** Fast single-pixel update — avoids copying the entire buffer */
export function updateSnapshotPixel(
  idx: number,
  r: number,
  g: number,
  b: number,
  runtime: AnimationRuntimeContext,
): void {
  if (!runtime.snapshot) return;
  runtime.snapshot[idx] = r;
  runtime.snapshot[idx + 1] = g;
  runtime.snapshot[idx + 2] = b;
}

/** Helpers ────────────────────────────────────────────── */

function isLit(data: Uint8ClampedArray, idx: number): boolean {
  return data[idx] > 5 || data[idx + 1] > 5 || data[idx + 2] > 5;
}

// ═══════════════════════════════════════════════════════
//  1. Pulse / Breathe — fades your drawing in and out
// ═══════════════════════════════════════════════════════

function pulseTick(
  _cols: number,
  _rows: number,
  data: Uint8ClampedArray,
  frame: number,
) {
  if (!snapshot) return;
  const t = (Math.sin(frame * 0.1) + 1) / 2; // 0..1
  const brightness = 0.1 + t * 0.9;
  const len = data.length;

  for (let i = 0; i < len; i += 3) {
    data[i] = snapshot[i] * brightness; // Uint8ClampedArray auto-rounds
    data[i + 1] = snapshot[i + 1] * brightness;
    data[i + 2] = snapshot[i + 2] * brightness;
  }
}

// ═══════════════════════════════════════════════════════
//  2. Rainbow Cycle — cycles hue on lit pixels only
// ═══════════════════════════════════════════════════════

function rainbowCycleTick(
  cols: number,
  rows: number,
  data: Uint8ClampedArray,
  frame: number,
) {
  if (!snapshot) return;
  const frameHueOff = (frame * 3) % 360;
  // Clear once, then fill lit pixels only
  data.fill(0);
  for (let r = 0; r < rows; r++) {
    const rowOff = r * cols;
    const rowHue = (r + frameHueOff) % 360; // hue offset for this row
    for (let c = 0; c < cols; c++) {
      const i = (rowOff + c) * 3;
      if (snapshot[i] > 5 || snapshot[i + 1] > 5 || snapshot[i + 2] > 5) {
        const lum =
          (snapshot[i] * 0.299 +
            snapshot[i + 1] * 0.587 +
            snapshot[i + 2] * 0.114) /
          255;
        const hue = (c + rowHue) % 360;
        hslToRgbInto(hue, 100, lum * 50 < 15 ? 15 : lum * 50, data, i);
      }
    }
  }
}

// ═══════════════════════════════════════════════════════
//  3. Scroll Left — scrolls your content leftward (wraps)
// ═══════════════════════════════════════════════════════

function scrollLeftTick(
  cols: number,
  rows: number,
  data: Uint8ClampedArray,
  frame: number,
) {
  const buf = getMarqueeBuffer() || snapshot;
  const bufCols = getMarqueeBuffer() ? getMarqueeBufferCols() : cols;
  if (!buf) return;

  const offset = frame % bufCols;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const srcCol = (c + offset) % bufCols;
      const si = (r * bufCols + srcCol) * 3;
      const di = (r * cols + c) * 3;
      data[di] = buf[si];
      data[di + 1] = buf[si + 1];
      data[di + 2] = buf[si + 2];
    }
  }
}

// ═══════════════════════════════════════════════════════
//  4. Scroll Right — scrolls your content rightward (wraps)
// ═══════════════════════════════════════════════════════

function scrollRightTick(
  cols: number,
  rows: number,
  data: Uint8ClampedArray,
  frame: number,
) {
  const buf = getMarqueeBuffer() || snapshot;
  const bufCols = getMarqueeBuffer() ? getMarqueeBufferCols() : cols;
  if (!buf) return;

  const offset = frame % bufCols;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const srcCol = (((c - offset) % bufCols) + bufCols) % bufCols;
      const si = (r * bufCols + srcCol) * 3;
      const di = (r * cols + c) * 3;
      data[di] = buf[si];
      data[di + 1] = buf[si + 1];
      data[di + 2] = buf[si + 2];
    }
  }
}

// ═══════════════════════════════════════════════════════
//  5. Scroll Up — scrolls your content upward (wraps)
// ═══════════════════════════════════════════════════════

function scrollUpTick(
  cols: number,
  rows: number,
  data: Uint8ClampedArray,
  frame: number,
) {
  if (!snapshot) return;
  const offset = frame % rows;
  const rowBytes = cols * 3;
  // Copy rows in bulk using subarray
  for (let r = 0; r < rows; r++) {
    const srcRow = (r + offset) % rows;
    const si = srcRow * rowBytes;
    const di = r * rowBytes;
    data.set(snapshot.subarray(si, si + rowBytes), di);
  }
}

// ═══════════════════════════════════════════════════════
//  6. Scroll Down — scrolls your content downward (wraps)
// ═══════════════════════════════════════════════════════

function scrollDownTick(
  cols: number,
  rows: number,
  data: Uint8ClampedArray,
  frame: number,
) {
  if (!snapshot) return;
  const offset = frame % rows;
  const rowBytes = cols * 3;
  for (let r = 0; r < rows; r++) {
    const srcRow = (((r - offset) % rows) + rows) % rows;
    const si = srcRow * rowBytes;
    const di = r * rowBytes;
    data.set(snapshot.subarray(si, si + rowBytes), di);
  }
}

// ═══════════════════════════════════════════════════════
//  7. Blink — toggles your drawing on and off
// ═══════════════════════════════════════════════════════

function blinkTick(
  _cols: number,
  _rows: number,
  data: Uint8ClampedArray,
  frame: number,
) {
  if (!snapshot) return;
  const on = Math.floor(frame / 8) % 2 === 0;
  if (on) {
    data.set(snapshot);
  } else {
    data.fill(0);
  }
}

// ═══════════════════════════════════════════════════════
//  7. Glow — radiating glow from each lit pixel
// ═══════════════════════════════════════════════════════

// Scratch arrays reused across glow frames
let _glowLitCols: Int32Array | null = null;
let _glowLitRows: Int32Array | null = null;
let _glowLitCount = 0;

function glowTick(
  cols: number,
  rows: number,
  data: Uint8ClampedArray,
  frame: number,
) {
  if (!snapshot) return;
  const pulse = (Math.sin(frame * 0.12) + 1) / 2;
  const glowRadius = (1 + pulse * 3) | 0;
  const glowRadiusSq = glowRadius * glowRadius;
  const invGlowP1 = 1 / (glowRadius + 1);

  data.fill(0);

  const total = cols * rows;
  // Pre-scan lit pixels into reusable typed arrays
  if (!_glowLitCols || _glowLitCols.length < total) {
    _glowLitCols = new Int32Array(total);
    _glowLitRows = new Int32Array(total);
  }
  _glowLitCount = 0;
  for (let r = 0; r < rows; r++) {
    const rowOff = r * cols;
    for (let c = 0; c < cols; c++) {
      const si = (rowOff + c) * 3;
      if (snapshot[si] > 5 || snapshot[si + 1] > 5 || snapshot[si + 2] > 5) {
        _glowLitCols![_glowLitCount] = c;
        _glowLitRows![_glowLitCount] = r;
        _glowLitCount++;
      }
    }
  }

  // Pre-compute falloff table for integer distances 0..glowRadius
  // Using sqrt of integer squared distances
  const falloffSq = new Float32Array(glowRadiusSq + 1);
  for (let dsq = 0; dsq <= glowRadiusSq; dsq++) {
    const dist = Math.sqrt(dsq);
    if (dist <= glowRadius) {
      falloffSq[dsq] = 1 - dist * invGlowP1;
    }
  }

  for (let k = 0; k < _glowLitCount; k++) {
    const pc = _glowLitCols![k];
    const pr = _glowLitRows![k];
    const si = (pr * cols + pc) * 3;
    const sr = snapshot[si];
    const sg = snapshot[si + 1];
    const sb = snapshot[si + 2];

    const rMin = pr - glowRadius < 0 ? 0 : pr - glowRadius;
    const rMax = pr + glowRadius >= rows ? rows - 1 : pr + glowRadius;
    const cMin = pc - glowRadius < 0 ? 0 : pc - glowRadius;
    const cMax = pc + glowRadius >= cols ? cols - 1 : pc + glowRadius;

    for (let nr = rMin; nr <= rMax; nr++) {
      const dr = nr - pr;
      const dr2 = dr * dr;
      const rowOff2 = nr * cols;
      for (let nc = cMin; nc <= cMax; nc++) {
        const dc = nc - pc;
        const dsq = dr2 + dc * dc;
        if (dsq > glowRadiusSq) continue;

        const falloff = falloffSq[dsq];
        const di = (rowOff2 + nc) * 3;
        // Uint8ClampedArray auto-clamps to [0,255]
        data[di] = data[di] + sr * falloff;
        data[di + 1] = data[di + 1] + sg * falloff;
        data[di + 2] = data[di + 2] + sb * falloff;
      }
    }
  }
}

// ═══════════════════════════════════════════════════════
//  8. Color Wave — washes a rainbow wave over lit pixels
// ═══════════════════════════════════════════════════════

// Reusable per-column hue / wave tables for colorWaveTick
let _cwHueR: Float32Array | null = null;
let _cwHueG: Float32Array | null = null;
let _cwHueB: Float32Array | null = null;
let _cwWave: Float32Array | null = null;

function colorWaveTick(
  cols: number,
  rows: number,
  data: Uint8ClampedArray,
  frame: number,
) {
  if (!snapshot) return;

  // Pre-compute per-column hue colour and wave factor (constant across rows)
  if (!_cwHueR || _cwHueR.length < cols) {
    _cwHueR = new Float32Array(cols);
    _cwHueG = new Float32Array(cols);
    _cwHueB = new Float32Array(cols);
    _cwWave = new Float32Array(cols);
  }
  const f2 = frame * 2;
  for (let c = 0; c < cols; c++) {
    const hue = (c + f2) % 360;
    const rgb = hslToRgb(hue, 100, 50);
    _cwHueR![c] = rgb[0];
    _cwHueG![c] = rgb[1];
    _cwHueB![c] = rgb[2];
    _cwWave![c] = (Math.sin((c - f2) * 0.15) + 1) * 0.5;
  }

  data.fill(0); // clear once
  for (let r = 0; r < rows; r++) {
    const rowOff = r * cols;
    for (let c = 0; c < cols; c++) {
      const i = (rowOff + c) * 3;
      if (snapshot[i] > 5 || snapshot[i + 1] > 5 || snapshot[i + 2] > 5) {
        const w = _cwWave![c];
        const invW = 1 - w;
        data[i] = snapshot[i] * invW + _cwHueR![c] * w;
        data[i + 1] = snapshot[i + 1] * invW + _cwHueG![c] * w;
        data[i + 2] = snapshot[i + 2] * invW + _cwHueB![c] * w;
      }
    }
  }
}

// ═══════════════════════════════════════════════════════
//  9. Sparkle — randomly twinkles lit pixels
// ═══════════════════════════════════════════════════════

function sparkleTick(cols: number, rows: number, data: Uint8ClampedArray) {
  if (!snapshot) return;
  data.set(snapshot);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = (r * cols + c) * 3;
      if (!isLit(snapshot, i)) continue;

      if (random() < 0.08) {
        data[i] = 255;
        data[i + 1] = 255;
        data[i + 2] = 255;
      } else if (random() < 0.05) {
        data[i] = Math.floor(snapshot[i] * 0.3);
        data[i + 1] = Math.floor(snapshot[i + 1] * 0.3);
        data[i + 2] = Math.floor(snapshot[i + 2] * 0.3);
      }
    }
  }
}

// ═══════════════════════════════════════════════════════
//  10. Fade In — reveals drawing pixel by pixel randomly
// ═══════════════════════════════════════════════════════

let fadeOrder: number[] = [];

function fadeInTick(
  cols: number,
  rows: number,
  data: Uint8ClampedArray,
  frame: number,
) {
  if (!snapshot) return;
  const total = cols * rows;

  if (frame === 0 || fadeOrder.length !== total) {
    fadeOrder = Array.from({ length: total }, (_, i) => i);
    for (let i = fadeOrder.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [fadeOrder[i], fadeOrder[j]] = [fadeOrder[j], fadeOrder[i]];
    }
  }

  const speed = Math.max(1, Math.floor(total / 120));
  const revealed = Math.min(total, frame * speed);

  data.fill(0);
  for (let k = 0; k < revealed; k++) {
    const idx = fadeOrder[k] * 3;
    data[idx] = snapshot[idx];
    data[idx + 1] = snapshot[idx + 1];
    data[idx + 2] = snapshot[idx + 2];
  }
}

// ═══════════════════════════════════════════════════════
//  11. Invert Flash — alternates normal and inverted
// ═══════════════════════════════════════════════════════

function invertFlashTick(
  _cols: number,
  _rows: number,
  data: Uint8ClampedArray,
  frame: number,
) {
  if (!snapshot) return;
  const invert = ((frame / 15) | 0) & 1;

  if (!invert) {
    data.set(snapshot);
  } else {
    for (let i = 0, len = data.length; i < len; i += 3) {
      data[i] = 255 - snapshot[i];
      data[i + 1] = 255 - snapshot[i + 1];
      data[i + 2] = 255 - snapshot[i + 2];
    }
  }
}

// ═══════════════════════════════════════════════════════
//  12. Matrix Reveal — rain effect reveals your content
// ═══════════════════════════════════════════════════════

let contentDrops: { y: number; speed: number; len: number }[] = [];

function matrixRevealTick(
  cols: number,
  rows: number,
  data: Uint8ClampedArray,
  frame: number,
) {
  if (!snapshot) return;

  if (frame === 0 || contentDrops.length !== cols) {
    contentDrops = [];
    for (let c = 0; c < cols; c++) {
      contentDrops.push({
        y: randomInt(rows * 2) - rows,
        speed: randomRange(0.3, 1),
        len: 4 + randomInt(Math.max(1, Math.floor(rows * 0.3))),
      });
    }
  }

  // Start with dimmed snapshot — Uint8ClampedArray auto-rounds
  for (let i = 0, len = data.length; i < len; i += 3) {
    data[i] = snapshot[i] * 0.3;
    data[i + 1] = snapshot[i + 1] * 0.3;
    data[i + 2] = snapshot[i + 2] * 0.3;
  }

  for (let c = 0; c < cols; c++) {
    const drop = contentDrops[c];
    drop.y += drop.speed;
    const headRow = Math.floor(drop.y);

    for (let t = 0; t < drop.len; t++) {
      const row = headRow - t;
      if (row < 0 || row >= rows) continue;
      const i = (row * cols + c) * 3;
      const brightness = t === 0 ? 1.5 : Math.max(0.5, 1 - t / drop.len);
      data[i] = Math.min(
        255,
        Math.floor(snapshot[i] * brightness) + (t === 0 ? 40 : 0),
      );
      data[i + 1] = Math.min(
        255,
        Math.floor(snapshot[i + 1] * brightness) + (t === 0 ? 60 : 0),
      );
      data[i + 2] = Math.min(
        255,
        Math.floor(snapshot[i + 2] * brightness) + (t === 0 ? 40 : 0),
      );
    }

    if (headRow - drop.len > rows) {
      drop.y = -randomInt(Math.max(1, Math.floor(rows * 0.3)));
      drop.speed = randomRange(0.3, 1);
      drop.len = 4 + randomInt(Math.max(1, Math.floor(rows * 0.3)));
    }
  }
}

// ═══════════════════════════════════════════════════════
//  13. Replay Draw — replays your strokes in drawing order
// ═══════════════════════════════════════════════════════

let replayEntries: StrokeEntry[] = [];

function replayDrawTick(
  cols: number,
  rows: number,
  data: Uint8ClampedArray,
  frame: number,
) {
  if (frame === 0) {
    replayEntries = strokeRecorder.entries;
  }

  const total = replayEntries.length;
  if (total === 0) {
    // Nothing to replay — just show the snapshot
    if (snapshot) data.set(snapshot);
    return;
  }

  // Replay speed: aim to complete in ~4 seconds at current FPS
  // but always reveal at least 1 entry per frame
  const speed = Math.max(1, Math.floor(total / 120));
  const revealed = Math.min(total, frame * speed);

  // Start from blank
  data.fill(0);

  // Apply entries up to the current reveal point
  for (let k = 0; k < revealed; k++) {
    const e = replayEntries[k];
    if (e.col >= 0 && e.col < cols && e.row >= 0 && e.row < rows) {
      const idx = (e.row * cols + e.col) * 3;
      data[idx] = e.r;
      data[idx + 1] = e.g;
      data[idx + 2] = e.b;
    }
  }
}

// ═══════════════════════════════════════════════════════
//  14. Replay Reverse — plays back strokes in reverse
// ═══════════════════════════════════════════════════════

function replayReverseTick(
  cols: number,
  rows: number,
  data: Uint8ClampedArray,
  frame: number,
) {
  if (frame === 0) {
    replayEntries = strokeRecorder.entries;
  }

  const total = replayEntries.length;
  if (total === 0) {
    if (snapshot) data.set(snapshot);
    return;
  }

  const speed = Math.max(1, Math.floor(total / 120));
  const erased = Math.min(total, frame * speed);

  // Start with full content
  if (snapshot) {
    data.set(snapshot);
  }

  // Erase entries from the end backwards
  for (let k = total - 1; k >= total - erased; k--) {
    const e = replayEntries[k];
    if (e.col >= 0 && e.col < cols && e.row >= 0 && e.row < rows) {
      const idx = (e.row * cols + e.col) * 3;
      data[idx] = 0;
      data[idx + 1] = 0;
      data[idx + 2] = 0;
    }
  }
}

// ═══════════════════════════════════════════════════════
//  Text Marquee — scrolls overflowing text from right to left
// ═══════════════════════════════════════════════════════

export function setMarqueeBuffer(
  runtime: AnimationRuntimeContext,
  buffer: Uint8ClampedArray | null,
  bufferCols: number = 0,
): void {
  runtime.marqueeBuffer = buffer;
  runtime.marqueeBufferCols = buffer ? bufferCols : 0;
}

export function getMarqueeBuffer() { return marqueeBuffer; }
export function getMarqueeBufferCols() { return marqueeBufCols; }

function marqueeTextTick(
  cols: number,
  rows: number,
  data: Uint8ClampedArray,
  frame: number,
) {
  if (!marqueeBuffer || marqueeBufCols === 0) {
    // Fallback: just show snapshot
    if (snapshot) data.set(snapshot);
    return;
  }

  // Scroll offset wraps around the full buffer width
  const offset = frame % marqueeBufCols;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const srcCol = (c + offset) % marqueeBufCols;
      const si = (r * marqueeBufCols + srcCol) * 3;
      const di = (r * cols + c) * 3;
      data[di] = marqueeBuffer[si];
      data[di + 1] = marqueeBuffer[si + 1];
      data[di + 2] = marqueeBuffer[si + 2];
    }
  }
}

// ═══════════════════════════════════════════════════════
//  Animation Registry
// ═══════════════════════════════════════════════════════

export const MARQUEE_ANIMATION: AnimationConfig = {
  name: "Text Marquee",
  fps: 15,
  tick: marqueeTextTick,
};

export const ANIMATIONS: AnimationConfig[] = [
  { name: "Replay Draw", fps: 30, tick: replayDrawTick },
  { name: "Replay Reverse", fps: 30, tick: replayReverseTick },
  { name: "Pulse", fps: 30, tick: pulseTick },
  { name: "Rainbow Cycle", fps: 25, tick: rainbowCycleTick },
  { name: "Scroll Left", fps: 15, tick: scrollLeftTick },
  { name: "Scroll Right", fps: 15, tick: scrollRightTick },
  { name: "Scroll Up", fps: 15, tick: scrollUpTick },
  { name: "Scroll Down", fps: 15, tick: scrollDownTick },
  { name: "Blink", fps: 8, tick: blinkTick },
  { name: "Glow", fps: 20, tick: glowTick },
  { name: "Color Wave", fps: 25, tick: colorWaveTick },
  { name: "Sparkle", fps: 15, tick: sparkleTick },
  { name: "Fade In", fps: 30, tick: fadeInTick },
  { name: "Invert Flash", fps: 10, tick: invertFlashTick },
  { name: "Matrix Reveal", fps: 20, tick: matrixRevealTick },
];
