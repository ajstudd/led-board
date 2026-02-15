import {
  FONT,
  CHAR_WIDTH,
  CHAR_HEIGHT,
  CHAR_SPACING,
  measureText,
} from "./font";

/**
 * StrokeRecorder — records every pixel change the user makes
 * in drawing order, so the "Replay Draw" animation can play
 * them back exactly as drawn, stroke by stroke.
 *
 * Each entry stores: cell index (flat), and R/G/B colour.
 * Duplicate-index entries are kept because the user might draw
 * over the same cell more than once — replay should show that.
 */

export interface StrokeEntry {
  /** Grid column (dimension-independent, survives resize) */
  col: number;
  /** Grid row (dimension-independent, survives resize) */
  row: number;
  r: number;
  g: number;
  b: number;
}

class StrokeRecorder {
  private _entries: StrokeEntry[] = [];
  private _recording = true;

  /** Push a single pixel change */
  record(col: number, row: number, r: number, g: number, b: number): void {
    if (!this._recording) return;
    this._entries.push({ col, row, r, g, b });
  }

  /** Push many pixels at once (e.g. flood-fill, pattern, text).
   *  `before` is the data BEFORE the operation, `after` is AFTER.
   *  `cols` is the current grid column count (needed to derive col/row). */
  recordBulk(
    before: Uint8ClampedArray,
    after: Uint8ClampedArray,
    cols: number,
  ): void {
    if (!this._recording) return;
    for (let i = 0; i < after.length; i += 3) {
      if (
        before[i] !== after[i] ||
        before[i + 1] !== after[i + 1] ||
        before[i + 2] !== after[i + 2]
      ) {
        const pixelIdx = i / 3;
        this._entries.push({
          col: pixelIdx % cols,
          row: Math.floor(pixelIdx / cols),
          r: after[i],
          g: after[i + 1],
          b: after[i + 2],
        });
      }
    }
  }

  /** Get a snapshot of all recorded entries */
  get entries(): StrokeEntry[] {
    return this._entries;
  }

  /** Number of recorded pixel changes */
  get length(): number {
    return this._entries.length;
  }

  /** Whether recording is active */
  get recording(): boolean {
    return this._recording;
  }

  /** Pause recording (e.g. while an animation is running) */
  pause(): void {
    this._recording = false;
  }

  /** Resume recording */
  resume(): void {
    this._recording = true;
  }

  /** Clear all recorded data */
  clear(): void {
    this._entries = [];
  }

  /**
   * Record text rendering character-by-character in typing order.
   * Each character's lit pixels are grouped together so replay
   * shows letters appearing one at a time, left to right.
   */
  recordText(
    text: string,
    cols: number,
    rows: number,
    color: [number, number, number],
    scale: number = 1,
    centered: boolean = true,
  ): void {
    if (!this._recording) return;

    const charW = CHAR_WIDTH * scale;
    const charH = CHAR_HEIGHT * scale;
    const textWidth = measureText(text, scale);

    let startCol: number;
    let startRow: number;
    if (centered) {
      startCol = Math.max(0, Math.floor((cols - textWidth) / 2));
      startRow = Math.max(0, Math.floor((rows - charH) / 2));
    } else {
      startCol = 0;
      startRow = 0;
    }

    let curCol = startCol;
    let curRow = startRow;

    for (const ch of text) {
      // Wrap to next line if we'd overflow
      if (curCol + charW > cols) {
        curCol = startCol;
        curRow += charH + scale;
      }
      // Stop if we'd overflow vertically
      if (curRow + charH > rows) break;

      const glyph = FONT[ch.toUpperCase()] ?? FONT["?"];
      if (glyph) {
        // Record each lit pixel of this character
        for (let gr = 0; gr < CHAR_HEIGHT; gr++) {
          const rowBits = glyph[gr];
          for (let gc = 0; gc < CHAR_WIDTH; gc++) {
            const bit = (rowBits >> (CHAR_WIDTH - 1 - gc)) & 1;
            if (bit) {
              for (let sy = 0; sy < scale; sy++) {
                for (let sx = 0; sx < scale; sx++) {
                  const c = curCol + gc * scale + sx;
                  const r = curRow + gr * scale + sy;
                  if (c >= 0 && c < cols && r >= 0 && r < rows) {
                    this._entries.push({
                      col: c,
                      row: r,
                      r: color[0],
                      g: color[1],
                      b: color[2],
                    });
                  }
                }
              }
            }
          }
        }
      }

      curCol += (CHAR_WIDTH + CHAR_SPACING) * scale;
    }
  }
}

/** Singleton instance shared across the app */
export const strokeRecorder = new StrokeRecorder();
