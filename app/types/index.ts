// ----- Colour Types -----
export type RGB = [r: number, g: number, b: number];
export type LayerBlendMode = "normal" | "add" | "multiply";

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
export type ToolKind = "select" | "draw" | "erase" | "fill" | "vibe";

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
export interface AnimationRuntimeContext {
  snapshot: Uint8ClampedArray | null;
  marqueeBuffer: Uint8ClampedArray | null;
  marqueeBufferCols: number;
}

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

export interface SerializedLayerEffectsState {
  enabled: boolean;
  presetName: string;
  distanceMultiplier: number;
  speedMultiplier: number;
}

export interface SerializedLayerPhysicsState {
  enabled: boolean;
  preset: string | null;
  gravityY: number;
  restitution: number;
}

export interface SerializedLayerState {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
  blendMode: LayerBlendMode;
  data: string;
  effects: SerializedLayerEffectsState;
  /** Optional for backward compatibility with saves made before physics. */
  physics?: SerializedLayerPhysicsState;
}

export interface SerializedBoardState {
  cols: number;
  rows: number;
  cellSize: number;
  activeLayerId: string | null;
  activeTool: ToolKind;
  activeColor: RGB;
  activePaletteId: string | null;
  layers: SerializedLayerState[];
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
