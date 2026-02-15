import { RGB } from "../types";
import { hslToRgb } from "./utils";

// ── Helper: set cell in flat array ────────────────────
function set(
  data: Uint8ClampedArray,
  cols: number,
  col: number,
  row: number,
  color: RGB,
) {
  const i = (row * cols + col) * 3;
  data[i] = color[0];
  data[i + 1] = color[1];
  data[i + 2] = color[2];
}

// ── Helper: linear interpolation between two colours ──
function lerpColor(a: RGB, b: RGB, t: number): RGB {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

// ═══════════════════════════════════════════════════════
//  Pattern Functions
// ═══════════════════════════════════════════════════════

export function checkerboard(
  cols: number,
  rows: number,
  data: Uint8ClampedArray,
  color1: RGB = [255, 255, 255],
  color2: RGB = [60, 60, 60],
  size: number = 2,
) {
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const isEven = (Math.floor(c / size) + Math.floor(r / size)) % 2 === 0;
      set(data, cols, c, r, isEven ? color1 : color2);
    }
  }
}

export function gradient(
  cols: number,
  rows: number,
  data: Uint8ClampedArray,
  startColor: RGB = [255, 0, 0],
  endColor: RGB = [0, 0, 255],
  direction: "horizontal" | "vertical" | "diagonal" = "horizontal",
) {
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let t: number;
      switch (direction) {
        case "horizontal":
          t = cols > 1 ? c / (cols - 1) : 0;
          break;
        case "vertical":
          t = rows > 1 ? r / (rows - 1) : 0;
          break;
        case "diagonal":
          t = cols + rows > 2 ? (c + r) / (cols + rows - 2) : 0;
          break;
      }
      set(data, cols, c, r, lerpColor(startColor, endColor, t));
    }
  }
}

export function randomNoise(
  cols: number,
  rows: number,
  data: Uint8ClampedArray,
) {
  for (let i = 0; i < data.length; i++) {
    data[i] = Math.floor(Math.random() * 256);
  }
}

export function border(
  cols: number,
  rows: number,
  data: Uint8ClampedArray,
  color: RGB = [255, 255, 255],
  thickness: number = 1,
) {
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (
        r < thickness ||
        r >= rows - thickness ||
        c < thickness ||
        c >= cols - thickness
      ) {
        set(data, cols, c, r, color);
      }
    }
  }
}

export function stripes(
  cols: number,
  rows: number,
  data: Uint8ClampedArray,
  colors: RGB[] = [
    [255, 0, 0],
    [0, 255, 0],
    [0, 0, 255],
  ],
  orientation: "horizontal" | "vertical" = "vertical",
  width: number = 3,
) {
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = orientation === "vertical" ? c : r;
      const colorIndex = Math.floor(idx / width) % colors.length;
      set(data, cols, c, r, colors[colorIndex]);
    }
  }
}

export function rainbow(
  cols: number,
  rows: number,
  data: Uint8ClampedArray,
  direction: "horizontal" | "vertical" = "horizontal",
) {
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const t =
        direction === "horizontal"
          ? cols > 1
            ? c / (cols - 1)
            : 0
          : rows > 1
            ? r / (rows - 1)
            : 0;
      const hue = Math.round(t * 360);
      set(data, cols, c, r, hslToRgb(hue, 100, 50));
    }
  }
}

export function plasma(cols: number, rows: number, data: Uint8ClampedArray) {
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const v1 = Math.sin(c * 0.15);
      const v2 = Math.sin(r * 0.15);
      const v3 = Math.sin((c + r) * 0.1);
      const v4 = Math.sin(Math.sqrt(c * c + r * r) * 0.12);
      const v = (v1 + v2 + v3 + v4 + 4) / 8; // normalise to 0–1
      const hue = Math.round(v * 360);
      set(data, cols, c, r, hslToRgb(hue, 100, 50));
    }
  }
}

export function dots(
  cols: number,
  rows: number,
  data: Uint8ClampedArray,
  color: RGB = [0, 255, 255],
  spacing: number = 4,
) {
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (c % spacing === 0 && r % spacing === 0) {
        set(data, cols, c, r, color);
      }
    }
  }
}

export function crosshatch(
  cols: number,
  rows: number,
  data: Uint8ClampedArray,
  color: RGB = [255, 200, 0],
  spacing: number = 5,
) {
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (c % spacing === 0 || r % spacing === 0) {
        set(data, cols, c, r, color);
      }
    }
  }
}

export function spiral(cols: number, rows: number, data: Uint8ClampedArray) {
  const cx = cols / 2;
  const cy = rows / 2;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const dx = c - cx;
      const dy = r - cy;
      const angle = Math.atan2(dy, dx);
      const dist = Math.sqrt(dx * dx + dy * dy);
      const hue = ((angle / Math.PI + 1) * 180 + dist * 8) % 360;
      set(data, cols, c, r, hslToRgb(hue, 100, 50));
    }
  }
}

export function diamondPattern(
  cols: number,
  rows: number,
  data: Uint8ClampedArray,
  color1: RGB = [255, 0, 100],
  color2: RGB = [0, 0, 50],
  size: number = 6,
) {
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const mx = Math.abs((c % size) - size / 2);
      const my = Math.abs((r % size) - size / 2);
      set(data, cols, c, r, mx + my < size / 2 ? color1 : color2);
    }
  }
}

// ═══════════════════════════════════════════════════════
//  Pattern Registry
// ═══════════════════════════════════════════════════════

export interface PatternEntry {
  name: string;
  apply: (cols: number, rows: number, data: Uint8ClampedArray) => void;
}

export const PATTERNS: PatternEntry[] = [
  {
    name: "Checkerboard",
    apply: (c, r, d) => checkerboard(c, r, d),
  },
  {
    name: "Gradient",
    apply: (c, r, d) =>
      gradient(c, r, d, [255, 0, 0], [0, 0, 255], "horizontal"),
  },
  {
    name: "Rainbow H",
    apply: (c, r, d) => rainbow(c, r, d, "horizontal"),
  },
  {
    name: "Rainbow V",
    apply: (c, r, d) => rainbow(c, r, d, "vertical"),
  },
  {
    name: "Noise",
    apply: (c, r, d) => randomNoise(c, r, d),
  },
  {
    name: "Plasma",
    apply: (c, r, d) => plasma(c, r, d),
  },
  {
    name: "Spiral",
    apply: (c, r, d) => spiral(c, r, d),
  },
  {
    name: "Border",
    apply: (c, r, d) => border(c, r, d, [255, 255, 255], 2),
  },
  {
    name: "Stripes V",
    apply: (c, r, d) =>
      stripes(
        c,
        r,
        d,
        [
          [255, 0, 0],
          [0, 255, 0],
          [0, 0, 255],
        ],
        "vertical",
        3,
      ),
  },
  {
    name: "Stripes H",
    apply: (c, r, d) =>
      stripes(
        c,
        r,
        d,
        [
          [255, 255, 0],
          [255, 0, 255],
          [0, 255, 255],
        ],
        "horizontal",
        3,
      ),
  },
  {
    name: "Dots",
    apply: (c, r, d) => dots(c, r, d),
  },
  {
    name: "Crosshatch",
    apply: (c, r, d) => crosshatch(c, r, d),
  },
  {
    name: "Diamond",
    apply: (c, r, d) => diamondPattern(c, r, d),
  },
];
