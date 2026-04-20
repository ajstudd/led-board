"use client";

import { useState, useCallback } from "react";
import { RGB } from "../types";
import { rgbToHex, hexToRgb } from "../lib/utils";
import { getPaletteById } from "../lib/palette";

const PALETTE: RGB[] = [
    [255, 0, 0],
    [255, 85, 0],
    [255, 170, 0],
    [255, 255, 0],
    [170, 255, 0],
    [85, 255, 0],
    [0, 255, 0],
    [0, 255, 85],
    [0, 255, 170],
    [0, 255, 255],
    [0, 170, 255],
    [0, 85, 255],
    [0, 0, 255],
    [85, 0, 255],
    [170, 0, 255],
    [255, 0, 255],
    [255, 0, 170],
    [255, 0, 85],
    // Neutrals
    [255, 255, 255],
    [192, 192, 192],
    [128, 128, 128],
    [64, 64, 64],
    [32, 32, 32],
    [0, 0, 0],
    // Multicolor
    [-1, -1, -1],
];

interface ColorPickerProps {
    activeColor: RGB;
    onColorChange: (color: RGB) => void;
    activePaletteId?: string | null;
}

export default function ColorPicker({
    activeColor,
    onColorChange,
    activePaletteId,
}: ColorPickerProps) {
    const [hexInput, setHexInput] = useState(
        activeColor[0] === -1 ? "Multi" : rgbToHex(activeColor[0], activeColor[1], activeColor[2]),
    );

    const handleHexChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const val = e.target.value;
            setHexInput(val);
            // Only apply when it's a valid 6-char hex
            const clean = val.replace("#", "");
            if (/^[0-9a-fA-F]{6}$/.test(clean)) {
                onColorChange(hexToRgb("#" + clean));
            }
        },
        [onColorChange],
    );

    const handleNativeColorChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const hex = e.target.value;
            setHexInput(hex);
            onColorChange(hexToRgb(hex));
        },
        [onColorChange],
    );

    const handleSwatchClick = useCallback(
        (color: RGB) => {
            onColorChange(color);
            setHexInput(color[0] === -1 ? "Multi" : rgbToHex(color[0], color[1], color[2]));
        },
        [onColorChange],
    );

    return (
        <div className="flex flex-col gap-2">
            {/* Active colour preview + hex input */}
            <div className="flex items-center gap-2">
                <div className="relative">
                    <div
                        className="h-7 w-7 sm:h-8 sm:w-8 rounded border border-white/20 cursor-pointer"
                        style={{
                            background: activeColor[0] === -1
                                ? "linear-gradient(45deg, red, orange, yellow, green, blue, indigo, violet)"
                                : `rgb(${activeColor[0]},${activeColor[1]},${activeColor[2]})`,
                        }}
                    />
                    {!activePaletteId && (
                        <input
                            type="color"
                            value={activeColor[0] === -1 ? "#ffffff" : rgbToHex(activeColor[0], activeColor[1], activeColor[2])}
                            onChange={handleNativeColorChange}
                            className="absolute inset-0 h-7 w-7 sm:h-8 sm:w-8 cursor-pointer opacity-0"
                            title="Pick a colour"
                        />
                    )}
                </div>
                <input
                    type="text"
                    value={hexInput}
                    onChange={handleHexChange}
                    disabled={!!activePaletteId}
                    placeholder="#ff0000"
                    className={`flex-1 min-w-0 rounded bg-white/10 px-2 py-1.5 sm:py-1 text-xs font-mono text-white outline-none min-h-9 sm:min-h-0 ${
                        activePaletteId ? "opacity-50 cursor-not-allowed" : "focus:ring-1 focus:ring-green-400"
                    }`}
                    maxLength={7}
                />
            </div>

            {/* Swatch palette */}
            <div className="grid grid-cols-6 gap-1">
                {(activePaletteId ? getPaletteById(activePaletteId)?.colors || PALETTE : PALETTE).map((color, i) => (
                    <button
                        key={i}
                        onClick={() => handleSwatchClick(color)}
                        className="aspect-square w-full max-w-6 rounded-sm border border-white/10 hover:scale-110 transition-transform"
                        style={{
                            background: color[0] === -1
                                ? "linear-gradient(45deg, red, orange, yellow, green, blue, indigo, violet)"
                                : `rgb(${color[0]},${color[1]},${color[2]})`,
                        }}
                        title={color[0] === -1 ? "Multicolor" : rgbToHex(color[0], color[1], color[2])}
                    />
                ))}
            </div>
        </div>
    );
}
