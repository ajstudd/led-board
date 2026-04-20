import { AnimationConfig } from "../types";
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

// ── Shared snapshot buffer ────────────────────────────
let snapshot: Uint8ClampedArray | null = null;

/** Capture (or update) the content snapshot the animations read from */
export function captureSnapshot(data: Uint8ClampedArray): void {
  if (!snapshot || snapshot.length !== data.length) {
    snapshot = new Uint8ClampedArray(data);
  } else {
    snapshot.set(data);
  }
}

/** Fast single-pixel update — avoids copying the entire buffer */
export function updateSnapshotPixel(
  idx: number,
  r: number,
  g: number,
  b: number,
): void {
  if (!snapshot) return;
  snapshot[idx] = r;
  snapshot[idx + 1] = g;
  snapshot[idx + 2] = b;
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
  if (!snapshot) return;
  const offset = frame % cols;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const srcCol = (c + offset) % cols;
      const si = (r * cols + srcCol) * 3;
      const di = (r * cols + c) * 3;
      data[di] = snapshot[si];
      data[di + 1] = snapshot[si + 1];
      data[di + 2] = snapshot[si + 2];
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
  if (!snapshot) return;
  const offset = frame % cols;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const srcCol = (((c - offset) % cols) + cols) % cols;
      const si = (r * cols + srcCol) * 3;
      const di = (r * cols + c) * 3;
      data[di] = snapshot[si];
      data[di + 1] = snapshot[si + 1];
      data[di + 2] = snapshot[si + 2];
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

      if (Math.random() < 0.08) {
        data[i] = 255;
        data[i + 1] = 255;
        data[i + 2] = 255;
      } else if (Math.random() < 0.05) {
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
      const j = Math.floor(Math.random() * (i + 1));
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
        y: Math.floor(Math.random() * rows * 2) - rows,
        speed: 0.3 + Math.random() * 0.7,
        len: 4 + Math.floor(Math.random() * (rows * 0.3)),
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
      drop.y = -Math.floor(Math.random() * rows * 0.3);
      drop.speed = 0.3 + Math.random() * 0.7;
      drop.len = 4 + Math.floor(Math.random() * (rows * 0.3));
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

/** Wide buffer and its column count, set externally by LEDBoard */
let marqueeBuffer: Uint8ClampedArray | null = null;
let marqueeBufCols = 0;

export function setMarqueeBuffer(
  buffer: Uint8ClampedArray | null,
  bufferCols: number = 0,
): void {
  marqueeBuffer = buffer;
  marqueeBufCols = bufferCols;
}

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
//  15. Matrix Digital Rain — falling green streams
// ═══════════════════════════════════════════════════════

let matrixDrops: { y: number; speed: number; len: number; brightness: number }[] = [];

function matrixRainTick(
  cols: number,
  rows: number,
  data: Uint8ClampedArray,
  frame: number,
) {
  if (frame === 0 || matrixDrops.length !== cols) {
    matrixDrops = [];
    for (let c = 0; c < cols; c++) {
      matrixDrops.push({
        y: -Math.floor(Math.random() * rows),
        speed: 0.3 + Math.random() * 0.8,
        len: 5 + Math.floor(Math.random() * (rows * 0.4)),
        brightness: 0.6 + Math.random() * 0.4,
      });
    }
  }

  // Fade previous frame (creates trailing afterglow)
  for (let i = 0, len = data.length; i < len; i += 3) {
    data[i] = Math.floor(data[i] * 0.85);
    data[i + 1] = Math.floor(data[i + 1] * 0.85);
    data[i + 2] = Math.floor(data[i + 2] * 0.85);
  }

  for (let c = 0; c < cols; c++) {
    const drop = matrixDrops[c];
    drop.y += drop.speed;
    const headRow = Math.floor(drop.y);

    for (let t = 0; t < drop.len; t++) {
      const row = headRow - t;
      if (row < 0 || row >= rows) continue;
      const i = (row * cols + c) * 3;

      if (t === 0) {
        // Bright white head
        data[i] = 200;
        data[i + 1] = 255;
        data[i + 2] = 200;
      } else {
        // Green tail that fades
        const tailFade = Math.max(0, 1 - t / drop.len) * drop.brightness;
        const g = Math.floor(180 * tailFade);
        const r = Math.floor(20 * tailFade);
        // Only write if brighter than current
        if (g > data[i + 1]) {
          data[i] = r;
          data[i + 1] = g;
          data[i + 2] = 0;
        }
      }
    }

    // Reset when fully off screen
    if (headRow - drop.len > rows) {
      drop.y = -Math.floor(Math.random() * rows * 0.5);
      drop.speed = 0.3 + Math.random() * 0.8;
      drop.len = 5 + Math.floor(Math.random() * (rows * 0.4));
      drop.brightness = 0.6 + Math.random() * 0.4;
    }
  }
}

// ═══════════════════════════════════════════════════════
//  16. Conway's Game of Life (Premium — smooth glow)
// ═══════════════════════════════════════════════════════

let lifeState: Float32Array | null = null;
let lifeNext: Float32Array | null = null;

function gameOfLifeTick(
  cols: number,
  rows: number,
  data: Uint8ClampedArray,
  frame: number,
) {
  const total = cols * rows;

  if (frame === 0 || !lifeState || lifeState.length !== total) {
    // Seed from snapshot (lit pixel = alive) or random
    lifeState = new Float32Array(total);
    lifeNext = new Float32Array(total);
    if (snapshot) {
      for (let i = 0; i < total; i++) {
        const si = i * 3;
        lifeState[i] = (snapshot[si] > 30 || snapshot[si + 1] > 30 || snapshot[si + 2] > 30) ? 1.0 : 0.0;
      }
    } else {
      for (let i = 0; i < total; i++) {
        lifeState[i] = Math.random() > 0.7 ? 1.0 : 0.0;
      }
    }
  }

  if (!lifeNext) lifeNext = new Float32Array(total);

  // Apply Game of Life rules every 3rd frame for visibility
  if (frame % 3 === 0) {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        let neighbors = 0;
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const nr = (r + dr + rows) % rows;
            const nc = (c + dc + cols) % cols;
            if (lifeState![nr * cols + nc] > 0.5) neighbors++;
          }
        }
        const idx = r * cols + c;
        const alive = lifeState![idx] > 0.5;
        if (alive) {
          lifeNext![idx] = (neighbors === 2 || neighbors === 3) ? 1.0 : lifeState![idx] - 0.15;
        } else {
          lifeNext![idx] = (neighbors === 3) ? 0.2 : lifeState![idx] - 0.05;
        }
        lifeNext![idx] = Math.max(0, Math.min(1, lifeNext![idx]));
      }
    }
    // Swap
    const tmp = lifeState;
    lifeState = lifeNext;
    lifeNext = tmp;
  } else {
    // Smooth transition frames — nudge values toward target
    for (let i = 0; i < total; i++) {
      const target = lifeState![i] > 0.5 ? 1.0 : 0.0;
      lifeState![i] += (target - lifeState![i]) * 0.3;
    }
  }

  // Render with premium glow colors
  const hueBase = (frame * 0.5) % 360;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      const val = lifeState![idx];
      const di = idx * 3;
      if (val > 0.01) {
        const hue = (hueBase + c * 0.5 + r * 0.3) % 360;
        const rgb = hslToRgb(hue, 90, 30 + val * 25);
        data[di] = rgb[0] * val;
        data[di + 1] = rgb[1] * val;
        data[di + 2] = rgb[2] * val;
      } else {
        data[di] = 0;
        data[di + 1] = 0;
        data[di + 2] = 0;
      }
    }
  }
}

// ═══════════════════════════════════════════════════════
//  17. Fluid Dynamics (Smoke/Ink) — simplified 2D fluid
// ═══════════════════════════════════════════════════════

let fluidDensity: Float32Array | null = null;
let fluidVx: Float32Array | null = null;
let fluidVy: Float32Array | null = null;

function fluidTick(
  cols: number,
  rows: number,
  data: Uint8ClampedArray,
  frame: number,
) {
  const total = cols * rows;

  if (frame === 0 || !fluidDensity || fluidDensity.length !== total) {
    fluidDensity = new Float32Array(total);
    fluidVx = new Float32Array(total);
    fluidVy = new Float32Array(total);
    // Seed from snapshot if available
    if (snapshot) {
      for (let i = 0; i < total; i++) {
        const si = i * 3;
        fluidDensity[i] = (snapshot[si] + snapshot[si + 1] + snapshot[si + 2]) / (255 * 3);
      }
    }
  }

  if (!fluidVx || !fluidVy) return;

  // Add ink sources — rotating emitters
  const cx = cols / 2;
  const cy = rows / 2;
  const angle = frame * 0.05;
  const srcX = Math.floor(cx + Math.cos(angle) * cols * 0.2);
  const srcY = Math.floor(cy + Math.sin(angle) * rows * 0.2);
  if (srcX >= 1 && srcX < cols - 1 && srcY >= 1 && srcY < rows - 1) {
    const si = srcY * cols + srcX;
    fluidDensity[si] = Math.min(1, fluidDensity[si] + 0.5);
    fluidVx[si] = Math.cos(angle + 1.5) * 2;
    fluidVy[si] = Math.sin(angle + 1.5) * 2;
  }

  // Simple advection + diffusion step
  const newDensity = new Float32Array(total);
  for (let r = 1; r < rows - 1; r++) {
    for (let c = 1; c < cols - 1; c++) {
      const idx = r * cols + c;

      // Advect: backtrace
      const srcR = r - fluidVy[idx] * 0.5;
      const srcC = c - fluidVx[idx] * 0.5;
      const sr = Math.max(1, Math.min(rows - 2, srcR));
      const sc = Math.max(1, Math.min(cols - 2, srcC));
      const ir = Math.floor(sr);
      const ic = Math.floor(sc);
      const fr = sr - ir;
      const fc = sc - ic;

      // Bilinear interpolation
      newDensity[idx] =
        fluidDensity[ir * cols + ic] * (1 - fr) * (1 - fc) +
        fluidDensity[ir * cols + ic + 1] * (1 - fr) * fc +
        fluidDensity[(ir + 1) * cols + ic] * fr * (1 - fc) +
        fluidDensity[(ir + 1) * cols + ic + 1] * fr * fc;

      // Diffuse neighboring velocities
      fluidVx[idx] *= 0.99;
      fluidVy[idx] *= 0.99;
      fluidVx[idx] += (fluidVx[idx - 1] + fluidVx[idx + 1]) * 0.01;
      fluidVy[idx] += (fluidVy[idx - cols] + fluidVy[idx + cols]) * 0.01;

      // Slight decay
      newDensity[idx] *= 0.995;
    }
  }
  fluidDensity.set(newDensity);

  // Render with premium colors
  for (let i = 0; i < total; i++) {
    const d = fluidDensity[i];
    const di = i * 3;
    if (d > 0.01) {
      const hue = (200 + d * 160) % 360; // cyan → magenta gradient
      const rgb = hslToRgb(hue, 80, Math.min(50, d * 60));
      data[di] = rgb[0];
      data[di + 1] = rgb[1];
      data[di + 2] = rgb[2];
    } else {
      data[di] = 0;
      data[di + 1] = 0;
      data[di + 2] = 0;
    }
  }
}

// ═══════════════════════════════════════════════════════
//  18. Audio Equalizer (Simulated) — bouncing bars
// ═══════════════════════════════════════════════════════

let eqPeaks: number[] = [];
let eqPeakFall: number[] = [];

function equalizerTick(
  cols: number,
  rows: number,
  data: Uint8ClampedArray,
  frame: number,
) {
  if (frame === 0 || eqPeaks.length !== cols) {
    eqPeaks = new Array(cols).fill(0);
    eqPeakFall = new Array(cols).fill(0);
  }

  data.fill(0);

  for (let c = 0; c < cols; c++) {
    // Simulated audio: multiple sine oscillators for organic feel
    const base = Math.sin(c * 0.3 + frame * 0.12) * 0.3 +
                 Math.sin(c * 0.7 - frame * 0.08) * 0.25 +
                 Math.sin(c * 0.15 + frame * 0.2) * 0.2 +
                 Math.sin(frame * 0.05 + c * 0.5) * 0.25;
    const height = Math.floor(Math.max(0, (base + 1) * 0.5) * rows * 0.85);

    // Update peak
    if (height > eqPeaks[c]) {
      eqPeaks[c] = height;
      eqPeakFall[c] = 0;
    } else {
      eqPeakFall[c] += 0.15;
      eqPeaks[c] = Math.max(0, eqPeaks[c] - eqPeakFall[c]);
    }

    // Draw bar (bottom-up)
    for (let h = 0; h < height && h < rows; h++) {
      const row = rows - 1 - h;
      const i = (row * cols + c) * 3;
      const ratio = h / rows;

      if (ratio < 0.5) {
        // Green zone
        const g = 80 + Math.floor(ratio * 2 * 175);
        data[i] = 0;
        data[i + 1] = g;
        data[i + 2] = 0;
      } else if (ratio < 0.8) {
        // Yellow zone
        const t = (ratio - 0.5) / 0.3;
        data[i] = Math.floor(200 * t + 50);
        data[i + 1] = Math.floor(200 - 50 * t);
        data[i + 2] = 0;
      } else {
        // Red zone
        data[i] = 255;
        data[i + 1] = Math.floor(50 * (1 - (ratio - 0.8) / 0.2));
        data[i + 2] = 0;
      }
    }

    // Draw floating peak pixel
    const peakRow = rows - 1 - Math.floor(eqPeaks[c]);
    if (peakRow >= 0 && peakRow < rows) {
      const pi = (peakRow * cols + c) * 3;
      data[pi] = 255;
      data[pi + 1] = 255;
      data[pi + 2] = 255;
    }
  }
}

// ═══════════════════════════════════════════════════════
//  19. Warp Speed (Hyperspace) — radial starfield
// ═══════════════════════════════════════════════════════

let warpStars: { x: number; y: number; z: number; prevX: number; prevY: number }[] = [];

function warpSpeedTick(
  cols: number,
  rows: number,
  data: Uint8ClampedArray,
  frame: number,
) {
  const numStars = 200;
  const cx = cols / 2;
  const cy = rows / 2;

  if (frame === 0 || warpStars.length !== numStars) {
    warpStars = [];
    for (let i = 0; i < numStars; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.random() * 0.5;
      warpStars.push({
        x: Math.cos(angle) * dist,
        y: Math.sin(angle) * dist,
        z: Math.random(),
        prevX: Math.cos(angle) * dist,
        prevY: Math.sin(angle) * dist,
      });
    }
  }

  // Fade previous frame for motion blur trails
  for (let i = 0, len = data.length; i < len; i += 3) {
    data[i] = Math.floor(data[i] * 0.7);
    data[i + 1] = Math.floor(data[i + 1] * 0.7);
    data[i + 2] = Math.floor(data[i + 2] * 0.75);
  }

  // Speed accelerates over time
  const speed = 0.01 + frame * 0.0005;

  for (let i = 0; i < numStars; i++) {
    const star = warpStars[i];
    star.prevX = star.x;
    star.prevY = star.y;

    // Move star radially outward
    star.z -= speed;
    if (star.z <= 0.01) {
      // Reset star to center
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.random() * 0.1;
      star.x = Math.cos(angle) * dist;
      star.y = Math.sin(angle) * dist;
      star.z = 1;
      star.prevX = star.x;
      star.prevY = star.y;
      continue;
    }

    // Project to screen
    const screenX = Math.floor(cx + (star.x / star.z) * cols * 0.5);
    const screenY = Math.floor(cy + (star.y / star.z) * rows * 0.5);
    const prevScreenX = Math.floor(cx + (star.prevX / (star.z + speed)) * cols * 0.5);
    const prevScreenY = Math.floor(cy + (star.prevY / (star.z + speed)) * rows * 0.5);

    // Brightness increases as star gets closer
    const brightness = Math.min(255, Math.floor((1 - star.z) * 300));

    // Draw line from prev to current (Bresenham-ish)
    const dx = screenX - prevScreenX;
    const dy = screenY - prevScreenY;
    const steps = Math.max(Math.abs(dx), Math.abs(dy), 1);
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const px = Math.floor(prevScreenX + dx * t);
      const py = Math.floor(prevScreenY + dy * t);
      if (px >= 0 && px < cols && py >= 0 && py < rows) {
        const pi = (py * cols + px) * 3;
        // Blue-white color for hyperspace
        data[pi] = Math.min(255, data[pi] + Math.floor(brightness * 0.7));
        data[pi + 1] = Math.min(255, data[pi + 1] + Math.floor(brightness * 0.8));
        data[pi + 2] = Math.min(255, data[pi + 2] + brightness);
      }
    }
  }
}

// ═══════════════════════════════════════════════════════
//  20. Lava Lamp (Perlin Plasma) — smooth drifting blobs
// ═══════════════════════════════════════════════════════

function lavaLampTick(
  cols: number,
  rows: number,
  data: Uint8ClampedArray,
  frame: number,
) {
  const time = frame * 0.04;
  const scaleX = 0.08;
  const scaleY = 0.08;

  for (let r = 0; r < rows; r++) {
    const y = r * scaleY;
    for (let c = 0; c < cols; c++) {
      const x = c * scaleX;
      const i = (r * cols + c) * 3;

      // Multi-octave sine noise (approximating Perlin)
      const n1 = Math.sin(x * 1.0 + time) * Math.cos(y * 1.3 - time * 0.7);
      const n2 = Math.sin(x * 2.1 - time * 1.3 + y * 0.7) * 0.5;
      const n3 = Math.sin((x + y) * 0.8 + time * 0.5) * Math.cos(x * 0.6 - y * 1.1 + time * 0.8) * 0.3;
      const n4 = Math.sin(x * 3.0 + y * 2.5 - time * 2.0) * 0.15;

      const noise = (n1 + n2 + n3 + n4 + 1.95) / 3.9; // Normalize to ~0..1

      // Premium color palette: deep purple → magenta → cyan → blue
      let r_c: number, g_c: number, b_c: number;
      if (noise < 0.35) {
        // Deep purple
        const t = noise / 0.35;
        r_c = 30 + t * 70;
        g_c = 5 + t * 10;
        b_c = 60 + t * 80;
      } else if (noise < 0.55) {
        // Magenta
        const t = (noise - 0.35) / 0.2;
        r_c = 100 + t * 155;
        g_c = 15 + t * 30;
        b_c = 140 - t * 40;
      } else if (noise < 0.75) {
        // Cyan
        const t = (noise - 0.55) / 0.2;
        r_c = 255 - t * 200;
        g_c = 45 + t * 180;
        b_c = 100 + t * 155;
      } else {
        // Bright blue-white
        const t = (noise - 0.75) / 0.25;
        r_c = 55 + t * 100;
        g_c = 225 - t * 50;
        b_c = 255;
      }

      data[i] = Math.min(255, Math.floor(r_c));
      data[i + 1] = Math.min(255, Math.floor(g_c));
      data[i + 2] = Math.min(255, Math.floor(b_c));
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
  { name: "Matrix Rain", fps: 25, tick: matrixRainTick },
  { name: "Game of Life", fps: 15, tick: gameOfLifeTick },
  { name: "Fluid Ink", fps: 30, tick: fluidTick },
  { name: "Equalizer", fps: 30, tick: equalizerTick },
  { name: "Warp Speed", fps: 30, tick: warpSpeedTick },
  { name: "Lava Lamp", fps: 25, tick: lavaLampTick },
];

