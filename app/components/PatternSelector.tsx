"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { PATTERNS, PatternEntry, gradient } from "../lib/patterns";
import { RGB } from "../types";
import { rgbToHex, hexToRgb } from "../lib/utils";
import InfoTooltip from "./InfoTooltip";

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
    onRenderText: (text: string, color: RGB, scale?: number, wrap?: boolean, animId?: string) => void;
    activeColor: RGB;
}

export default function PatternSelector({
    onApplyPattern,
    onRenderText,
    activeColor,
}: PatternSelectorProps) {
    const [textInput, setTextInput] = useState("");
    const [fontScale, setFontScale] = useState(1);
    const [textWrap, setTextWrap] = useState(true);
    const [textAnimId, setTextAnimId] = useState<string>("none");
    const [thumbnails, setThumbnails] = useState<string[]>([]);
    const generated = useRef(false);

    const [gradientOpen, setGradientOpen] = useState(false);
    const [gradStart, setGradStart] = useState<RGB>([255, 0, 0]);
    const [gradEnd, setGradEnd] = useState<RGB>([0, 0, 255]);
    const [gradDir, setGradDir] = useState<"horizontal" | "vertical" | "diagonal">("horizontal");

    const handleApplyGradient = useCallback(() => {
        onApplyPattern((cols, rows, data) =>
            gradient(cols, rows, data, gradStart, gradEnd, gradDir),
        );
    }, [onApplyPattern, gradStart, gradEnd, gradDir]);

    useEffect(() => {
        if (generated.current) return;
        generated.current = true;
        requestAnimationFrame(() => {
            const thumbs = PATTERNS.map((pattern) => generateThumbnail(pattern, 20, 12, 3));
            setThumbnails(thumbs);
        });
    }, []);

    const handleTextRender = useCallback(() => {
        if (textInput.trim()) {
            onRenderText(textInput.trim(), activeColor, fontScale, textWrap, textAnimId);
        }
    }, [textInput, activeColor, onRenderText, fontScale, textWrap, textAnimId]);

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
        <div className="flex flex-col gap-3">
            <div className="text-[9px] uppercase tracking-[0.22em] text-white/35">
                Patterns
            </div>

            <div className="grid grid-cols-2 xs:grid-cols-3 gap-1.5">
                {PATTERNS.map((pattern, i) => {
                    const isGradient = pattern.name === "Gradient";
                    return (
                        <button
                            key={pattern.name}
                            onClick={() => {
                                if (isGradient) {
                                    setGradientOpen((value) => !value);
                                } else {
                                    setGradientOpen(false);
                                    onApplyPattern(pattern.apply);
                                }
                            }}
                            className={`group flex flex-col items-center rounded-lg border px-1 py-1.5 transition ${isGradient && gradientOpen
                                ? "border-emerald-400/40 bg-emerald-500/10 ring-1 ring-emerald-400/20"
                                : "border-white/8 bg-white/[0.04] hover:border-white/15 hover:bg-white/[0.08]"
                                }`}
                            title={isGradient ? "Click to customize gradient" : pattern.name}
                        >
                            {thumbnails[i] ? (
                                /* eslint-disable-next-line @next/next/no-img-element */
                                <img
                                    src={thumbnails[i]}
                                    alt={pattern.name}
                                    className="h-8 sm:h-10 w-full rounded-md object-cover"
                                    draggable={false}
                                />
                            ) : (
                                <div className="h-8 sm:h-10 w-full rounded-md bg-white/5 animate-pulse" />
                            )}
                            <span className="mt-1 w-full truncate text-center text-[9px] text-white/55 group-hover:text-white/85">
                                {pattern.name}
                            </span>
                        </button>
                    );
                })}
            </div>

            {gradientOpen && (
                <div className="flex flex-col gap-2 rounded-xl border border-emerald-400/20 bg-emerald-500/[0.06] p-2.5">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] uppercase tracking-[0.18em] text-emerald-200/70">
                            Gradient
                        </span>
                        <button
                            onClick={handleApplyGradient}
                            className="rounded-md bg-emerald-500/20 px-2 py-1 text-[10px] text-emerald-200 transition hover:bg-emerald-500/35"
                        >
                            Apply
                        </button>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="flex-1">
                            <label className="mb-0.5 block text-[9px] text-white/40">Start</label>
                            <div className="relative">
                                <div
                                    className="h-7 w-full rounded-md border border-white/15"
                                    style={{ backgroundColor: `rgb(${gradStart[0]},${gradStart[1]},${gradStart[2]})` }}
                                />
                                <input
                                    type="color"
                                    value={rgbToHex(gradStart[0], gradStart[1], gradStart[2])}
                                    onChange={(e) => setGradStart(hexToRgb(e.target.value))}
                                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                                />
                            </div>
                        </div>
                        <div className="flex-1">
                            <label className="mb-0.5 block text-[9px] text-white/40">End</label>
                            <div className="relative">
                                <div
                                    className="h-7 w-full rounded-md border border-white/15"
                                    style={{ backgroundColor: `rgb(${gradEnd[0]},${gradEnd[1]},${gradEnd[2]})` }}
                                />
                                <input
                                    type="color"
                                    value={rgbToHex(gradEnd[0], gradEnd[1], gradEnd[2])}
                                    onChange={(e) => setGradEnd(hexToRgb(e.target.value))}
                                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                                />
                            </div>
                        </div>
                    </div>
                    <div className="flex gap-1">
                        {(["horizontal", "vertical", "diagonal"] as const).map((dir) => (
                            <button
                                key={dir}
                                onClick={() => setGradDir(dir)}
                                className={`flex-1 rounded-md px-1 py-1.5 text-[10px] transition ${gradDir === dir
                                    ? "bg-emerald-500/25 text-emerald-200 ring-1 ring-emerald-400/30"
                                    : "bg-white/5 text-white/70 hover:bg-white/10"
                                    }`}
                            >
                                {dir === "horizontal" ? "Horiz" : dir === "vertical" ? "Vert" : "Diag"}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            <div className="h-px bg-white/10" />

            <div className="flex flex-col gap-2.5">
                <div className="text-[9px] uppercase tracking-[0.22em] text-white/35">
                    Pixel Text
                </div>

                <div className="flex gap-1">
                    <input
                        type="text"
                        value={textInput}
                        onChange={(e) => setTextInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Type text..."
                        className="min-w-0 flex-1 rounded-md bg-white/10 px-2 py-1.5 text-xs font-mono text-white outline-none focus:ring-1 focus:ring-emerald-400"
                        maxLength={50}
                    />
                    <button
                        onClick={handleTextRender}
                        className="shrink-0 rounded-md bg-emerald-600/50 px-2 py-1.5 text-xs transition hover:bg-emerald-500/70"
                        title="Render text to grid"
                    >
                        Render
                    </button>
                </div>

                <div className="flex items-center gap-2">
                    <span className="flex shrink-0 items-center gap-1 text-[10px] text-white/40">
                        Size
                        <InfoTooltip>
                            <p>{5 * fontScale}x{7 * fontScale}px per character</p>
                            <p className="pt-0.5 text-white/40">Renders centered on the grid</p>
                        </InfoTooltip>
                    </span>
                    <input
                        type="range"
                        min={1}
                        max={6}
                        value={fontScale}
                        onChange={(e) => setFontScale(Number(e.target.value))}
                        className="h-1 min-w-0 flex-1 cursor-pointer accent-emerald-500"
                    />
                    <span className="w-5 shrink-0 text-right text-[10px] text-white/60">{fontScale}x</span>
                </div>

                <div className="flex items-center gap-1.5">
                    <span className="shrink-0 text-[10px] text-white/40">Flow</span>
                    <button
                        onClick={() => setTextWrap(true)}
                        className={`flex-1 rounded-md px-1.5 py-1.5 text-[10px] transition ${textWrap
                            ? "bg-emerald-500/30 text-emerald-200 ring-1 ring-emerald-400/30"
                            : "bg-white/5 text-white/70 hover:bg-white/10"
                            }`}
                    >
                        Wrap
                    </button>
                    <button
                        onClick={() => setTextWrap(false)}
                        className={`flex-1 rounded-md px-1.5 py-1.5 text-[10px] transition ${!textWrap
                            ? "bg-emerald-500/30 text-emerald-200 ring-1 ring-emerald-400/30"
                            : "bg-white/5 text-white/70 hover:bg-white/10"
                            }`}
                    >
                        Overflow
                    </button>
                </div>

                <div className="flex flex-col gap-1.5">
                    <span className="text-[10px] text-white/40">Animation</span>
                    <div className="custom-scrollbar flex gap-1 overflow-x-auto pb-1">
                        {[
                            { id: "none", label: "None" },
                            { id: "Text Marquee", label: "Marquee" },
                            { id: "Typewriter", label: "Typewriter" },
                            { id: "Blink Text", label: "Blink" },
                            { id: "Rainbow Text", label: "Rainbow" },
                        ].map((anim) => (
                            <button
                                key={anim.id}
                                onClick={() => setTextAnimId(anim.id)}
                                className={`shrink-0 rounded-md px-1.5 py-1 text-[10px] transition ${textAnimId === anim.id
                                    ? "bg-emerald-500/30 text-emerald-200 ring-1 ring-emerald-400/30"
                                    : "bg-white/5 text-white/70 hover:bg-white/10"
                                    }`}
                            >
                                {anim.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
