"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { PATTERNS, PatternEntry } from "../lib/patterns";
import { RGB } from "../types";

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
    onRenderText: (text: string, color: RGB, scale?: number) => void;
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
    const [thumbnails, setThumbnails] = useState<string[]>([]);
    const generated = useRef(false);

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
            onRenderText(textInput.trim(), activeColor, fontScale);
        }
    }, [textInput, activeColor, onRenderText, fontScale]);

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
                        {PATTERNS.map((p, i) => (
                            <button
                                key={p.name}
                                onClick={() => onApplyPattern(p.apply)}
                                className="group relative flex flex-col items-center rounded bg-white/5 p-1 hover:bg-white/15 transition"
                                title={p.name}
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
                                    {p.name}
                                </span>
                            </button>
                        ))}
                    </div>

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
                                className="flex-1 h-1 accent-green-500 cursor-pointer"
                            />
                            <span className="text-[10px] text-white/60 w-5 text-right">{fontScale}×</span>
                        </div>
                        <div className="mt-1 text-[9px] text-white/30">
                            {5 * fontScale}×{7 * fontScale}px font · renders centred
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
