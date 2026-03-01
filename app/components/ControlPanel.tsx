"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { ToolKind, RGB, BoardSettings, AnimationConfig } from "../types";
import ColorPicker from "./ColorPicker";
import PatternSelector from "./PatternSelector";
import AnimationPanel from "./AnimationPanel";
import EffectsPanel from "./EffectsPanel";
import { AnimationState } from "../lib/animation";
import { EffectPreset } from "../lib/effects";
import InfoTooltip from "./InfoTooltip";

/** Small canvas that mirrors the gesture video feed at ~15 fps */
function GestureCameraPreview({
    videoRef,
    visible,
    ready,
}: {
    videoRef: React.RefObject<HTMLVideoElement | null>;
    visible: boolean;
    ready: boolean;
}) {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        if (!visible || !ready) return;
        let rafId = 0;
        const draw = () => {
            const video = videoRef.current;
            const canvas = canvasRef.current;
            if (video && canvas && video.readyState >= 2) {
                const ctx = canvas.getContext("2d");
                if (ctx) {
                    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
                        canvas.width = video.videoWidth || 320;
                        canvas.height = video.videoHeight || 240;
                    }
                    ctx.save();
                    ctx.translate(canvas.width, 0);
                    ctx.scale(-1, 1);
                    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                    ctx.restore();
                }
            }
            rafId = requestAnimationFrame(draw);
        };
        rafId = requestAnimationFrame(draw);
        return () => cancelAnimationFrame(rafId);
    }, [videoRef, visible, ready]);

    return (
        <canvas
            ref={canvasRef}
            className="block w-full h-full object-cover"
        />
    );
}

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
    onRenderText: (text: string, color: RGB, scale?: number, wrap?: boolean) => void;
    onCellSizeChange: (size: number) => void;
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
    // Effects
    effectsEnabled: boolean;
    activeEffectPreset: EffectPreset;
    effectsDistanceMultiplier: number;
    effectsSpeedMultiplier: number;
    onToggleEffects: () => void;
    onSelectEffectPreset: (preset: EffectPreset) => void;
    onEffectsDistanceChange: (v: number) => void;
    onEffectsSpeedChange: (v: number) => void;
    // Gesture
    gestureEnabled: boolean;
    onToggleGesture: () => void;
    gestureVideoRef: React.RefObject<HTMLVideoElement | null>;
    gestureLoadState: "loading" | "ready" | "error";
    gestureStatusMsg: string;
    gesturePinching: boolean;
    gesturePinchThreshold: number;
    onGesturePinchThresholdChange: (v: number) => void;
    gestureShowCamera: boolean;
    onToggleGestureCamera: () => void;
    /** Forwarded ref so LEDBoard can hit-test pinch events against the panel */
    panelRef: React.RefObject<HTMLDivElement | null>;
}

const TOOLS: { kind: ToolKind; label: string; shortLabel: string }[] = [
    { kind: "draw", label: "Draw", shortLabel: "Draw" },
    { kind: "erase", label: "Erase", shortLabel: "Erase" },
    { kind: "fill", label: "Fill", shortLabel: "Fill" },
    { kind: "vibe", label: "Vibe", shortLabel: "Vibe" },
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
        case "vibe":
            return (
                <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="8" cy="8" r="2" />
                    <path d="M8 1v2M8 13v2M1 8h2M13 8h2" />
                    <path d="M3.5 3.5l1.5 1.5M11 11l1.5 1.5M3.5 12.5l1.5-1.5M11 5l1.5-1.5" />
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
    onCellSizeChange,
    animState,
    currentAnim,
    animFps,
    animFrame,
    onSelectAnimation,
    onAnimPlay,
    onAnimPause,
    onAnimStop,
    onAnimFpsChange,
    effectsEnabled,
    activeEffectPreset,
    effectsDistanceMultiplier,
    effectsSpeedMultiplier,
    onToggleEffects,
    onSelectEffectPreset,
    onEffectsDistanceChange,
    onEffectsSpeedChange,
    gestureEnabled,
    onToggleGesture,
    gestureVideoRef,
    gestureLoadState,
    gestureStatusMsg,
    gesturePinching,
    gesturePinchThreshold,
    onGesturePinchThresholdChange,
    gestureShowCamera,
    onToggleGestureCamera,
    panelRef,
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
        <div ref={panelRef} className="panel-slide-in fixed top-2 left-2 sm:top-4 sm:left-4 z-10 flex flex-col rounded-xl bg-black/80 text-xs text-white font-mono backdrop-blur-md select-none pointer-events-auto shadow-lg shadow-black/40 border border-white/5 w-[calc(100vw-1rem)] xs:w-56 sm:w-56 max-w-[16rem] max-h-[calc(100vh-1rem)] sm:max-h-[calc(100vh-2rem)] overflow-hidden">
            {/* Header — always visible, not scrollable */}
            <div className="flex items-center justify-between px-3 sm:px-4 pt-2 sm:pt-3 pb-1.5 sm:pb-2 shrink-0">
                <div className="text-sm font-semibold tracking-wide text-green-400">
                    Tenix
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
            <div data-gesture-scroll className="flex-1 overflow-y-auto overflow-x-hidden px-3 sm:px-4 pb-3 space-y-2.5 sm:space-y-3 thin-scrollbar">
                {/* Grid info */}
                <div className="text-white/60 text-[10px] sm:text-xs">
                    {gridDims.cols}×{gridDims.rows} ({(gridDims.cols * gridDims.rows).toLocaleString()}{" "}
                    cells) · {settings.cellSize}px
                </div>

                {/* Cell Size Slider */}
                <div className="flex flex-col gap-1">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] uppercase tracking-widest text-white/40">Cell Size</span>
                        <span className="text-[10px] text-white/60 tabular-nums">{settings.cellSize}px</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => onCellSizeChange(settings.cellSize - 1)}
                            disabled={settings.cellSize <= 2}
                            className={`rounded px-1.5 py-0.5 text-[10px] transition min-h-6 sm:min-h-0 ${settings.cellSize <= 2 ? "opacity-30 cursor-not-allowed bg-white/5" : "bg-white/10 hover:bg-white/20 text-white/70"
                                }`}
                            title="Decrease cell size"
                        >
                            −
                        </button>
                        <input
                            type="range"
                            min={2}
                            max={40}
                            step={1}
                            value={settings.cellSize}
                            onChange={(e) => onCellSizeChange(parseInt(e.target.value, 10))}
                            className="flex-1 accent-green-400 cursor-pointer h-1"
                        />
                        <button
                            onClick={() => onCellSizeChange(settings.cellSize + 1)}
                            disabled={settings.cellSize >= 40}
                            className={`rounded px-1.5 py-0.5 text-[10px] transition min-h-6 sm:min-h-0 ${settings.cellSize >= 40 ? "opacity-30 cursor-not-allowed bg-white/5" : "bg-white/10 hover:bg-white/20 text-white/70"
                                }`}
                            title="Increase cell size"
                        >
                            +
                        </button>
                    </div>
                    <div className="flex items-center justify-between text-[9px] text-white/30">
                        <span>2px (more cells)</span>
                        <span>40px (larger)</span>
                    </div>
                </div>

                {/* Separator */}
                <div className="h-px bg-white/10" />

                {/* Tools */}
                <div>
                    <div className="mb-1 text-[10px] uppercase tracking-widest text-white/40">
                        Tools
                    </div>
                    <div className="flex gap-1 flex-wrap items-center">
                        {TOOLS.map((t) => (
                            <button
                                key={t.kind}
                                onClick={() => onToolChange(t.kind)}
                                className={`flex items-center gap-1 rounded px-2 py-2 sm:py-1.5 text-[11px] transition shrink-0 min-h-9 sm:min-h-0 ${activeTool === t.kind
                                    ? t.kind === "vibe"
                                        ? "bg-fuchsia-500/30 text-fuchsia-300 ring-1 ring-fuchsia-500/50"
                                        : "bg-green-500/30 text-green-300 ring-1 ring-green-500/50"
                                    : "bg-white/5 text-white/70 hover:bg-white/10"
                                    }`}
                                title={t.label}
                            >
                                <ToolIcon kind={t.kind} size={12} />
                                <span className="leading-none">{t.shortLabel}</span>
                            </button>
                        ))}
                        <InfoTooltip title="Tools &amp; Shortcuts" width={200}>
                            <ul className="flex flex-col gap-1">
                                <li>✏ Draw — click or drag to paint</li>
                                <li>◻ Erase — click or drag to erase</li>
                                <li>◼ Fill — click to flood-fill a region</li>
                                <li>✦ Vibe — drag for pixel effects only</li>
                                <li className="pt-0.5 text-white/50"><span className="text-white/70">F</span> fullscreen · <span className="text-white/70">Space</span> pause / play</li>
                            </ul>
                        </InfoTooltip>
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

                {/* Pixel Effects */}
                <EffectsPanel
                    enabled={effectsEnabled}
                    activePreset={activeEffectPreset}
                    distanceMultiplier={effectsDistanceMultiplier}
                    speedMultiplier={effectsSpeedMultiplier}
                    onToggle={onToggleEffects}
                    onSelectPreset={onSelectEffectPreset}
                    onDistanceChange={onEffectsDistanceChange}
                    onSpeedChange={onEffectsSpeedChange}
                />

                {/* Separator */}
                <div className="h-px bg-white/10" />

                {/* Gesture Control */}
                <div className="flex flex-col gap-1.5">
                    {/* Toggle row */}
                    <button
                        onClick={onToggleGesture}
                        className="w-full rounded bg-white/10 px-2 py-2 sm:py-1.5 text-xs hover:bg-white/20 transition text-left min-h-9 sm:min-h-0 flex items-center gap-2"
                    >
                        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity={0.7}>
                            <path d="M18 11V6a2 2 0 00-2-2 2 2 0 00-2 2" />
                            <path d="M14 10V4a2 2 0 00-2-2 2 2 0 00-2 2v2" />
                            <path d="M10 10.5V6a2 2 0 00-2-2 2 2 0 00-2 2v8" />
                            <path d="M18 8a2 2 0 114 0v6a8 8 0 01-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 012.83-2.82L7 15" />
                        </svg>
                        <span>Gesture Control</span>
                        {gestureEnabled && (
                            <span className="ml-auto text-purple-400 animate-pulse text-[10px]">● ON</span>
                        )}
                    </button>

                    {gestureEnabled && (
                        <div className="flex flex-col gap-1.5 pl-1">
                            {/* Status pill */}
                            <div className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-[10px] font-mono border ${gestureLoadState === "ready"
                                ? "bg-purple-950/60 border-purple-500/30 text-purple-200"
                                : gestureLoadState === "error"
                                    ? "bg-red-950/60 border-red-500/30 text-red-300"
                                    : "bg-black/40 border-white/10 text-white/40"
                                }`}>
                                <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${gestureLoadState === "ready"
                                    ? gesturePinching ? "bg-yellow-400 animate-ping" : "bg-purple-400 animate-pulse"
                                    : gestureLoadState === "error" ? "bg-red-400" : "bg-blue-400 animate-pulse"
                                    }`} />
                                <span className="flex-1 truncate">{gestureStatusMsg}</span>
                                {/* Camera toggle */}
                                {gestureLoadState === "ready" && (
                                    <button
                                        onClick={onToggleGestureCamera}
                                        className="px-1.5 py-0.5 rounded bg-white/10 hover:bg-white/20 text-[9px] transition shrink-0"
                                        title={gestureShowCamera ? "Hide camera" : "Show camera"}
                                    >
                                        {gestureShowCamera ? "hide cam" : "show cam"}
                                    </button>
                                )}
                            </div>

                            {/* Camera preview -- canvas mirrors the video feed which lives in LEDBoard */}
                            <div className={`relative rounded-lg overflow-hidden border transition-all duration-200 ${gestureShowCamera ? "h-28" : "h-0 opacity-0 pointer-events-none"
                                } ${gestureLoadState === "ready"
                                    ? gesturePinching ? "border-yellow-500/50" : "border-purple-500/30"
                                    : "border-white/10"
                                }`}>
                                <GestureCameraPreview
                                    videoRef={gestureVideoRef}
                                    visible={gestureShowCamera}
                                    ready={gestureLoadState === "ready"}
                                />
                                {gestureLoadState !== "ready" && gestureShowCamera && (
                                    <div className="absolute inset-0 bg-black/75 flex items-center justify-center text-[9px] text-white/50 font-mono px-2 text-center leading-tight">
                                        {gestureStatusMsg}
                                    </div>
                                )}
                                {gestureLoadState === "ready" && (
                                    <div className="absolute top-1 left-1 text-[7px] text-white/30 bg-black/50 rounded px-1 font-mono">LIVE</div>
                                )}
                                {gesturePinching && (
                                    <div className="absolute inset-0 border-2 border-yellow-400/50 rounded-lg pointer-events-none animate-pulse" />
                                )}
                            </div>

                            {/* Pinch sensitivity */}
                            {gestureLoadState === "ready" && (
                                <div className="flex items-center gap-2 text-[9px] text-white/40">
                                    <span className="shrink-0">Pinch sens</span>
                                    <input
                                        type="range" min={3} max={15} step={1}
                                        value={Math.round(gesturePinchThreshold * 100)}
                                        onChange={(e) => onGesturePinchThresholdChange(parseInt(e.target.value) / 100)}
                                        className="flex-1 accent-purple-400 cursor-pointer"
                                    />
                                    <span className="w-4 text-right">{Math.round(gesturePinchThreshold * 100)}</span>
                                </div>
                            )}

                            {/* Info tooltip */}
                            <InfoTooltip title="Gesture Controls">
                                <ul className="flex flex-col gap-1">
                                    <li>☝ Point finger → moves cursor</li>
                                    <li>🤌 Pinch → click / draw (hold = drag)</li>
                                    <li>✌ Two fingers up/down → scroll panel</li>
                                    <li>🫲 Slap (thumb out, 4 fingers together) → clear board</li>
                                    <li className="text-white/40 pt-0.5">Enable Pixel Effects for glow on draw</li>
                                </ul>
                            </InfoTooltip>
                        </div>
                    )}
                </div>

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


            </div>
        </div>
    );
}
