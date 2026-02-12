// ----- Colour Types -----
export type RGB = [r: number, g: number, b: number];

export interface Cell {
  col: number;
  row: number;
  color: RGB;
}

// ----- Grid Types -----
export interface GridDimensions {
  cols: number;
  rows: number;
  cellSize: number;
  width: number;
  height: number;
}

export interface GridState {
  dimensions: GridDimensions;
  /** Flat RGB array: length = cols * rows * 3 */
  data: Uint8ClampedArray;
}

// ----- Tool Types -----
export type ToolKind = "draw" | "erase" | "fill";

export interface Tool {
  kind: ToolKind;
  label: string;
  icon?: string;
}

// ----- Pattern Types -----
export type PatternDirection = "horizontal" | "vertical" | "diagonal";

export interface PatternConfig {
  name: string;
  fn: (cols: number, rows: number, data: Uint8ClampedArray) => void;
}

// ----- Animation Types -----
export interface AnimationConfig {
  name: string;
  fps: number;
  tick: (
    cols: number,
    rows: number,
    data: Uint8ClampedArray,
    frame: number,
  ) => void;
}

// ----- Settings -----
export interface BoardSettings {
  cellSize: number;
  showGrid: boolean;
  gridColor: RGB;
  backgroundColor: RGB;
}

export const DEFAULT_CELL_SIZE = 10;

export const DEFAULT_SETTINGS: BoardSettings = {
  cellSize: DEFAULT_CELL_SIZE,
  showGrid: true,
  gridColor: [30, 30, 30],
  backgroundColor: [0, 0, 0],
};
