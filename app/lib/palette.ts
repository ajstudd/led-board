/**
 * palette.ts — color palette management for Tenix.
 * Let users define brand colors that applying to pens, patterns, and dynamic effects.
 */

import { RGB } from "../types";

export interface ColorPalette {
  id: string;
  name: string;
  colors: RGB[];
  isBuiltIn: boolean;
}

export const BUILT_IN_PALETTES: ColorPalette[] = [
  {
    id: "neon",
    name: "CYBER",
    colors: [
      [0, 255, 0],     // Neon Green
      [255, 0, 255],   // Hot Pink
      [0, 255, 255],   // Cyan
      [255, 255, 0],   // Yellow
      [138, 43, 226],  // Blue Violet
    ],
    isBuiltIn: true,
  },
  {
    id: "sunset",
    name: "SUNSET",
    colors: [
      [255, 94, 77],   // Coral
      [255, 154, 0],   // Orange
      [255, 206, 0],   // Yellow
      [255, 0, 102],   // Pink
      [148, 0, 211],   // Violet
    ],
    isBuiltIn: true,
  },
  {
    id: "ocean",
    name: "OCEAN",
    colors: [
      [0, 119, 182],   // Deep Blue
      [0, 180, 216],   // Mid Blue
      [144, 224, 239], // Light Blue
      [202, 240, 248], // Ice Blue
      [0, 255, 127],   // Spring Green
    ],
    isBuiltIn: true,
  },
  {
    id: "synthwave",
    name: "SYNTH",
    colors: [
      [48, 0, 153],
      [162, 0, 255],
      [255, 0, 128],
      [255, 145, 0],
      [255, 226, 0],
    ],
    isBuiltIn: true,
  },
  {
    id: "pico8",
    name: "PICO-8",
    colors: [
      [0, 0, 0],
      [29, 43, 83],
      [126, 37, 83],
      [0, 135, 81],
      [171, 82, 54],
      [95, 87, 79],
      [194, 195, 199],
      [255, 241, 232],
      [255, 0, 77],
      [255, 163, 0],
      [255, 236, 39],
      [0, 228, 54],
      [41, 173, 255],
      [131, 118, 156],
      [255, 119, 168],
      [255, 204, 170],
    ],
    isBuiltIn: true,
  },
  {
    id: "gameboy",
    name: "GAMEBOY",
    colors: [
      [15, 56, 15],
      [48, 98, 48],
      [139, 172, 15],
      [155, 188, 15],
    ],
    isBuiltIn: true,
  },
];

const STORAGE_KEY_CUSTOM_PALETTES = "tenix-custom-palettes";

export function getCustomPalettes(): ColorPalette[] {
  if (typeof window === "undefined") return [];
  try {
    const saved = localStorage.getItem(STORAGE_KEY_CUSTOM_PALETTES);
    if (!saved) return [];
    return JSON.parse(saved);
  } catch (err) {
    console.error("Failed to load custom palettes", err);
    return [];
  }
}

export function saveCustomPalettes(palettes: ColorPalette[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY_CUSTOM_PALETTES, JSON.stringify(palettes));
  } catch (err) {
    console.error("Failed to save custom palettes", err);
  }
}

export function getAllPalettes(): ColorPalette[] {
  return [...BUILT_IN_PALETTES, ...getCustomPalettes()];
}

export function getPaletteById(id: string): ColorPalette | undefined {
  return getAllPalettes().find((p) => p.id === id);
}

/** Pick a color from a palette wrapped by index */
export function pickFromPalette(palette: ColorPalette | null, index: number): RGB | null {
  if (!palette || palette.colors.length === 0) return null;
  return palette.colors[index % palette.colors.length];
}

/** Get a random color from a palette */
export function randomFromPalette(palette: ColorPalette | null): RGB | null {
  if (!palette || palette.colors.length === 0) return null;
  const index = Math.floor(Math.random() * palette.colors.length);
  return palette.colors[index];
}

/** Create and save a new custom palette, returns the created palette */
export function addCustomPalette(name: string, colors: RGB[]): ColorPalette {
  const existing = getCustomPalettes();
  const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const palette: ColorPalette = { id, name, colors, isBuiltIn: false };
  saveCustomPalettes([...existing, palette]);
  return palette;
}

/** Delete a custom palette by ID */
export function deleteCustomPalette(id: string): void {
  const existing = getCustomPalettes();
  saveCustomPalettes(existing.filter((p) => p.id !== id));
}
