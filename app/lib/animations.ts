import { AnimationConfig } from "../types";
import { hslToRgb } from "./utils";
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

  for (let i = 0; i < data.length; i += 3) {
    data[i] = Math.floor(snapshot[i] * brightness);
    data[i + 1] = Math.floor(snapshot[i + 1] * brightness);
    data[i + 2] = Math.floor(snapshot[i + 2] * brightness);
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
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = (r * cols + c) * 3;
      if (isLit(snapshot, i)) {
        const lum =
          (snapshot[i] * 0.299 +
            snapshot[i + 1] * 0.587 +
            snapshot[i + 2] * 0.114) /
          255;
        const hue = (c + r + frame * 3) % 360;
        const [rr, gg, bb] = hslToRgb(hue, 100, Math.max(15, lum * 50));
        data[i] = rr;
        data[i + 1] = gg;
        data[i + 2] = bb;
      } else {
        data[i] = 0;
        data[i + 1] = 0;
        data[i + 2] = 0;
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
  for (let r = 0; r < rows; r++) {
    const srcRow = (r + offset) % rows;
    for (let c = 0; c < cols; c++) {
      const si = (srcRow * cols + c) * 3;
      const di = (r * cols + c) * 3;
      data[di] = snapshot[si];
      data[di + 1] = snapshot[si + 1];
      data[di + 2] = snapshot[si + 2];
    }
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
  for (let r = 0; r < rows; r++) {
    const srcRow = (((r - offset) % rows) + rows) % rows;
    for (let c = 0; c < cols; c++) {
      const si = (srcRow * cols + c) * 3;
      const di = (r * cols + c) * 3;
      data[di] = snapshot[si];
      data[di + 1] = snapshot[si + 1];
      data[di + 2] = snapshot[si + 2];
    }
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

function glowTick(
  cols: number,
  rows: number,
  data: Uint8ClampedArray,
  frame: number,
) {
  if (!snapshot) return;
  const pulse = (Math.sin(frame * 0.12) + 1) / 2;
  const glowRadius = 1 + Math.floor(pulse * 3);

  data.fill(0);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const si = (r * cols + c) * 3;
      if (!isLit(snapshot, si)) continue;

      for (let dr = -glowRadius; dr <= glowRadius; dr++) {
        for (let dc = -glowRadius; dc <= glowRadius; dc++) {
          const nr = r + dr;
          const nc = c + dc;
          if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;

          const dist = Math.sqrt(dr * dr + dc * dc);
          if (dist > glowRadius) continue;

          const falloff = 1 - dist / (glowRadius + 1);
          const di = (nr * cols + nc) * 3;

          data[di] = Math.min(
            255,
            data[di] + Math.floor(snapshot[si] * falloff),
          );
          data[di + 1] = Math.min(
            255,
            data[di + 1] + Math.floor(snapshot[si + 1] * falloff),
          );
          data[di + 2] = Math.min(
            255,
            data[di + 2] + Math.floor(snapshot[si + 2] * falloff),
          );
        }
      }
    }
  }
}

// ═══════════════════════════════════════════════════════
//  8. Color Wave — washes a rainbow wave over lit pixels
// ═══════════════════════════════════════════════════════

function colorWaveTick(
  cols: number,
  rows: number,
  data: Uint8ClampedArray,
  frame: number,
) {
  if (!snapshot) return;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = (r * cols + c) * 3;
      if (isLit(snapshot, i)) {
        const wave = (Math.sin((c - frame * 2) * 0.15) + 1) / 2;
        const hue = (c + frame * 2) % 360;
        const [hr, hg, hb] = hslToRgb(hue, 100, 50);
        data[i] = Math.floor(snapshot[i] * (1 - wave) + hr * wave);
        data[i + 1] = Math.floor(snapshot[i + 1] * (1 - wave) + hg * wave);
        data[i + 2] = Math.floor(snapshot[i + 2] * (1 - wave) + hb * wave);
      } else {
        data[i] = 0;
        data[i + 1] = 0;
        data[i + 2] = 0;
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
  const invert = Math.floor(frame / 15) % 2 === 1;

  for (let i = 0; i < data.length; i += 3) {
    if (invert) {
      data[i] = 255 - snapshot[i];
      data[i + 1] = 255 - snapshot[i + 1];
      data[i + 2] = 255 - snapshot[i + 2];
    } else {
      data[i] = snapshot[i];
      data[i + 1] = snapshot[i + 1];
      data[i + 2] = snapshot[i + 2];
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

  // Start with dimmed snapshot
  for (let i = 0; i < data.length; i += 3) {
    data[i] = Math.floor(snapshot[i] * 0.3);
    data[i + 1] = Math.floor(snapshot[i + 1] * 0.3);
    data[i + 2] = Math.floor(snapshot[i + 2] * 0.3);
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
//  14. Replay Loop — replays then restarts continuously
// ═══════════════════════════════════════════════════════

function replayLoopTick(
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
  // Total draw frames + 30 frames of "hold" before looping
  const drawFrames = Math.ceil(total / speed);
  const cycleLen = drawFrames + 30;
  const cycleFrame = frame % cycleLen;
  const revealed = Math.min(total, cycleFrame * speed);

  data.fill(0);
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
//  15. Replay Reverse — plays back strokes in reverse
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
//  Animation Registry
// ═══════════════════════════════════════════════════════

export const ANIMATIONS: AnimationConfig[] = [
  { name: "Replay Draw", fps: 30, tick: replayDrawTick },
  { name: "Replay Loop", fps: 30, tick: replayLoopTick },
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
