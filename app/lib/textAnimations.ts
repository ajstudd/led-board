import { AnimationConfig } from "../types";
import { getMarqueeBuffer, getMarqueeBufferCols, MARQUEE_ANIMATION } from "./animations";
import { hslToRgb } from "./utils";

// ═══════════════════════════════════════════════════════
//  Typewriter Animation — reveals columns over time
// ═══════════════════════════════════════════════════════

function typewriterTick(
  cols: number,
  rows: number,
  data: Uint8ClampedArray,
  frame: number,
) {
  const buf = getMarqueeBuffer();
  const bufCols = getMarqueeBufferCols();
  if (!buf || bufCols === 0) return;

  // Reveal 1 column per frame
  const revealCols = Math.min(frame, bufCols);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const di = (r * cols + c) * 3;
      if (c < revealCols) {
        // Read from buffer (buffer may be longer than cols, but we just draw what fits)
        const si = (r * bufCols + c) * 3;
        data[di] = buf[si];
        data[di + 1] = buf[si + 1];
        data[di + 2] = buf[si + 2];
      } else {
        // Not revealed yet — just clear or leave whatever was in the base grid
        // Actually, we should probably clear it because background might have stuff
        // Wait, text could have a background pattern. If we clear it, we erase the pattern!
        // To preserve pattern, we should only draw pixels if revealed AND not black,
        // or just let the base grid show through by not painting.
        // If not revealed, we do nothing (so the base snapshot remains).
      }
    }
  }
}

export const TYPEWRITER_ANIMATION: AnimationConfig = {
  name: "Typewriter",
  fps: 15,
  tick: typewriterTick,
};

// ═══════════════════════════════════════════════════════
//  Blink Animation — flashes the text on and off
// ═══════════════════════════════════════════════════════

function blinkTick(
  cols: number,
  rows: number,
  data: Uint8ClampedArray,
  frame: number,
) {
  const buf = getMarqueeBuffer();
  const bufCols = getMarqueeBufferCols();
  if (!buf || bufCols === 0) return;

  // Blink every 10 frames
  const show = Math.floor(frame / 10) % 2 === 0;

  if (show) {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const di = (r * cols + c) * 3;
        if (c < bufCols) {
          const si = (r * bufCols + c) * 3;
          // Overlay if not black
          if (buf[si] > 0 || buf[si + 1] > 0 || buf[si + 2] > 0) {
            data[di] = buf[si];
            data[di + 1] = buf[si + 1];
            data[di + 2] = buf[si + 2];
          }
        }
      }
    }
  }
}

export const BLINK_ANIMATION: AnimationConfig = {
  name: "Blink Text",
  fps: 20,
  tick: blinkTick,
};

// ═══════════════════════════════════════════════════════
//  Rainbow Shift Animation — shifts hue of text pixels
// ═══════════════════════════════════════════════════════

function rainbowTextTick(
  cols: number,
  rows: number,
  data: Uint8ClampedArray,
  frame: number,
) {
  const buf = getMarqueeBuffer();
  const bufCols = getMarqueeBufferCols();
  if (!buf || bufCols === 0) return;

  const baseHue = (frame * 5) % 360;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const di = (r * cols + c) * 3;
      if (c < bufCols) {
        const si = (r * bufCols + c) * 3;
        // Check if text pixel exists (not black)
        if (buf[si] > 0 || buf[si + 1] > 0 || buf[si + 2] > 0) {
          const hue = (baseHue + c * 2) % 360;
          const [nr, ng, nb] = hslToRgb(hue, 100, 50);
          data[di] = nr;
          data[di + 1] = ng;
          data[di + 2] = nb;
        }
      }
    }
  }
}

export const RAINBOW_TEXT_ANIMATION: AnimationConfig = {
  name: "Rainbow Text",
  fps: 20,
  tick: rainbowTextTick,
};

export const TEXT_ANIMATIONS: AnimationConfig[] = [
  MARQUEE_ANIMATION,
  TYPEWRITER_ANIMATION,
  BLINK_ANIMATION,
  RAINBOW_TEXT_ANIMATION,
];
