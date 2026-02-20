import { RGB } from "../types";

/**
 * 5×7 bitmap font — each character is represented by 7 rows of 5 bits.
 * A `1` means the pixel is on.
 */
export const FONT: Record<string, number[]> = {
  A: [0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  B: [0b11110, 0b10001, 0b10001, 0b11110, 0b10001, 0b10001, 0b11110],
  C: [0b01110, 0b10001, 0b10000, 0b10000, 0b10000, 0b10001, 0b01110],
  D: [0b11110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11110],
  E: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  F: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000],
  G: [0b01110, 0b10001, 0b10000, 0b10111, 0b10001, 0b10001, 0b01110],
  H: [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  I: [0b01110, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  J: [0b00111, 0b00010, 0b00010, 0b00010, 0b00010, 0b10010, 0b01100],
  K: [0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001],
  L: [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
  M: [0b10001, 0b11011, 0b10101, 0b10101, 0b10001, 0b10001, 0b10001],
  N: [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
  O: [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  P: [0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000],
  Q: [0b01110, 0b10001, 0b10001, 0b10001, 0b10101, 0b10010, 0b01101],
  R: [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  S: [0b01110, 0b10001, 0b10000, 0b01110, 0b00001, 0b10001, 0b01110],
  T: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  U: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  V: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b00100],
  W: [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b11011, 0b10001],
  X: [0b10001, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001, 0b10001],
  Y: [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  Z: [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b10000, 0b11111],
  "0": [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  "1": [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  "2": [0b01110, 0b10001, 0b00001, 0b00010, 0b00100, 0b01000, 0b11111],
  "3": [0b01110, 0b10001, 0b00001, 0b00110, 0b00001, 0b10001, 0b01110],
  "4": [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
  "5": [0b11111, 0b10000, 0b11110, 0b00001, 0b00001, 0b10001, 0b01110],
  "6": [0b01110, 0b10000, 0b10000, 0b11110, 0b10001, 0b10001, 0b01110],
  "7": [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000],
  "8": [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110],
  "9": [0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00001, 0b01110],
  " ": [0b00000, 0b00000, 0b00000, 0b00000, 0b00000, 0b00000, 0b00000],
  "!": [0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00000, 0b00100],
  "?": [0b01110, 0b10001, 0b00001, 0b00010, 0b00100, 0b00000, 0b00100],
  ".": [0b00000, 0b00000, 0b00000, 0b00000, 0b00000, 0b00000, 0b00100],
  ",": [0b00000, 0b00000, 0b00000, 0b00000, 0b00000, 0b00100, 0b01000],
  ":": [0b00000, 0b00100, 0b00000, 0b00000, 0b00000, 0b00100, 0b00000],
  "-": [0b00000, 0b00000, 0b00000, 0b11111, 0b00000, 0b00000, 0b00000],
  "+": [0b00000, 0b00100, 0b00100, 0b11111, 0b00100, 0b00100, 0b00000],
  "=": [0b00000, 0b00000, 0b11111, 0b00000, 0b11111, 0b00000, 0b00000],
  "/": [0b00001, 0b00010, 0b00010, 0b00100, 0b01000, 0b01000, 0b10000],
  "(": [0b00010, 0b00100, 0b01000, 0b01000, 0b01000, 0b00100, 0b00010],
  ")": [0b01000, 0b00100, 0b00010, 0b00010, 0b00010, 0b00100, 0b01000],
  "<": [0b00010, 0b00100, 0b01000, 0b10000, 0b01000, 0b00100, 0b00010],
  ">": [0b01000, 0b00100, 0b00010, 0b00001, 0b00010, 0b00100, 0b01000],
  "#": [0b01010, 0b01010, 0b11111, 0b01010, 0b11111, 0b01010, 0b01010],
  "'": [0b00100, 0b00100, 0b01000, 0b00000, 0b00000, 0b00000, 0b00000],
};

export const CHAR_WIDTH = 5;
export const CHAR_HEIGHT = 7;
export const CHAR_SPACING = 1; // 1-cell gap between characters

/**
 * Render a single character onto the grid's flat data array.
 * `scale` multiplies each pixel (1 = original 5×7, 2 = 10×14, etc.).
 * Returns the number of columns consumed.
 */
export function renderChar(
  ch: string,
  startCol: number,
  startRow: number,
  cols: number,
  rows: number,
  data: Uint8ClampedArray,
  color: RGB,
  scale: number = 1,
): number {
  const glyph = FONT[ch.toUpperCase()] ?? FONT["?"];
  if (!glyph) return (CHAR_WIDTH + CHAR_SPACING) * scale;

  for (let gr = 0; gr < CHAR_HEIGHT; gr++) {
    const rowBits = glyph[gr];
    for (let gc = 0; gc < CHAR_WIDTH; gc++) {
      const bit = (rowBits >> (CHAR_WIDTH - 1 - gc)) & 1;
      if (bit) {
        // Fill a scale×scale block for each lit pixel
        for (let sy = 0; sy < scale; sy++) {
          for (let sx = 0; sx < scale; sx++) {
            const c = startCol + gc * scale + sx;
            const r = startRow + gr * scale + sy;
            if (c >= 0 && c < cols && r >= 0 && r < rows) {
              const i = (r * cols + c) * 3;
              data[i] = color[0];
              data[i + 1] = color[1];
              data[i + 2] = color[2];
            }
          }
        }
      }
    }
  }
  return (CHAR_WIDTH + CHAR_SPACING) * scale;
}

/**
 * Render a string of text onto the grid.
 * When `wrap` is true (default) text wraps to the next line at the grid edge.
 * When `wrap` is false text continues past the grid boundary (overflow / clip).
 * `scale` multiplies the font size.
 */
export function renderText(
  text: string,
  startCol: number,
  startRow: number,
  cols: number,
  rows: number,
  data: Uint8ClampedArray,
  color: RGB,
  scale: number = 1,
  wrap: boolean = true,
): void {
  let curCol = startCol;
  let curRow = startRow;
  const charW = CHAR_WIDTH * scale;
  const charH = CHAR_HEIGHT * scale;

  for (const ch of text) {
    if (wrap) {
      // Wrap to next line if we'd overflow
      if (curCol + charW > cols) {
        curCol = startCol;
        curRow += charH + scale;
      }
    }
    // Stop if we'd overflow vertically
    if (curRow + charH > rows) break;
    // In overflow mode, stop rendering once fully off-screen to the right
    if (!wrap && curCol >= cols) break;

    curCol += renderChar(ch, curCol, curRow, cols, rows, data, color, scale);
  }
}

/**
 * Measure the pixel width of a text string at a given scale.
 */
export function measureText(text: string, scale: number = 1): number {
  if (text.length === 0) return 0;
  return (
    text.length * (CHAR_WIDTH + CHAR_SPACING) * scale - CHAR_SPACING * scale
  );
}

/**
 * Render centred text on the grid.
 * When `wrap` is true (default) text wraps to the next line.
 * When `wrap` is false the text stays on one line at full scale, centred if
 * it fits, or left-aligned if it doesn't. Characters past the right edge are
 * simply clipped (renderChar already bounds-checks each pixel).
 */
export function renderTextCentered(
  text: string,
  cols: number,
  rows: number,
  data: Uint8ClampedArray,
  color: RGB,
  scale: number = 1,
  wrap: boolean = true,
): void {
  const textWidth = measureText(text, scale);
  const charH = CHAR_HEIGHT * scale;
  const startRow = Math.max(0, Math.floor((rows - charH) / 2));

  if (wrap) {
    const startCol = Math.max(0, Math.floor((cols - textWidth) / 2));
    renderText(text, startCol, startRow, cols, rows, data, color, scale, true);
  } else {
    // Single line — centre if it fits, otherwise left-align (col 0).
    // Text past the grid edge is clipped by renderChar's bounds checks.
    const startCol = textWidth <= cols ? Math.floor((cols - textWidth) / 2) : 0;
    renderText(text, startCol, startRow, cols, rows, data, color, scale, false);
  }
}

/**
 * Render text into a buffer that may be wider than the visible grid.
 * Used for marquee/scroll: the buffer width = max(cols, textWidth + cols)
 * so the text can scroll completely through.
 * Returns { buffer, bufferCols, textWidth } for the caller to animate.
 */
export function renderTextToWideBuffer(
  text: string,
  cols: number,
  rows: number,
  color: RGB,
  scale: number = 1,
  baseData?: Uint8ClampedArray,
): { buffer: Uint8ClampedArray; bufferCols: number; textWidth: number } {
  const textWidth = measureText(text, scale);
  // Buffer is wide enough so the text can scroll fully off to the left
  // and new text enters from the right: need cols (visible) + textWidth.
  const bufferCols = cols + textWidth;
  const buffer = new Uint8ClampedArray(bufferCols * rows * 3);

  // If there's base content (e.g. a pattern), tile it across the wide buffer
  if (baseData && baseData.length === cols * rows * 3) {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < bufferCols; c++) {
        const srcC = c % cols;
        const si = (r * cols + srcC) * 3;
        const di = (r * bufferCols + c) * 3;
        buffer[di] = baseData[si];
        buffer[di + 1] = baseData[si + 1];
        buffer[di + 2] = baseData[si + 2];
      }
    }
  }

  // Render text starting at column `cols` (just off-screen to the right)
  const charH = CHAR_HEIGHT * scale;
  const startRow = Math.max(0, Math.floor((rows - charH) / 2));
  renderText(
    text,
    cols,
    startRow,
    bufferCols,
    rows,
    buffer,
    color,
    scale,
    false,
  );

  return { buffer, bufferCols, textWidth };
}
