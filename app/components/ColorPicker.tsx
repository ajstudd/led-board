"use client";

import { useState, useCallback } from "react";
import { RGB } from "../types";
import { rgbToHex, hexToRgb } from "../lib/utils";

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
];

interface ColorPickerProps {
    activeColor: RGB;
    onColorChange: (color: RGB) => void;
}

export default function ColorPicker({
    activeColor,
    onColorChange,
}: ColorPickerProps) {
    const [hexInput, setHexInput] = useState(
        rgbToHex(activeColor[0], activeColor[1], activeColor[2]),
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
            setHexInput(rgbToHex(color[0], color[1], color[2]));
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
                            backgroundColor: `rgb(${activeColor[0]},${activeColor[1]},${activeColor[2]})`,
                        }}
                    />
                    <input
                        type="color"
                        value={rgbToHex(activeColor[0], activeColor[1], activeColor[2])}
                        onChange={handleNativeColorChange}
                        className="absolute inset-0 h-7 w-7 sm:h-8 sm:w-8 cursor-pointer opacity-0"
                        title="Pick a colour"
                    />
                </div>
                <input
                    type="text"
                    value={hexInput}
                    onChange={handleHexChange}
                    placeholder="#ff0000"
                    className="w-full sm:w-20 rounded bg-white/10 px-2 py-1.5 sm:py-1 text-xs font-mono text-white outline-none focus:ring-1 focus:ring-green-400 min-h-9 sm:min-h-0"
                    maxLength={7}
                />
            </div>

            {/* Swatch palette */}
            <div className="grid grid-cols-6 gap-1">
                {PALETTE.map((color, i) => (
                    <button
                        key={i}
                        onClick={() => handleSwatchClick(color)}
                        className="aspect-square w-full max-w-6 rounded-sm border border-white/10 hover:scale-110 transition-transform"
                        style={{
                            backgroundColor: `rgb(${color[0]},${color[1]},${color[2]})`,
                        }}
                        title={rgbToHex(color[0], color[1], color[2])}
                    />
                ))}
            </div>
        </div>
    );
}
