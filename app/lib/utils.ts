import { RGB } from "../types";

/** Convert HSL (h: 0-360, s: 0-100, l: 0-100) → RGB
 *  Optimised: no closures, no per-call allocations.
 */
const _rgb: RGB = [0, 0, 0]; // reusable scratch tuple
export function hslToRgb(h: number, s: number, l: number): RGB {
  const s1 = s * 0.01;
  const l1 = l * 0.01;
  const a = s1 * (l1 < 0.5 ? l1 : 1 - l1); // s * min(l, 1-l)
  const h30 = h / 30; // h / 30 — reused 3 times

  // f(n) = l - a * max(-1, min(k-3, min(9-k, 1)))   where k = (n + h/30) % 12
  let k: number, t: number;

  k = (0 + h30) % 12;
  t = k - 3;
  if (t < -1) t = -1;
  {
    const u = 9 - k;
    if (u < t) t = u;
  }
  if (t > 1) t = 1;
  const r = l1 - a * t;

  k = (8 + h30) % 12;
  t = k - 3;
  if (t < -1) t = -1;
  {
    const u = 9 - k;
    if (u < t) t = u;
  }
  if (t > 1) t = 1;
  const g = l1 - a * t;

  k = (4 + h30) % 12;
  t = k - 3;
  if (t < -1) t = -1;
  {
    const u = 9 - k;
    if (u < t) t = u;
  }
  if (t > 1) t = 1;
  const b = l1 - a * t;

  _rgb[0] = (r * 255 + 0.5) | 0;
  _rgb[1] = (g * 255 + 0.5) | 0;
  _rgb[2] = (b * 255 + 0.5) | 0;
  return _rgb;
}

/**
 * Same as hslToRgb but writes directly into a typed array at the given
 * offset, avoiding even the temporary tuple.
 */
export function hslToRgbInto(
  h: number,
  s: number,
  l: number,
  out: Uint8ClampedArray,
  offset: number,
): void {
  const s1 = s * 0.01;
  const l1 = l * 0.01;
  const a = s1 * (l1 < 0.5 ? l1 : 1 - l1);
  const h30 = h / 30;

  let k: number, t: number;

  k = (0 + h30) % 12;
  t = k - 3;
  if (t < -1) t = -1;
  {
    const u = 9 - k;
    if (u < t) t = u;
  }
  if (t > 1) t = 1;
  out[offset] = (l1 - a * t) * 255 + 0.5;

  k = (8 + h30) % 12;
  t = k - 3;
  if (t < -1) t = -1;
  {
    const u = 9 - k;
    if (u < t) t = u;
  }
  if (t > 1) t = 1;
  out[offset + 1] = (l1 - a * t) * 255 + 0.5;

  k = (4 + h30) % 12;
  t = k - 3;
  if (t < -1) t = -1;
  {
    const u = 9 - k;
    if (u < t) t = u;
  }
  if (t > 1) t = 1;
  out[offset + 2] = (l1 - a * t) * 255 + 0.5;
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
