import { RGB, GridDimensions, DEFAULT_CELL_SIZE } from "../types";

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
}
