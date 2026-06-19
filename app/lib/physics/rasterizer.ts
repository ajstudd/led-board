import { Particle, RGB } from "./types";

/**
 * The pixel ⇄ physics bridge.
 *
 * Tenix stores pixels in a flat RGB Uint8ClampedArray (3 bytes/cell). Physics
 * works in continuous space where a cell (col,row) maps to centre (col+0.5,
 * row+0.5). "pixelize" turns lit cells into particles; "rasterize" snaps
 * particles back onto the grid each frame.
 */

const EMPTY: RGB = [0, 0, 0];

function isLit(r: number, g: number, b: number): boolean {
  return r > 5 || g > 5 || b > 5;
}

/** Visit every lit cell in a grid buffer (row-major, deterministic order). */
export function forEachLitCell(
  data: Uint8ClampedArray,
  cols: number,
  rows: number,
  cb: (col: number, row: number, color: RGB) => void,
): void {
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const i = (row * cols + col) * 3;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      if (isLit(r, g, b)) cb(col, row, [r, g, b]);
    }
  }
}

/**
 * Convert lit cells into particles using the supplied factory (which applies the
 * world's default mass/radius/etc.). Particle position starts at the cell centre.
 */
export function pixelize(
  data: Uint8ClampedArray,
  cols: number,
  rows: number,
  make: (x: number, y: number, color: RGB) => Particle,
  max = Infinity,
): Particle[] {
  const particles: Particle[] = [];
  forEachLitCell(data, cols, rows, (col, row, color) => {
    if (particles.length >= max) return;
    particles.push(make(col + 0.5, row + 0.5, color));
  });
  return particles;
}

/**
 * Write particles back onto the grid. Clears to `background` first, then snaps
 * each particle to floor(position) (cell centres are at +0.5, so floor recovers
 * the cell index). Last writer wins; iterating in stable id order keeps the
 * result flicker-free and deterministic.
 */
export function rasterize(
  particles: Particle[],
  data: Uint8ClampedArray,
  cols: number,
  rows: number,
  background: RGB = EMPTY,
): void {
  for (let i = 0; i < data.length; i += 3) {
    data[i] = background[0];
    data[i + 1] = background[1];
    data[i + 2] = background[2];
  }
  for (const p of particles) {
    const col = Math.floor(p.position.x);
    const row = Math.floor(p.position.y);
    if (col < 0 || col >= cols || row < 0 || row >= rows) continue;
    const idx = (row * cols + col) * 3;
    data[idx] = p.color[0];
    data[idx + 1] = p.color[1];
    data[idx + 2] = p.color[2];
  }
}

/**
 * Like rasterize, but renders an interpolated position between the previous and
 * current physics step (alpha ∈ [0,1]) for smooth display when the render rate
 * exceeds the fixed physics rate.
 */
export function rasterizeInterpolated(
  particles: Particle[],
  data: Uint8ClampedArray,
  cols: number,
  rows: number,
  alpha: number,
  background: RGB = EMPTY,
): void {
  for (let i = 0; i < data.length; i += 3) {
    data[i] = background[0];
    data[i + 1] = background[1];
    data[i + 2] = background[2];
  }
  for (const p of particles) {
    const x = p.prevPosition.x + (p.position.x - p.prevPosition.x) * alpha;
    const y = p.prevPosition.y + (p.position.y - p.prevPosition.y) * alpha;
    const col = Math.floor(x);
    const row = Math.floor(y);
    if (col < 0 || col >= cols || row < 0 || row >= rows) continue;
    const idx = (row * cols + col) * 3;
    data[idx] = p.color[0];
    data[idx + 1] = p.color[1];
    data[idx + 2] = p.color[2];
  }
}
