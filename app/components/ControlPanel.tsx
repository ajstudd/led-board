"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { ToolKind, RGB, BoardSettings, AnimationConfig } from "../types";
import ColorPicker from "./ColorPicker";
import PatternSelector from "./PatternSelector";
import AnimationPanel from "./AnimationPanel";
import RecordingPanel from "./RecordingPanel";
import ExportPanel from "./ExportPanel";
import EffectsPanel from "./EffectsPanel";
import PaletteSelector from "./PaletteSelector";
import { AnimationState } from "../lib/animation";
import { RecordingState } from "../lib/sessionRecorder";
import { SessionRecorder } from "../lib/sessionRecorder";
import { RecordingMode } from "../lib/actionRecorder";
import { EffectPreset } from "../lib/effects";
import { LayerManager } from "../lib/layerManager";
import LayerPanel from "./LayerPanel";

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
    onReset: () => void;
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
    // Recording
    recordingMode: RecordingMode;
    recordingState: RecordingState;
    hasRecording: boolean;
    recFrameCount: number;
    recDuration: number;
    recPlaybackFrame: number;
    loopEnabled: boolean;
    onRecordingModeChange: (mode: RecordingMode) => void;
    onToggleLoop: () => void;
    onStartRecording: () => void;
    onStopRecording: () => void;
    onStartPlayback: () => void;
    onPausePlayback: () => void;
    onStopPlayback: () => void;
    onExportRecording: () => void;
    onImportRecording: (file: File) => void;
    onClearRecording: () => void;
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
    // Export
    exportRecorder: SessionRecorder;
    exportGetGridData: () => Uint8ClampedArray | null;
    exportHasRecording: boolean;
    // Palette
    activePaletteId: string | null;
    onSelectPalette: (id: string | null) => void;
    // Layer props
    layerManager: LayerManager | null;
    onLayerChange: () => void;
}

const TOOLS: { kind: ToolKind; label: string; shortLabel: string }[] = [
    { kind: "select", label: "Select", shortLabel: "Select" },
    { kind: "draw", label: "Draw", shortLabel: "Draw" },
    { kind: "erase", label: "Erase", shortLabel: "Erase" },
    { kind: "fill", label: "Fill", shortLabel: "Fill" },
    { kind: "vibe", label: "Vibe", shortLabel: "Vibe" },
];

// SVG icons for tools — compact and crisp
function ToolIcon({ kind, size = 14 }: { kind: ToolKind; size?: number }) {
    switch (kind) {
        case "select":
            return (
                <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 2.5l8 7-3.8.7-.7 3.8z" />
                    <path d="M8.5 8.5l3 4" />
                </svg>
            );
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

function AccordionSection({
    title,
    icon,
    isOpen,
    onToggle,
    children
}: {
    title: string;
    icon?: React.ReactNode;
    isOpen: boolean;
    onToggle: () => void;
    children: React.ReactNode;
}) {
    return (
        <div className="border border-white/5 bg-white/[0.02] rounded-lg">
            <button
                onClick={onToggle}
                className="w-full flex items-center justify-between px-3 py-2 sm:py-2 text-xs font-semibold hover:bg-white/5 transition text-white/80 rounded-lg"
            >
                <div className="flex items-center gap-2 text-emerald-400">
                    {icon}
                    <span className="text-white/80 uppercase tracking-widest text-[9px]">{title}</span>
                </div>
                <svg
                    className={`transition-transform duration-200 ${isOpen ? "rotate-90 text-white" : "text-white/40"}`}
                    width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                >
                    <polyline points="9 18 15 12 9 6" />
                </svg>
            </button>
            {isOpen && (
                <div className="p-3 border-t border-white/5 rounded-b-lg">
                    {children}
                </div>
            )}
        </div>
    );
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
    recordingMode,
    recordingState,
    hasRecording,
    recFrameCount,
    recDuration,
    recPlaybackFrame,
    loopEnabled,
    onRecordingModeChange,
    onToggleLoop,
    onStartRecording,
    onStopRecording,
    onStartPlayback,
    onPausePlayback,
    onStopPlayback,
    onExportRecording,
    onImportRecording,
    onClearRecording,
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
    exportRecorder,
    exportGetGridData,
    exportHasRecording,
    activePaletteId,
    onSelectPalette,
    onReset,
    layerManager,
    onLayerChange,
}: ControlPanelProps) {
    const [collapsed, setCollapsed] = useState(false);
    const [openSections, setOpenSections] = useState<Record<string, boolean>>({
        tools: true,
        layers: true,
        patterns: true,
        animations: true,
        effects: true,
        gestures: true,
        session: true,
    });

    const toggleSection = (id: string) => {
        setOpenSections((prev) => ({
            ...prev,
            [id]: !prev[id],
        }));
    };

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
                            disabled={settings.cellSize <= 1}
                            className={`rounded px-1.5 py-0.5 text-[10px] transition min-h-6 sm:min-h-0 ${settings.cellSize <= 1 ? "opacity-30 cursor-not-allowed bg-white/5" : "bg-white/10 hover:bg-white/20 text-white/70"
                                }`}
                            title="Decrease cell size"
                        >
                            −
                        </button>
                        <input
                            type="range"
                            min={1}
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
                        <span>1px (more cells)</span>
                        <span>40px (larger)</span>
                    </div>
                    {settings.cellSize === 1 && (
                        <div className="text-[9px] text-yellow-400/70 flex items-center gap-1 mt-0.5">
                            <span>⚠</span>
                            <span>1px cells = millions of pixels — may be slow on some devices</span>
                        </div>
                    )}
                </div>

                {/* Separator */}
                <div className="h-px bg-white/10" />

                <div className="flex flex-col gap-2 relative">
                    <AccordionSection title="Drawing Tools" isOpen={!!openSections.tools} onToggle={() => toggleSection("tools")}>
                        <div className="flex gap-1 flex-wrap items-center mb-4">
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
                        </div>
                        <div className="mb-4">
                            <ColorPicker activeColor={activeColor} onColorChange={onColorChange} activePaletteId={activePaletteId} />
                        </div>
                        <PaletteSelector
                            activePaletteId={activePaletteId}
                            onSelectPalette={onSelectPalette}
                            activeColor={activeColor}
                        />
                    </AccordionSection>

                    <AccordionSection title="Layers" isOpen={!!openSections.layers} onToggle={() => toggleSection("layers")}>
                        <LayerPanel layerManager={layerManager} onLayerChange={onLayerChange} />
                    </AccordionSection>

                    <AccordionSection title="Patterns & Text" isOpen={!!openSections.patterns} onToggle={() => toggleSection("patterns")}>
                        <PatternSelector
                            onApplyPattern={onApplyPattern}
                            onRenderText={onRenderText}
                            activeColor={activeColor}
                        />
                    </AccordionSection>

                    <AccordionSection title="Animations" isOpen={!!openSections.animations} onToggle={() => toggleSection("animations")}>
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
                    </AccordionSection>

                    <AccordionSection title="VFX Shaders" isOpen={!!openSections.effects} onToggle={() => toggleSection("effects")}>
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
                    </AccordionSection>

                    <AccordionSection title="AI Gestures" isOpen={!!openSections.gestures} onToggle={() => toggleSection("gestures")}>
                        <div className="flex flex-col gap-1.5">
                            <button
                                onClick={onToggleGesture}
                                className={`w-full rounded border px-2 py-2 sm:py-1.5 text-xs transition text-left min-h-9 sm:min-h-0 flex items-center gap-2 ${gestureEnabled ? 'bg-purple-900/60 border-purple-500/40 text-purple-200' : 'bg-white/10 hover:bg-white/20 border-white/5'} `}
                            >
                                <span>Magic Hand AI</span>
                                {gestureEnabled ? (
                                    <span className="ml-auto text-purple-400 animate-pulse text-[10px]">● ON</span>
                                ) : (
                                    <span className="ml-auto text-white/30 text-[10px]">OFF</span>
                                )}
                            </button>

                            {gestureEnabled && (
                                <div className="flex flex-col gap-2 mt-2">
                                    <div className={`flex items-center gap-2 rounded px-2 py-1.5 text-[10px] font-mono border ${gestureLoadState === "ready"
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
                                        {gestureLoadState === "ready" && (
                                            <button
                                                onClick={onToggleGestureCamera}
                                                className="px-1.5 py-0.5 rounded bg-white/10 hover:bg-white/20 text-[9px] transition shrink-0"
                                            >
                                                {gestureShowCamera ? "hide cam" : "show cam"}
                                            </button>
                                        )}
                                    </div>

                                    <div className={`relative rounded overflow-hidden border transition-all duration-200 ${gestureShowCamera ? "h-28" : "h-0 opacity-0"
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
                                            <div className="absolute inset-0 bg-black/75 flex items-center justify-center text-[9px] text-white/50 text-center px-2">
                                                {gestureStatusMsg}
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex flex-col gap-1 mt-1">
                                        <div className="flex justify-between text-[9px] text-white/50 px-1">
                                            <span>Pinch Sensitivity</span>
                                            <span>{gesturePinchThreshold.toFixed(2)}</span>
                                        </div>
                                        <input
                                            type="range"
                                            min="0.02"
                                            max="0.15"
                                            step="0.01"
                                            value={gesturePinchThreshold}
                                            onChange={(e) => onGesturePinchThresholdChange(parseFloat(e.target.value))}
                                            className="w-full accent-purple-400 h-1"
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    </AccordionSection>

                    <AccordionSection title="Session & Rendering" isOpen={!!openSections.session} onToggle={() => toggleSection("session")}>
                        <RecordingPanel
                            recordingMode={recordingMode}
                            recordingState={recordingState}
                            hasRecording={hasRecording}
                            frameCount={recFrameCount}
                            duration={recDuration}
                            playbackFrame={recPlaybackFrame}
                            loopEnabled={loopEnabled}
                            onRecordingModeChange={onRecordingModeChange}
                            onToggleLoop={onToggleLoop}
                            onStartRecording={onStartRecording}
                            onStopRecording={onStopRecording}
                            onStartPlayback={onStartPlayback}
                            onPausePlayback={onPausePlayback}
                            onStopPlayback={onStopPlayback}
                            onExportRecording={onExportRecording}
                            onImportRecording={onImportRecording}
                            onClearRecording={onClearRecording}
                        />
                        <div className="h-px bg-white/10 my-3" />
                        <ExportPanel
                            cols={gridDims.cols}
                            rows={gridDims.rows}
                            getGridData={exportGetGridData}
                            recorder={exportRecorder}
                            hasRecording={exportHasRecording}
                        />
                    </AccordionSection>
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
                        className="flex-1 rounded bg-red-600/40 px-2 py-2 sm:py-1.5 text-xs hover:bg-red-500/55 transition min-h-9 sm:min-h-0"
                    >
                        Clear Canvas
                    </button>
                    <button
                        onClick={onReset}
                        className="flex-1 rounded bg-white/10 px-2 py-2 sm:py-1.5 text-xs hover:bg-white/20 transition min-h-9 sm:min-h-0"
                    >
                        Reset Workspace
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
