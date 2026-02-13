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
  /** Flat byte index into the data array (row * cols + col) * 3 */
  idx: number;
  r: number;
  g: number;
  b: number;
}

class StrokeRecorder {
  private _entries: StrokeEntry[] = [];
  private _recording = true;

  /** Push a single pixel change */
  record(idx: number, r: number, g: number, b: number): void {
    if (!this._recording) return;
    this._entries.push({ idx, r, g, b });
  }

  /** Push many pixels at once (e.g. flood-fill, pattern, text).
   *  `before` is the data BEFORE the operation, `after` is AFTER.
   *  Only changed pixels are recorded, preserving visual order
   *  (top-left to bottom-right scan). */
  recordBulk(before: Uint8ClampedArray, after: Uint8ClampedArray): void {
    if (!this._recording) return;
    for (let i = 0; i < after.length; i += 3) {
      if (
        before[i] !== after[i] ||
        before[i + 1] !== after[i + 1] ||
        before[i + 2] !== after[i + 2]
      ) {
        this._entries.push({
          idx: i,
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
}

/** Singleton instance shared across the app */
export const strokeRecorder = new StrokeRecorder();
