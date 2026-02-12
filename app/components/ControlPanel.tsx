"use client";

import { useState } from "react";
import { ToolKind, RGB, BoardSettings } from "../types";
import ColorPicker from "./ColorPicker";
import PatternSelector from "./PatternSelector";

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
    onApplyPattern: (fn: (cols: number, rows: number, data: Uint8ClampedArray) => void) => void;
    onRenderText: (text: string, color: RGB, scale?: number) => void;
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
    onApplyPattern,
    onRenderText,
}: ControlPanelProps) {
    const [collapsed, setCollapsed] = useState(false);

    // ── Collapsed state: just a small toggle button ──────
    if (collapsed) {
        return (
            <button
                onClick={() => setCollapsed(false)}
                className="fixed top-2 left-2 sm:top-4 sm:left-4 z-10 flex items-center justify-center rounded-lg bg-black/80 px-3 py-2.5 sm:py-2 text-xs text-green-400 font-mono backdrop-blur-md shadow-lg border border-white/5 hover:bg-black/90 transition pointer-events-auto select-none min-h-11 sm:min-h-0"
                title="Show panel"
            >
                <svg width={14} height={14} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <path d="M4 6l4 4 4-4" />
                </svg>
                <span className="ml-1.5">LED Board</span>
            </button>
        );
    }

    return (
        <div className="fixed top-2 left-2 sm:top-4 sm:left-4 z-10 flex flex-col rounded-xl bg-black/80 text-xs text-white font-mono backdrop-blur-md select-none pointer-events-auto shadow-lg shadow-black/40 border border-white/5 w-[calc(100vw-1rem)] xs:w-56 sm:w-56 max-w-[16rem] max-h-[calc(100vh-1rem)] sm:max-h-[calc(100vh-2rem)] overflow-hidden">
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

                {/* Actions */}
                <div className="flex gap-2">
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
