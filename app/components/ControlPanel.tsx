"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { ToolKind, RGB, BoardSettings, AnimationConfig } from "../types";
import ColorPicker from "./ColorPicker";
import PatternSelector from "./PatternSelector";
import AnimationPanel from "./AnimationPanel";
import { AnimationState } from "../lib/animation";

interface ControlPanelProps {
    activeTool: ToolKind;
    activeColor: RGB;
    settings: BoardSettings;
    gridDims: { cols: number; rows: number };
    cellInfo: { col: number; row: number; color: RGB } | null;
    onToolChange: (tool: ToolKind) => void;
    onColorChange: (color: RGB) => void;
    onToggleGrid: () => void;
    onClear: () => void;
    onUndo: () => void;
    canUndo: boolean;
    onApplyPattern: (fn: (cols: number, rows: number, data: Uint8ClampedArray) => void) => void;
    onRenderText: (text: string, color: RGB, scale?: number) => void;
    // Animation
    animState: AnimationState;
    currentAnim: AnimationConfig | null;
    animFps: number;
    animFrame: number;
    onSelectAnimation: (anim: AnimationConfig) => void;
    onAnimPlay: () => void;
    onAnimPause: () => void;
    onAnimStop: () => void;
    onAnimFpsChange: (fps: number) => void;
}

const TOOLS: { kind: ToolKind; label: string; shortLabel: string }[] = [
    { kind: "draw", label: "Draw", shortLabel: "Draw" },
    { kind: "erase", label: "Erase", shortLabel: "Erase" },
    { kind: "fill", label: "Fill", shortLabel: "Fill" },
];

// SVG icons for tools — compact and crisp
function ToolIcon({ kind, size = 14 }: { kind: ToolKind; size?: number }) {
    switch (kind) {
        case "draw":
            return (
                <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11.5 1.5l3 3-9 9H2.5v-3z" />
                    <path d="M9.5 3.5l3 3" />
                </svg>
            );
        case "erase":
            return (
                <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 13H7l-4.3-4.3a1 1 0 010-1.4l6-6a1 1 0 011.4 0L14.4 5.6a1 1 0 010 1.4L10 11.5" />
                    <path d="M4 13h10" />
                </svg>
            );
        case "fill":
            return (
                <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2.5 10.5l5-9 5 9a5 5 0 01-10 0z" />
                    <path d="M2.5 10.5h10" />
                </svg>
            );
    }
}

export default function ControlPanel({
    activeTool,
    activeColor,
    settings,
    gridDims,
    cellInfo,
    onToolChange,
    onColorChange,
    onToggleGrid,
    onClear,
    onUndo,
    canUndo,
    onApplyPattern,
    onRenderText,
    animState,
    currentAnim,
    animFps,
    animFrame,
    onSelectAnimation,
    onAnimPlay,
    onAnimPause,
    onAnimStop,
    onAnimFpsChange,
}: ControlPanelProps) {
    const [collapsed, setCollapsed] = useState(false);

    // ── Swipe-to-open on mobile ──────────────────────────
    const touchStartX = useRef(0);
    const touchStartY = useRef(0);

    const handleTouchStart = useCallback((e: TouchEvent) => {
        // Only track swipes starting from the left edge (first 30px)
        if (e.touches[0].clientX < 30) {
            touchStartX.current = e.touches[0].clientX;
            touchStartY.current = e.touches[0].clientY;
        } else {
            touchStartX.current = -1;
        }
    }, []);

    const handleTouchEnd = useCallback(
        (e: TouchEvent) => {
            if (touchStartX.current < 0 || !collapsed) return;
            const dx = e.changedTouches[0].clientX - touchStartX.current;
            const dy = Math.abs(e.changedTouches[0].clientY - touchStartY.current);
            // Swipe right at least 40px and mostly horizontal
            if (dx > 40 && dy < dx) {
                setCollapsed(false);
            }
        },
        [collapsed],
    );

    useEffect(() => {
        window.addEventListener("touchstart", handleTouchStart, { passive: true });
        window.addEventListener("touchend", handleTouchEnd, { passive: true });
        return () => {
            window.removeEventListener("touchstart", handleTouchStart);
            window.removeEventListener("touchend", handleTouchEnd);
        };
    }, [handleTouchStart, handleTouchEnd]);

    // ── Collapsed state: just a tiny ">" arrow on edge ───
    if (collapsed) {
        return (
            <div className="panel-tab-container fixed top-1/2 -translate-y-1/2 left-0 z-10 pointer-events-auto select-none">
                <button
                    onClick={() => setCollapsed(false)}
                    className="panel-tab group relative flex items-center justify-center w-6 h-14 sm:w-5 sm:h-12 cursor-pointer"
                    title="Open panel"
                    aria-label="Open panel"
                >
                    {/* Curved backdrop — visible on hover / focus */}
                    <span className="absolute inset-0 rounded-r-xl bg-white/0 group-hover:bg-white/10 group-focus-visible:bg-white/10 transition-all duration-200 backdrop-blur-none group-hover:backdrop-blur-md group-focus-visible:backdrop-blur-md shadow-none group-hover:shadow-lg group-hover:shadow-black/30 border-y border-r border-transparent group-hover:border-white/10" />
                    {/* Arrow */}
                    <svg
                        className="relative z-1 text-white/30 group-hover:text-green-400 transition-colors duration-200"
                        width={12}
                        height={12}
                        viewBox="0 0 16 16"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    >
                        <path d="M6 3l5 5-5 5" />
                    </svg>
                </button>
            </div>
        );
    }

    return (
        <div className="panel-slide-in fixed top-2 left-2 sm:top-4 sm:left-4 z-10 flex flex-col rounded-xl bg-black/80 text-xs text-white font-mono backdrop-blur-md select-none pointer-events-auto shadow-lg shadow-black/40 border border-white/5 w-[calc(100vw-1rem)] xs:w-56 sm:w-56 max-w-[16rem] max-h-[calc(100vh-1rem)] sm:max-h-[calc(100vh-2rem)] overflow-hidden">
            {/* Header — always visible, not scrollable */}
            <div className="flex items-center justify-between px-3 sm:px-4 pt-2 sm:pt-3 pb-1.5 sm:pb-2 shrink-0">
                <div className="text-sm font-semibold tracking-wide text-green-400">
                    LED Board
                </div>
                <button
                    onClick={() => setCollapsed(true)}
                    className="rounded p-1.5 sm:p-0.5 text-white/40 hover:text-white/80 hover:bg-white/10 transition min-h-11 min-w-11 sm:min-h-0 sm:min-w-0 flex items-center justify-center"
                    title="Hide panel"
                >
                    <svg width={14} height={14} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                        <path d="M4 4l8 8M12 4l-8 8" />
                    </svg>
                </button>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden px-3 sm:px-4 pb-3 space-y-2.5 sm:space-y-3 thin-scrollbar pr-4 sm:pr-5">
                {/* Grid info */}
                <div className="text-white/60 text-[10px] sm:text-xs">
                    {gridDims.cols}×{gridDims.rows} ({(gridDims.cols * gridDims.rows).toLocaleString()}{" "}
                    cells) · {settings.cellSize}px
                </div>

                {/* Separator */}
                <div className="h-px bg-white/10" />

                {/* Tools */}
                <div>
                    <div className="mb-1 text-[10px] uppercase tracking-widest text-white/40">
                        Tools
                    </div>
                    <div className="flex gap-1 flex-wrap">
                        {TOOLS.map((t) => (
                            <button
                                key={t.kind}
                                onClick={() => onToolChange(t.kind)}
                                className={`flex items-center gap-1 rounded px-2 py-2 sm:py-1.5 text-[11px] transition shrink-0 min-h-9 sm:min-h-0 ${activeTool === t.kind
                                    ? "bg-green-500/30 text-green-300 ring-1 ring-green-500/50"
                                    : "bg-white/5 text-white/70 hover:bg-white/10"
                                    }`}
                                title={t.label}
                            >
                                <ToolIcon kind={t.kind} size={12} />
                                <span className="leading-none">{t.shortLabel}</span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Separator */}
                <div className="h-px bg-white/10" />

                {/* Color Picker */}
                <div>
                    <div className="mb-1 text-[10px] uppercase tracking-widest text-white/40">
                        Colour
                    </div>
                    <ColorPicker activeColor={activeColor} onColorChange={onColorChange} />
                </div>

                {/* Separator */}
                <div className="h-px bg-white/10" />

                {/* Patterns & Text */}
                <PatternSelector
                    onApplyPattern={onApplyPattern}
                    onRenderText={onRenderText}
                    activeColor={activeColor}
                />

                {/* Separator */}
                <div className="h-px bg-white/10" />

                {/* Animations */}
                <AnimationPanel
                    animState={animState}
                    currentAnim={currentAnim}
                    fps={animFps}
                    frame={animFrame}
                    onSelectAnimation={onSelectAnimation}
                    onPlay={onAnimPlay}
                    onPause={onAnimPause}
                    onStop={onAnimStop}
                    onFpsChange={onAnimFpsChange}
                />

                {/* Separator */}
                <div className="h-px bg-white/10" />

                {/* Actions */}
                <div className="flex gap-2 flex-wrap">
                    <button
                        onClick={onUndo}
                        disabled={!canUndo}
                        className={`rounded bg-white/10 px-2 py-2 sm:py-1.5 text-xs transition min-h-9 sm:min-h-0 ${canUndo ? "hover:bg-white/20" : "opacity-30 cursor-not-allowed"
                            }`}
                        title="Undo (Ctrl+Z)"
                    >
                        ↩ Undo
                    </button>
                    <button
                        onClick={onToggleGrid}
                        className="flex-1 rounded bg-white/10 px-2 py-2 sm:py-1.5 text-xs hover:bg-white/20 transition min-h-9 sm:min-h-0"
                    >
                        {settings.showGrid ? "Hide Grid" : "Show Grid"}
                    </button>
                    <button
                        onClick={onClear}
                        className="flex-1 rounded bg-red-600/50 px-2 py-2 sm:py-1.5 text-xs hover:bg-red-500/70 transition min-h-9 sm:min-h-0"
                    >
                        Clear
                    </button>
                </div>

                {/* Cell info */}
                {cellInfo && (
                    <div className="flex items-center gap-1.5 text-white/50 text-[10px]">
                        <span>
                            ({cellInfo.col}, {cellInfo.row})
                        </span>
                        <span
                            className="inline-block h-3 w-3 rounded-sm border border-white/20"
                            style={{
                                backgroundColor: `rgb(${cellInfo.color[0]},${cellInfo.color[1]},${cellInfo.color[2]})`,
                            }}
                        />
                    </div>
                )}

                {/* Hint */}
                <div className="text-white/30 text-[10px]">
                    {activeTool === "draw" && "Click or drag to paint"}
                    {activeTool === "erase" && "Click or drag to erase"}
                    {activeTool === "fill" && "Click to flood-fill a region"}
                </div>
            </div>
        </div>
    );
}
