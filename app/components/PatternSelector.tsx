"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { PATTERNS, PatternEntry, gradient } from "../lib/patterns";
import { RGB } from "../types";
import { rgbToHex, hexToRgb } from "../lib/utils";

// Tiny canvas to generate pattern thumbnails
function generateThumbnail(
    pattern: PatternEntry,
    thumbCols: number,
    thumbRows: number,
    cellPx: number,
): string {
    const data = new Uint8ClampedArray(thumbCols * thumbRows * 3);
    pattern.apply(thumbCols, thumbRows, data);

    const canvas = document.createElement("canvas");
    canvas.width = thumbCols * cellPx;
    canvas.height = thumbRows * cellPx;
    const ctx = canvas.getContext("2d")!;

    for (let r = 0; r < thumbRows; r++) {
        for (let c = 0; c < thumbCols; c++) {
            const i = (r * thumbCols + c) * 3;
            ctx.fillStyle = `rgb(${data[i]},${data[i + 1]},${data[i + 2]})`;
            ctx.fillRect(c * cellPx, r * cellPx, cellPx, cellPx);
        }
    }
    return canvas.toDataURL();
}

interface PatternSelectorProps {
    onApplyPattern: (
        fn: (cols: number, rows: number, data: Uint8ClampedArray) => void,
    ) => void;
    onRenderText: (text: string, color: RGB, scale?: number, wrap?: boolean) => void;
    activeColor: RGB;
}

export default function PatternSelector({
    onApplyPattern,
    onRenderText,
    activeColor,
}: PatternSelectorProps) {
    const [expanded, setExpanded] = useState(false);
    const [textInput, setTextInput] = useState("");
    const [fontScale, setFontScale] = useState(1);
    const [textWrap, setTextWrap] = useState(true);
    const [thumbnails, setThumbnails] = useState<string[]>([]);
    const generated = useRef(false);

    // ── Gradient submenu state ─────────────────────────────
    const [gradientOpen, setGradientOpen] = useState(false);
    const [gradStart, setGradStart] = useState<RGB>([255, 0, 0]);
    const [gradEnd, setGradEnd] = useState<RGB>([0, 0, 255]);
    const [gradDir, setGradDir] = useState<"horizontal" | "vertical" | "diagonal">("horizontal");

    const handleApplyGradient = useCallback(() => {
        onApplyPattern((cols, rows, data) =>
            gradient(cols, rows, data, gradStart, gradEnd, gradDir)
        );
    }, [onApplyPattern, gradStart, gradEnd, gradDir]);

    // Generate thumbnails once on first expand
    useEffect(() => {
        if (expanded && !generated.current) {
            generated.current = true;
            // Use requestAnimationFrame to avoid sync setState in effect
            requestAnimationFrame(() => {
                const thumbs = PATTERNS.map((p) => generateThumbnail(p, 20, 12, 3));
                setThumbnails(thumbs);
            });
        }
    }, [expanded]);

    const handleTextRender = useCallback(() => {
        if (textInput.trim()) {
            onRenderText(textInput.trim(), activeColor, fontScale, textWrap);
        }
    }, [textInput, activeColor, onRenderText, fontScale, textWrap]);

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (e.key === "Enter") {
                e.preventDefault();
                handleTextRender();
            }
        },
        [handleTextRender],
    );

    return (
        <div>
            {/* Toggle button */}
            <button
                onClick={() => setExpanded((v) => !v)}
                className="w-full rounded bg-white/10 px-2 py-2 sm:py-1.5 text-xs hover:bg-white/20 transition text-left min-h-9 sm:min-h-0"
            >
                {expanded ? "▾ Patterns & Text" : "▸ Patterns & Text"}
            </button>

            {expanded && (
                <div className="mt-2 flex flex-col gap-3">
                    {/* Pattern grid */}
                    <div className="grid grid-cols-2 xs:grid-cols-3 gap-1.5">
                        {PATTERNS.map((p, i) => {
                            const isGrad = p.name === "Gradient";
                            return (
                                <button
                                    key={p.name}
                                    onClick={() => {
                                        if (isGrad) {
                                            setGradientOpen((v) => !v);
                                        } else {
                                            setGradientOpen(false);
                                            onApplyPattern(p.apply);
                                        }
                                    }}
                                    className={`group relative flex flex-col items-center rounded p-1 transition ${isGrad && gradientOpen
                                        ? "bg-green-500/20 ring-1 ring-green-500/50"
                                        : "bg-white/5 hover:bg-white/15"
                                        }`}
                                    title={isGrad ? "Click to customise gradient" : p.name}
                                >
                                    {thumbnails[i] ? (
                                        /* eslint-disable-next-line @next/next/no-img-element */
                                        <img
                                            src={thumbnails[i]}
                                            alt={p.name}
                                            className="h-7 sm:h-9 w-full rounded-sm object-cover"
                                            draggable={false}
                                        />
                                    ) : (
                                        <div className="h-7 sm:h-9 w-full rounded-sm bg-white/5 animate-pulse" />
                                    )}
                                    <span className="mt-0.5 text-[9px] text-white/50 group-hover:text-white/80 truncate w-full text-center">
                                        {p.name}{isGrad ? (gradientOpen ? " ▾" : " ▸") : ""}
                                    </span>
                                </button>
                            );
                        })}
                    </div>

                    {/* Gradient submenu – shown inline below grid */}
                    {gradientOpen && (
                        <div className="rounded bg-white/5 p-2 flex flex-col gap-2 border border-green-500/20">
                            <div className="flex items-center gap-2">
                                <div className="flex-1">
                                    <label className="text-[9px] text-white/40 block mb-0.5">Start</label>
                                    <div className="relative">
                                        <div
                                            className="h-6 w-full rounded border border-white/20 cursor-pointer"
                                            style={{ backgroundColor: `rgb(${gradStart[0]},${gradStart[1]},${gradStart[2]})` }}
                                        />
                                        <input
                                            type="color"
                                            value={rgbToHex(gradStart[0], gradStart[1], gradStart[2])}
                                            onChange={(e) => setGradStart(hexToRgb(e.target.value))}
                                            className="absolute inset-0 w-full h-full cursor-pointer opacity-0"
                                        />
                                    </div>
                                </div>
                                <div className="flex-1">
                                    <label className="text-[9px] text-white/40 block mb-0.5">End</label>
                                    <div className="relative">
                                        <div
                                            className="h-6 w-full rounded border border-white/20 cursor-pointer"
                                            style={{ backgroundColor: `rgb(${gradEnd[0]},${gradEnd[1]},${gradEnd[2]})` }}
                                        />
                                        <input
                                            type="color"
                                            value={rgbToHex(gradEnd[0], gradEnd[1], gradEnd[2])}
                                            onChange={(e) => setGradEnd(hexToRgb(e.target.value))}
                                            className="absolute inset-0 w-full h-full cursor-pointer opacity-0"
                                        />
                                    </div>
                                </div>
                            </div>
                            <div className="flex gap-1">
                                {(["horizontal", "vertical", "diagonal"] as const).map((dir) => (
                                    <button
                                        key={dir}
                                        onClick={() => setGradDir(dir)}
                                        className={`flex-1 rounded px-1 py-1.5 text-[10px] transition min-h-8 sm:min-h-0 ${gradDir === dir
                                            ? "bg-green-500/30 text-green-300 ring-1 ring-green-500/50"
                                            : "bg-white/5 text-white/70 hover:bg-white/10"
                                            }`}
                                    >
                                        {dir === "horizontal" ? "Horiz" : dir === "vertical" ? "Vert" : "Diag"}
                                    </button>
                                ))}
                            </div>
                            <button
                                onClick={handleApplyGradient}
                                className="w-full rounded bg-green-600/50 px-2 py-1.5 text-xs hover:bg-green-500/70 transition min-h-9 sm:min-h-0"
                            >
                                Apply Gradient
                            </button>
                        </div>
                    )}

                    {/* Separator */}
                    <div className="h-px bg-white/10" />

                    {/* Text renderer */}
                    <div>
                        <div className="mb-1 text-[10px] uppercase tracking-widest text-white/40">
                            Pixel Text
                        </div>
                        <div className="flex gap-1">
                            <input
                                type="text"
                                value={textInput}
                                onChange={(e) => setTextInput(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="Type text..."
                                className="flex-1 min-w-0 rounded bg-white/10 px-2 py-1.5 sm:py-1 text-xs font-mono text-white outline-none focus:ring-1 focus:ring-green-400 min-h-9 sm:min-h-0"
                                maxLength={50}
                            />
                            <button
                                onClick={handleTextRender}
                                className="rounded bg-green-600/50 px-2 py-1.5 sm:py-1 text-xs hover:bg-green-500/70 transition min-h-9 sm:min-h-0 shrink-0"
                                title="Render text to grid"
                            >
                                Render
                            </button>
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                            <span className="text-[10px] text-white/40 shrink-0">Size</span>
                            <input
                                type="range"
                                min={1}
                                max={6}
                                value={fontScale}
                                onChange={(e) => setFontScale(Number(e.target.value))}
                                className="flex-1 min-w-0 h-1 accent-green-500 cursor-pointer"
                            />
                            <span className="text-[10px] text-white/60 w-5 text-right shrink-0">{fontScale}×</span>
                        </div>
                        <div className="mt-1 text-[9px] text-white/30">
                            {5 * fontScale}×{7 * fontScale}px font · renders centred
                        </div>
                        {/* Wrap / Overflow toggle */}
                        <div className="mt-2 flex items-center gap-1.5">
                            <span className="text-[10px] text-white/40 shrink-0">Text</span>
                            <button
                                onClick={() => setTextWrap(true)}
                                className={`flex-1 rounded px-1.5 py-1.5 text-[10px] transition min-h-8 sm:min-h-0 ${textWrap
                                    ? "bg-green-500/30 text-green-300 ring-1 ring-green-500/50"
                                    : "bg-white/5 text-white/70 hover:bg-white/10"
                                    }`}
                            >
                                Wrap
                            </button>
                            <button
                                onClick={() => setTextWrap(false)}
                                className={`flex-1 rounded px-1.5 py-1.5 text-[10px] transition min-h-8 sm:min-h-0 ${!textWrap
                                    ? "bg-green-500/30 text-green-300 ring-1 ring-green-500/50"
                                    : "bg-white/5 text-white/70 hover:bg-white/10"
                                    }`}
                            >
                                Overflow
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
