import { RGB } from "../types";

/** Convert HSL (h: 0-360, s: 0-100, l: 0-100) → RGB */
export function hslToRgb(h: number, s: number, l: number): RGB {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) =>
    l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [
    Math.round(f(0) * 255),
    Math.round(f(8) * 255),
    Math.round(f(4) * 255),
  ];
}

/** Convert RGB → hex string #rrggbb */
export function rgbToHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
}

/** Convert hex string #rrggbb → RGB tuple */
export function hexToRgb(hex: string): RGB {
  const h = hex.replace("#", "");
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}

/** Clamp a number to [min, max] */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Convert pixel coordinates to grid cell coordinates */
export function pixelToCell(
  px: number,
  py: number,
  cellSize: number,
): { col: number; row: number } {
  return {
    col: Math.floor(px / cellSize),
    row: Math.floor(py / cellSize),
  };
}

/** RGB to CSS rgb() string */
export function rgbToCss(color: RGB): string {
  return `rgb(${color[0]},${color[1]},${color[2]})`;
}

/** Compare two RGB tuples for equality */
export function rgbEqual(a: RGB, b: RGB): boolean {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}

/** Convert Uint8ClampedArray to base64 string */
export function uint8ToBase64(data: Uint8ClampedArray): string {
  let binary = "";
  const len = data.length;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(data[i]);
  }
  return btoa(binary);
}

/** Convert base64 string to Uint8ClampedArray */
export function base64ToUint8(base64: string): Uint8ClampedArray {
  const binary = atob(base64);
  const len = binary.length;
  const data = new Uint8ClampedArray(len);
  for (let i = 0; i < len; i++) {
    data[i] = binary.charCodeAt(i);
  }
  return data;
}
