import { RGB, GridDimensions, DEFAULT_CELL_SIZE } from "../types";
import { rgbEqual } from "./utils";

/**
 * GridManager — manages the LED grid data model.
 *
 * Stores colour data in a flat Uint8ClampedArray for performance.
 * Each cell occupies 3 consecutive bytes (R, G, B).
 */
export class GridManager {
  private _data: Uint8ClampedArray;
  private _cols: number;
  private _rows: number;
  private _cellSize: number;

  constructor(
    viewportWidth: number,
    viewportHeight: number,
    cellSize: number = DEFAULT_CELL_SIZE,
  ) {
    this._cellSize = cellSize;
    this._cols = Math.floor(viewportWidth / cellSize);
    this._rows = Math.floor(viewportHeight / cellSize);
    this._data = new Uint8ClampedArray(this._cols * this._rows * 3);
  }

  // ── Getters ────────────────────────────────────────────

  get cols(): number {
    return this._cols;
  }

  get rows(): number {
    return this._rows;
  }

  get cellSize(): number {
    return this._cellSize;
  }

  get data(): Uint8ClampedArray {
    return this._data;
  }

  get dimensions(): GridDimensions {
    return {
      cols: this._cols,
      rows: this._rows,
      cellSize: this._cellSize,
      width: this._cols * this._cellSize,
      height: this._rows * this._cellSize,
    };
  }

  // ── Cell Operations ────────────────────────────────────

  /** Get the flat-array index for a cell */
  private _index(col: number, row: number): number {
    return (row * this._cols + col) * 3;
  }

  /** Check if coordinates are within bounds */
  inBounds(col: number, row: number): boolean {
    return col >= 0 && col < this._cols && row >= 0 && row < this._rows;
  }

  /** Set a single cell's colour */
  setCell(col: number, row: number, color: RGB): void {
    if (!this.inBounds(col, row)) return;
    const i = this._index(col, row);
    this._data[i] = color[0];
    this._data[i + 1] = color[1];
    this._data[i + 2] = color[2];
  }

  /** Get a single cell's colour */
  getCell(col: number, row: number): RGB {
    if (!this.inBounds(col, row)) return [0, 0, 0];
    const i = this._index(col, row);
    return [this._data[i], this._data[i + 1], this._data[i + 2]];
  }

  /** Clear the entire grid (set all cells to black) */
  clear(): void {
    this._data.fill(0);
  }

  /** Fill the entire grid with a single colour */
  fill(color: RGB): void {
    for (let i = 0; i < this._data.length; i += 3) {
      this._data[i] = color[0];
      this._data[i + 1] = color[1];
      this._data[i + 2] = color[2];
    }
  }

  /** Resize the grid for new viewport dimensions, discarding old data */
  resize(viewportWidth: number, viewportHeight: number): void {
    this._cols = Math.floor(viewportWidth / this._cellSize);
    this._rows = Math.floor(viewportHeight / this._cellSize);
    this._data = new Uint8ClampedArray(this._cols * this._rows * 3);
  }

  /** Resize the grid, preserving as much existing data as possible */
  resizePreserve(viewportWidth: number, viewportHeight: number): void {
    const newCols = Math.floor(viewportWidth / this._cellSize);
    const newRows = Math.floor(viewportHeight / this._cellSize);

    // No-op if dimensions haven't changed (avoids creating a new data array
    // that would silently invalidate external references like AnimationManager).
    if (newCols === this._cols && newRows === this._rows) return;

    const newData = new Uint8ClampedArray(newCols * newRows * 3);

    const copyRows = Math.min(this._rows, newRows);
    const copyCols = Math.min(this._cols, newCols);

    for (let r = 0; r < copyRows; r++) {
      for (let c = 0; c < copyCols; c++) {
        const oldI = (r * this._cols + c) * 3;
        const newI = (r * newCols + c) * 3;
        newData[newI] = this._data[oldI];
        newData[newI + 1] = this._data[oldI + 1];
        newData[newI + 2] = this._data[oldI + 2];
      }
    }

    this._cols = newCols;
    this._rows = newRows;
    this._data = newData;
  }

  /** Change the cell size and resize the grid, preserving existing data */
  resizeCellSize(
    viewportWidth: number,
    viewportHeight: number,
    newCellSize: number,
  ): void {
    this._cellSize = newCellSize;
    const newCols = Math.floor(viewportWidth / newCellSize);
    const newRows = Math.floor(viewportHeight / newCellSize);

    if (newCols === this._cols && newRows === this._rows) return;

    const newData = new Uint8ClampedArray(newCols * newRows * 3);

    const copyRows = Math.min(this._rows, newRows);
    const copyCols = Math.min(this._cols, newCols);

    for (let r = 0; r < copyRows; r++) {
      for (let c = 0; c < copyCols; c++) {
        const oldI = (r * this._cols + c) * 3;
        const newI = (r * newCols + c) * 3;
        newData[newI] = this._data[oldI];
        newData[newI + 1] = this._data[oldI + 1];
        newData[newI + 2] = this._data[oldI + 2];
      }
    }

    this._cols = newCols;
    this._rows = newRows;
    this._data = newData;
  }

  /** Replace the internal data buffer (e.g. when loading from JSON) */
  loadData(data: Uint8ClampedArray): void {
    if (data.length === this._data.length) {
      this._data.set(data);
    }
  }

  /** Clone the current data buffer */
  cloneData(): Uint8ClampedArray {
    return new Uint8ClampedArray(this._data);
  }

  /** Flood-fill from (col, row) with the given colour */
  floodFill(col: number, row: number, fillColor: RGB): void {
    if (!this.inBounds(col, row)) return;

    const targetColor = this.getCell(col, row);
    if (rgbEqual(targetColor, fillColor)) return;

    const stack: [number, number][] = [[col, row]];

    while (stack.length > 0) {
      const [c, r] = stack.pop()!;
      if (!this.inBounds(c, r)) continue;

      const current = this.getCell(c, r);
      if (!rgbEqual(current, targetColor)) continue;

      this.setCell(c, r, fillColor);

      stack.push([c + 1, r]);
      stack.push([c - 1, r]);
      stack.push([c, r + 1]);
      stack.push([c, r - 1]);
    }
  }

  /** Draw a line from (c1, r1) to (c2, r2) using Bresenham's algorithm */
  drawLine(c1: number, r1: number, c2: number, r2: number, color: RGB): void {
    let x0 = c1, y0 = r1;
    const x1 = c2, y1 = r2;
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;

    for (;;) {
      this.setCell(x0, y0, color);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x0 += sx; }
      if (e2 < dx) { err += dx; y0 += sy; }
    }
  }

  /** Draw an axis-aligned rectangle outline between two corner cells */
  drawRect(c1: number, r1: number, c2: number, r2: number, color: RGB): void {
    const minC = Math.min(c1, c2);
    const maxC = Math.max(c1, c2);
    const minR = Math.min(r1, r2);
    const maxR = Math.max(r1, r2);

    // Top and bottom edges
    for (let c = minC; c <= maxC; c++) {
      this.setCell(c, minR, color);
      this.setCell(c, maxR, color);
    }
    // Left and right edges (skip corners already drawn)
    for (let r = minR + 1; r < maxR; r++) {
      this.setCell(minC, r, color);
      this.setCell(maxC, r, color);
    }
  }

  /** Draw an ellipse outline inscribed in the bounding box of two corner cells */
  drawEllipse(c1: number, r1: number, c2: number, r2: number, color: RGB): void {
    const minC = Math.min(c1, c2);
    const maxC = Math.max(c1, c2);
    const minR = Math.min(r1, r2);
    const maxR = Math.max(r1, r2);

    // Centre and radii (in cell coordinates)
    const cx = (minC + maxC) / 2;
    const cy = (minR + maxR) / 2;
    const rx = (maxC - minC) / 2;
    const ry = (maxR - minR) / 2;

    if (rx < 0.5 && ry < 0.5) {
      // Degenerate: single cell
      this.setCell(Math.round(cx), Math.round(cy), color);
      return;
    }

    // Midpoint ellipse algorithm
    const rx2 = rx * rx;
    const ry2 = ry * ry;

    // Plot four symmetric points
    const plot4 = (px: number, py: number) => {
      this.setCell(Math.round(cx + px), Math.round(cy + py), color);
      this.setCell(Math.round(cx - px), Math.round(cy + py), color);
      this.setCell(Math.round(cx + px), Math.round(cy - py), color);
      this.setCell(Math.round(cx - px), Math.round(cy - py), color);
    };

    // Region 1: dy/dx < 1
    let x = 0, y = ry;
    let d1 = ry2 - rx2 * ry + 0.25 * rx2;
    let dx = 2 * ry2 * x;
    let dy = 2 * rx2 * y;

    while (dx < dy) {
      plot4(x, y);
      if (d1 < 0) {
        x++;
        dx += 2 * ry2;
        d1 += dx + ry2;
      } else {
        x++;
        y--;
        dx += 2 * ry2;
        dy -= 2 * rx2;
        d1 += dx - dy + ry2;
      }
    }

    // Region 2: dy/dx >= 1
    let d2 = ry2 * (x + 0.5) * (x + 0.5) + rx2 * (y - 1) * (y - 1) - rx2 * ry2;
    while (y >= 0) {
      plot4(x, y);
      if (d2 > 0) {
        y--;
        dy -= 2 * rx2;
        d2 += rx2 - dy;
      } else {
        y--;
        x++;
        dx += 2 * ry2;
        dy -= 2 * rx2;
        d2 += dx - dy + rx2;
      }
    }
  }
}
