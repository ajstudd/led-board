"use client";

/* eslint-disable react-hooks/preserve-manual-memoization */

import { useRef, useState, useCallback, useEffect } from "react";
import ControlPanel from "./ControlPanel";
import { DEFAULT_SETTINGS, AnimationConfig, BoardSettings, RGB, SerializedBoardState, SerializedLayerState, ToolKind } from "../types";
import { renderTextCentered, renderTextToWideBuffer, measureText } from "../lib/font";
import { ANIMATIONS, captureSnapshot, setMarqueeBuffer, MARQUEE_ANIMATION } from "../lib/animations";
import { PATTERNS } from "../lib/patterns";
import { TEXT_ANIMATIONS } from "../lib/textAnimations";
import { strokeRecorder } from "../lib/recorder";
import { base64ToUint8, hslToRgb, uint8ToBase64 } from "../lib/utils";
import GestureController, { GestureLoadState } from "./GestureController";
import LEDCanvas, { CanvasHandle } from "./Canvas";
import { getPaletteById } from "../lib/palette";
import TimelinePanel from "./TimelinePanel";
import { EffectPreset, EFFECT_PRESETS } from "../lib/effects";
import { RecordingState, sessionRecorder } from "../lib/sessionRecorder";
import { actionRecorder, ActionEvent, RecordedActionInput, RecordingMode } from "../lib/actionRecorder";
import type { LayerManager } from "../lib/layerManager";
import { createSeed, getSeed, setSeed } from "../lib/seededRng";
// Custom Hooks
import { useLayerManager } from "../hooks/useLayerManager";
import { useSessionRecording } from "../hooks/useSessionRecording";
import { useGestures } from "../hooks/useGestures";
import { useTimelineEngine } from "../hooks/useTimelineEngine";
import { useBoardExport } from "../hooks/useBoardExport";
import { useBoardActions, ContentLayer } from "../hooks/useBoardActions";
import { 
    useBoardPersistence, 
    STORAGE_KEY_CELL_SIZE, STORAGE_KEY_EFFECTS, 
    STORAGE_KEY_EFFECT_PRESET, STORAGE_KEY_EFFECT_DISTANCE, 
    STORAGE_KEY_EFFECT_SPEED,
    STORAGE_KEY_COLOR, STORAGE_KEY_TOOL, STORAGE_KEY_SHOW_GRID 
} from "../hooks/useBoardPersistence";
import { useBoardShortcuts } from "../hooks/useBoardShortcuts";
import { usePhysicsEngine } from "../hooks/usePhysicsEngine";
import type { PresetName } from "../lib/physics/presets";

const STORAGE_KEY_ANIM  = "tenix-anim";
const STORAGE_KEY_GRID  = "tenix-grid";
const MAX_UNDO = 50;
const PERSISTED_WORKSPACE_KEYS = [
    STORAGE_KEY_ANIM,
    STORAGE_KEY_COLOR,
    STORAGE_KEY_TOOL,
    STORAGE_KEY_GRID,
    STORAGE_KEY_SHOW_GRID,
    STORAGE_KEY_EFFECTS,
    STORAGE_KEY_EFFECT_PRESET,
    STORAGE_KEY_EFFECT_DISTANCE,
    STORAGE_KEY_EFFECT_SPEED,
    STORAGE_KEY_CELL_SIZE,
] as const;

function compositeGridWithEffects(manager: LayerManager): Uint8ClampedArray {
    const raw = manager.composite();
    const overlay = manager.compositeEffectsOverlay();
    if (!overlay.buffer || overlay.cols === 0) return raw;

    const len = manager.cols * manager.rows;
    const out = new Uint8ClampedArray(len * 3);
    const buf = overlay.buffer;

    for (let i = 0, j = 0; i < len; i++, j += 4) {
        const si = i * 3;
        const a = buf[j + 3] / 255;
        out[si] = Math.min(255, raw[si] + buf[j] * a);
        out[si + 1] = Math.min(255, raw[si + 1] + buf[j + 1] * a);
        out[si + 2] = Math.min(255, raw[si + 2] + buf[j + 2] * a);
    }

    return out;
}

export default function LEDBoard() {
    const canvasHandleRef = useRef<CanvasHandle>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const gestureStrokeRef = useRef(false);
    const strokeActiveRef = useRef(false);

    const [settings, setSettings] = useState<BoardSettings>(DEFAULT_SETTINGS);
    const [activeTool, setActiveTool] = useState<ToolKind>("draw");
    const [activeColor, setActiveColor] = useState<RGB>([0, 255, 0]);
    const [cellInfo, setCellInfo] = useState<{
        col: number;
        row: number;
        color: RGB;
    } | null>(null);
    const [gridDims, setGridDims] = useState<{ cols: number; rows: number }>({
        cols: 0,
        rows: 0,
    });
    const [activePaletteId, setActivePaletteId] = useState<string | null>(null);

    const snapshotRef = useRef<Uint8ClampedArray | null>(null);
    const contentLayersRef = useRef<ContentLayer[]>([]);
    const undoStackRef = useRef<Uint8ClampedArray[]>([]);
    const [canUndo, setCanUndo] = useState(false);
    const saveGridToStorageRef = useRef<() => void>(() => {});

    const {
        managerRef: layerManagerRef,
        layerUpdateTick,
        initManager: initLayerManager,
        replaceManager,
        handleLayerChange
    } = useLayerManager(
        useCallback(() => canvasHandleRef.current?.redraw(), []),
        useCallback(() => saveGridToStorageRef.current(), [])
    );

    // ── Per-layer animation/effects state (synced to active layer) ──
    // These refs always point to the ACTIVE layer's animation/effects.
    // When the user switches layers, we update these pointers.
    const animRef = useRef<import('../lib/animation').AnimationManager | null>(null);
    const effectsRef = useRef<import('../lib/effects').EffectsEngine | null>(null);

    const [animState, setAnimState] = useState<import('../lib/animation').AnimationState>("stopped");
    const [currentAnim, setCurrentAnim] = useState<AnimationConfig | null>(null);
    const [animFps, setAnimFps] = useState(15);
    const [animFrame, setAnimFrame] = useState(0);
    const [effectsEnabled, setEffectsEnabled] = useState(false);
    const [activeEffectPreset, setActiveEffectPreset] = useState<import('../lib/effects').EffectPreset>(EFFECT_PRESETS[0]);
    const [effectsDistance, setEffectsDistance] = useState(1);
    const [effectsSpeed, setEffectsSpeed] = useState(1);
    const [physicsEnabled, setPhysicsEnabled] = useState(false);
    const [physicsPreset, setPhysicsPreset] = useState<PresetName | null>(null);
    const [physicsGravity, setPhysicsGravity] = useState(36);
    const [physicsBounce, setPhysicsBounce] = useState(0.3);

    /** Sync the convenience refs and UI state to the active layer's animation/effects */
    const syncActiveLayerState = useCallback(() => {
        const layer = layerManagerRef.current?.getActiveLayer();
        if (!layer) return;
        // Point refs at the active layer's instances
        animRef.current = layer.animation.manager;
        effectsRef.current = layer.effects.engine;
        layer.animation.manager.setRuntimeContext(layer.animation);
        snapshotRef.current = layer.animation.snapshot;

        layer.animation.fps = layer.animation.manager.fps;
        layer.animation.frame = layer.animation.manager.frame;
        layer.effects.enabled = layer.effects.engine.enabled;
        layer.effects.preset = layer.effects.engine.preset;
        layer.effects.distanceMultiplier = layer.effects.engine.distanceMultiplier;
        layer.effects.speedMultiplier = layer.effects.engine.speedMultiplier;
        // Sync UI state
        setAnimState(layer.animation.manager.state);
        setCurrentAnim(layer.animation.currentAnim);
        setAnimFps(layer.animation.fps);
        setAnimFrame(layer.animation.frame);
        setEffectsEnabled(layer.effects.enabled);
        setActiveEffectPreset(layer.effects.preset);
        setEffectsDistance(layer.effects.distanceMultiplier);
        setEffectsSpeed(layer.effects.speedMultiplier);
        setPhysicsEnabled(layer.physics.enabled);
        setPhysicsPreset(layer.physics.preset);
        setPhysicsGravity(layer.physics.gravityY);
        setPhysicsBounce(layer.physics.restitution);
    }, [layerManagerRef]);

    const getDisplayGridData = useCallback(() => {
        const manager = layerManagerRef.current;
        return manager ? compositeGridWithEffects(manager) : null;
    }, []);

    const captureActiveLayerSnapshot = useCallback((data: Uint8ClampedArray) => {
        const layer = layerManagerRef.current?.getActiveLayer();
        if (!layer) return data;
        const snapshot = captureSnapshot(data, layer.animation);
        layer.animation.snapshot = snapshot;
        layer.animation.manager.setRuntimeContext(layer.animation);
        snapshotRef.current = snapshot;
        return snapshot;
    }, []);

    const setActiveLayerMarqueeBuffer = useCallback((buffer: Uint8ClampedArray | null, bufferCols = 0) => {
        const layer = layerManagerRef.current?.getActiveLayer();
        if (!layer) return;
        setMarqueeBuffer(layer.animation, buffer, bufferCols);
        layer.animation.manager.setRuntimeContext(layer.animation);
    }, []);

    const [showPlaybackBar, setShowPlaybackBar] = useState(true);
    const [showTimeline, setShowTimeline] = useState(false);
    
    const {
        currentTime: timelineCurrentTime,
        duration: timelineDuration,
        isPlaying: timelinePlaying,
        tracks: timelineTracks,
        handlePlay: handleTimelinePlay,
        handlePause: handleTimelinePause,
        handleStop: handleTimelineStop,
        handleSeek: handleTimelineSeek,
        handleAddClip,
        handleMoveClip,
        handleResizeClip,
        handleDeleteClip,
        handleAddTrack
    } = useTimelineEngine(useCallback(() => canvasHandleRef.current?.redraw(), []));

    const animWasPlayingBeforePlayback = useRef(false);
    const [layerManagerView, setLayerManagerView] = useState<LayerManager | null>(null);

    // ── useBoardExport ────────────────────────────────────────────────────
    const { getCompositeGridWithEffects } = useBoardExport({ layerManagerRef });

    const {
        sessionRecRef,
        recordingState: frameRecordingState,
        recFrameCount: frameRecFrameCount,
        recDuration: frameRecDuration,
        recPlaybackFrame: frameRecPlaybackFrame,
        recHasRecording: frameRecHasRecording,
        loopEnabled,
        setRecordingState: setFrameRecordingState,
        setRecFrameCount: setFrameRecFrameCount,
        setRecDuration: setFrameRecDuration,
        setRecPlaybackFrame: setFrameRecPlaybackFrame,
        setRecHasRecording: setFrameRecHasRecording,
        setLoopEnabled,
    } = useSessionRecording({
        getGridData: getDisplayGridData,
        onRedraw: useCallback(() => canvasHandleRef.current?.redraw(), []),
        onClearRecordingExt: useCallback(() => {}, [])
    });

    const actionRecRef = useRef(actionRecorder);
    const isApplyingRecordedActionRef = useRef(false);
    const restoreAfterActionPlaybackRef = useRef<{ state: SerializedBoardState; seed: number } | null>(null);
    const [recordingMode, setRecordingMode] = useState<RecordingMode>("action");
    const [actionRecordingState, setActionRecordingState] = useState<RecordingState>("idle");
    const [actionCount, setActionCount] = useState(0);
    const [actionDuration, setActionDuration] = useState(0);
    const [actionPlaybackIndex, setActionPlaybackIndex] = useState(0);
    const [actionHasRecording, setActionHasRecording] = useState(false);

    const serializeLayerStack = useCallback((): SerializedLayerState[] => {
        const manager = layerManagerRef.current;
        if (!manager) return [];

        return manager.layers.map((layer) => ({
            id: layer.id,
            name: layer.name,
            visible: layer.visible,
            opacity: layer.opacity,
            blendMode: layer.blendMode,
            // When physics is live the grid holds a mid-sim frame; persist the
            // original drawing (snapshot) so reloads restore the source, not a frame.
            data: uint8ToBase64(
                layer.physics.enabled && layer.physics.snapshot
                    ? layer.physics.snapshot
                    : layer.grid.data,
            ),
            effects: {
                enabled: layer.effects.enabled,
                presetName: layer.effects.preset.name,
                distanceMultiplier: layer.effects.distanceMultiplier,
                speedMultiplier: layer.effects.speedMultiplier,
            },
            physics: {
                enabled: layer.physics.enabled,
                preset: layer.physics.preset,
                gravityY: layer.physics.gravityY,
                restitution: layer.physics.restitution,
            },
        }));
    }, []);

    const serializeBoardState = useCallback((): SerializedBoardState => {
        const manager = layerManagerRef.current;
        return {
            cols: manager?.cols ?? gridDims.cols,
            rows: manager?.rows ?? gridDims.rows,
            cellSize: manager?.cellSize ?? settings.cellSize,
            activeLayerId: manager?.activeLayerId ?? null,
            activeTool,
            activeColor,
            activePaletteId,
            layers: serializeLayerStack(),
        };
    }, [activeColor, activePaletteId, activeTool, gridDims.cols, gridDims.rows, serializeLayerStack, settings.cellSize]);

    const recordAction = useCallback((action: RecordedActionInput) => {
        if (recordingMode !== "action" || isApplyingRecordedActionRef.current) return;
        const recorder = actionRecRef.current;
        if (recorder.state !== "recording") return;
        recorder.record(action);
        setActionCount(recorder.actionCount);
        setActionDuration(recorder.duration);
        setActionHasRecording(recorder.hasRecording);
    }, [recordingMode]);

    const recordLayerSync = useCallback(() => {
        const manager = layerManagerRef.current;
        if (!manager) return;
        recordAction({
            type: "layer",
            action: "sync",
            layers: serializeLayerStack(),
            activeLayerId: manager.activeLayerId,
        });
    }, [recordAction, serializeLayerStack]);

    const selectLayerRuntime = useCallback((layerId: string | null) => {
        const manager = layerManagerRef.current;
        if (!manager || !layerId || manager.activeLayerId === layerId) return;
        if (!manager.selectLayer(layerId)) return;
        setLayerManagerView(manager);
        syncActiveLayerState();
    }, [syncActiveLayerState]);

    const restoreBoardState = useCallback((state: SerializedBoardState, seed: number) => {
        setSeed(seed);
        setSettings((prev) => ({ ...prev, cellSize: state.cellSize }));
        replaceManager(window.innerWidth, window.innerHeight, state.cellSize);

        const manager = layerManagerRef.current;
        if (!manager) return;

        if (manager.cols !== state.cols || manager.rows !== state.rows) {
            manager.resizePreserveDims(state.cols, state.rows);
        }

        manager.restoreSerializedLayers(state.layers, state.activeLayerId);
        setActiveTool(state.activeTool);
        setActiveColor(state.activeColor);
        setActivePaletteId(state.activePaletteId);
        setGridDims({ cols: state.cols, rows: state.rows });
        sessionRecRef.current.updateGrid(state.cols, state.rows);

        snapshotRef.current = null;
        contentLayersRef.current = [];
        setCellInfo(null);
        strokeActiveRef.current = false;
        gestureStrokeRef.current = false;
        animWasPlayingBeforePlayback.current = false;
        undoStackRef.current = [];
        setCanUndo(false);

        setLayerManagerView(manager);
        handleLayerChange();
        syncActiveLayerState();
        canvasHandleRef.current?.redraw();
    }, [handleLayerChange, replaceManager, sessionRecRef, syncActiveLayerState]);

    const configureFrameRecorder = useCallback(() => {
        const recorder = sessionRecRef.current;
        const manager = layerManagerRef.current;
        if (!manager) return;
        recorder.configure({
            cols: manager.cols,
            rows: manager.rows,
            captureFps: 30,
            getGridData: getDisplayGridData,
            setGridData: (data: Uint8ClampedArray) => {
                layerManagerRef.current?.getActiveLayer()?.grid.loadData(data);
            },
            redraw: () => canvasHandleRef.current?.redraw(),
            onStateChange: (state: RecordingState) => {
                setFrameRecordingState(state);
                setFrameRecHasRecording(recorder.hasRecording);
                setFrameRecFrameCount(recorder.frameCount);
                setFrameRecDuration(recorder.duration);
            },
            onPlaybackFrame: (frame: number, total: number) => {
                setFrameRecPlaybackFrame(frame);
                setFrameRecFrameCount(total);
                setFrameRecDuration(recorder.duration);
            },
        });
    }, [getDisplayGridData, sessionRecRef, setFrameRecDuration, setFrameRecFrameCount, setFrameRecHasRecording, setFrameRecPlaybackFrame, setFrameRecordingState]);

    const {
        gestureEnabled, gestureVideoRef, gestureLoadState,
        gestureStatusMsg, gesturePinching, gesturePinchThreshold,
        gestureShowCamera, gestureCursorScreen, gestureDrawing,
        setGestureShowCamera, setGestureCursorScreen, setGestureDrawing,
        setGestureLoadState, setGestureStatusMsg, setGesturePinching,
        setGestureEnabled, setGesturePinchThreshold
    } = useGestures({
        onCursorMove: (x, y) => {
            const manager = layerManagerRef.current;
            if (!manager) return;
            const grid = manager.getActiveLayer()?.grid;
            if (!grid) return;
            const col = Math.floor(x / grid.cellSize);
            const row = Math.floor(y / grid.cellSize);
            if (grid.inBounds(col, row)) {
                setCellInfo({ col, row, color: grid.getCell(col, row) });
            }
        },
        onPinchAt: (x, y) => {
            const manager = layerManagerRef.current;
            if (!manager) return;
            const grid = manager.getActiveLayer()?.grid;
            if (!grid) return;
            const col = Math.floor(x / grid.cellSize);
            const row = Math.floor(y / grid.cellSize);
            if (!grid.inBounds(col, row)) return;

            if (!gestureStrokeRef.current) {
                pushUndo();
                gestureStrokeRef.current = true;
            }
            applyTool(col, row);
        },
        onPinchRelease: () => {
            if (gestureStrokeRef.current) {
                gestureStrokeRef.current = false;
                saveGridToStorage();
            }
        },
        onScroll: (delta) => {
            document.querySelector("[data-gesture-scroll]")?.scrollBy({ top: delta });
        },
        onSwipeClear: () => {},
        panelRef: panelRef
    });

    useEffect(() => {
        setLayerManagerView(layerManagerRef.current);
        // Sync refs/UI to active layer whenever layers change
        syncActiveLayerState();
    }, [layerManagerRef, layerUpdateTick, syncActiveLayerState]);

    // ── Fullscreen state ────────────────────────────────
    const [isFullscreen, setIsFullscreen] = useState(false);

    // contentLayersRef defined with other refs above (type imported from useBoardActions)

    // 
    // ── Initialise grid on mount ──────────────────────────
    useEffect(() => {
        // Restore saved cell size from localStorage (client-only to avoid hydration mismatch)
        let cellSize = DEFAULT_SETTINGS.cellSize;
        try {
            const saved = localStorage.getItem(STORAGE_KEY_CELL_SIZE);
            if (saved) {
                const v = parseInt(saved, 10);
                if (!isNaN(v) && v >= 1 && v <= 40) cellSize = v;
            }
        } catch { /* ignore */ }
        if (cellSize !== DEFAULT_SETTINGS.cellSize) {
            queueMicrotask(() => setSettings((prev) => ({ ...prev, cellSize })));
        }

        const w = window.innerWidth;
        const h = window.innerHeight;
        initLayerManager(w, h, cellSize);

        // Load saved grid data from localStorage
        try {
            const saved = localStorage.getItem(STORAGE_KEY_GRID);
            if (saved) {
                const { data: b64, cols: savedCols, rows: savedRows } = JSON.parse(saved);
                const savedData = base64ToUint8(b64);
                const manager = layerManagerRef.current;
                const validSavedGrid =
                    Number.isFinite(savedCols) &&
                    Number.isFinite(savedRows) &&
                    savedCols > 0 &&
                    savedRows > 0 &&
                    savedData.length >= savedCols * savedRows * 3;
                if (!validSavedGrid) {
                    localStorage.removeItem(STORAGE_KEY_GRID);
                } else if (manager) {
                    const grid = manager.getActiveLayer()?.grid;
                    if (grid) {
                        const copyCols = Math.min(savedCols, grid.cols);
                        const copyRows = Math.min(savedRows, grid.rows);
                        for (let r = 0; r < copyRows; r++) {
                            for (let c = 0; c < copyCols; c++) {
                                const si = (r * savedCols + c) * 3;
                                const di = (r * grid.cols + c) * 3;
                                grid.data[di] = savedData[si];
                                grid.data[di + 1] = savedData[si + 1];
                                grid.data[di + 2] = savedData[si + 2];
                            }
                        }
                    }
                }
            }
        } catch { /* ignore corrupted data */ }

        if (layerManagerRef.current) {
            setGridDims({ cols: layerManagerRef.current.cols, rows: layerManagerRef.current.rows });
        }

        // Sync refs to the initial layer's animation/effects
        syncActiveLayerState();

        // Load saved effects state into the active layer
        try {
            const layer = layerManagerRef.current?.getActiveLayer();
            if (layer) {
                const savedEnabled = localStorage.getItem(STORAGE_KEY_EFFECTS);
                if (savedEnabled === "true") {
                    layer.effects.enabled = true;
                    layer.effects.engine.setEnabled(true);
                    setEffectsEnabled(true);
                }
                const savedPresetId = localStorage.getItem(STORAGE_KEY_EFFECT_PRESET);
                if (savedPresetId) {
                    const match = EFFECT_PRESETS.find((p: { name: string }) => p.name === savedPresetId);
                    if (match) {
                        layer.effects.preset = match;
                        layer.effects.engine.setPreset(match);
                        setActiveEffectPreset(match);
                    }
                }
                const savedDist = localStorage.getItem(STORAGE_KEY_EFFECT_DISTANCE);
                if (savedDist) {
                    const v = parseFloat(savedDist);
                    if (!isNaN(v)) {
                        layer.effects.distanceMultiplier = v;
                        layer.effects.engine.setDistanceMultiplier(v);
                        setEffectsDistance(v);
                    }
                }
                const savedSpeed = localStorage.getItem(STORAGE_KEY_EFFECT_SPEED);
                if (savedSpeed) {
                    const v = parseFloat(savedSpeed);
                    if (!isNaN(v)) {
                        layer.effects.speedMultiplier = v;
                        layer.effects.engine.setSpeedMultiplier(v);
                        setEffectsSpeed(v);
                    }
                }
            }
        } catch { /* ignore */ }

        // Redraw after loading (canvas effect may have run before data was loaded)
        requestAnimationFrame(() => canvasHandleRef.current?.redraw());
    }, []);

    
    useEffect(() => {
        if (animState !== "playing") return;
        const id = setInterval(() => {
            const layer = layerManagerRef.current?.getActiveLayer();
            if (animRef.current && layer) {
                layer.animation.frame = animRef.current.frame;
                setAnimFrame(animRef.current.frame);
            }
        }, 200);
        return () => clearInterval(id);
    }, [animState]);

    // ── Load saved preferences from localStorage ─────────
    useEffect(() => {
        // Deferred to avoid React compiler warning about sync setState in effect
        queueMicrotask(() => {
            try {
                const savedColor = localStorage.getItem(STORAGE_KEY_COLOR);
                if (savedColor) setActiveColor(JSON.parse(savedColor));
                const savedTool = localStorage.getItem(STORAGE_KEY_TOOL);
                if (savedTool && ["select", "draw", "erase", "fill", "vibe"].includes(savedTool)) {
                    setActiveTool(savedTool as ToolKind);
                }
                const savedShowGrid = localStorage.getItem(STORAGE_KEY_SHOW_GRID);
                if (savedShowGrid !== null) {
                    setSettings((prev) => ({ ...prev, showGrid: savedShowGrid === "true" }));
                }
                const savedAnim = localStorage.getItem(STORAGE_KEY_ANIM);
                if (savedAnim) {
                    const match = ANIMATIONS.find((a) => a.name === savedAnim);
                    if (match) {
                        // Defer animation start until grid + AnimationManager are ready
                        requestAnimationFrame(() => {
                            const activeLayer = layerManagerRef.current?.getActiveLayer();
                            const grid = activeLayer?.grid;
                            const mgr = animRef.current;
                            if (!grid || !mgr || !activeLayer) return;
                            strokeRecorder.pause();
                            if (!snapshotRef.current) {
                                snapshotRef.current = grid.cloneData();
                            }
                            setActiveLayerMarqueeBuffer(null);
                            captureActiveLayerSnapshot(snapshotRef.current);
                            mgr.load(match, grid.cols, grid.rows, grid.data, activeLayer.animation);
                            activeLayer.animation.currentAnim = match;
                            activeLayer.animation.snapshot = snapshotRef.current;
                            activeLayer.animation.fps = match.fps;
                            activeLayer.animation.frame = 0;
                            setCurrentAnim(match);
                            setAnimState("playing");
                            setAnimFps(match.fps);
                            setAnimFrame(0);
                            mgr.play();
                        });
                    }
                }
            } catch { /* ignore */ }
        });
    }, []);

    // ── Save preferences to localStorage ──────────────────
    // Color/tool/showGrid save-on-change handled by useBoardPersistence (called below)

    // ── Save grid data to localStorage periodically + on unload
    const saveGridToStorage = useCallback(() => {
        const grid = layerManagerRef.current?.getActiveLayer()?.grid;
        if (!grid) return;
        if (grid.cols <= 0 || grid.rows <= 0) return;
        const data = snapshotRef.current || grid.data;
        try {
            localStorage.setItem(STORAGE_KEY_GRID, JSON.stringify({
                data: uint8ToBase64(data),
                cols: grid.cols,
                rows: grid.rows,
            }));
        } catch { }
    }, [layerManagerRef, snapshotRef]);

    useEffect(() => { saveGridToStorageRef.current = saveGridToStorage; }, [saveGridToStorage]);

    // useBoardPersistence: beforeunload, interval, color/tool/showGrid save-on-change
    useBoardPersistence({ saveGridToStorage, activeColor, activeTool, showGrid: settings.showGrid });

    // onStartAnimation callback for useBoardActions (text→anim path)
    const onStartAnimation = useCallback((anim: AnimationConfig) => {
        setCurrentAnim(anim);
        try { localStorage.setItem(STORAGE_KEY_ANIM, anim.name); } catch {}
        setAnimFps(anim.fps);
        setAnimFrame(0);
        setAnimState("playing");
    }, []);

    const pushUndo = useCallback(() => {
        const grid = layerManagerRef.current?.getActiveLayer()?.grid;
        if (!grid) return;
        const data = snapshotRef.current ? new Uint8ClampedArray(snapshotRef.current) : grid.cloneData();
        undoStackRef.current.push(data);
        if (undoStackRef.current.length > MAX_UNDO) undoStackRef.current.shift();
        setCanUndo(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const canvasRedraw = useCallback(() => canvasHandleRef.current?.redraw(), []);

    // ── Physics engine (per-layer simulation driver) ──────
    const physics = usePhysicsEngine({ layerManagerRef, onRedraw: canvasRedraw });

    const handleTogglePhysics = useCallback(() => {
        setPhysicsEnabled((prev) => {
            const next = !prev;
            if (next) physics.enable(); else physics.disable();
            const layer = layerManagerRef.current?.getActiveLayer();
            setPhysicsPreset(layer?.physics.preset ?? null);
            setAnimState(layer?.animation.manager.state ?? "stopped");
            if (layer) recordAction({ type: "physics", layerId: layer.id, op: next ? "enable" : "disable" });
            return next;
        });
    }, [physics, layerManagerRef, recordAction]);

    const handleApplyPhysicsPreset = useCallback((name: PresetName) => {
        physics.applyPresetToActive(name);
        setPhysicsEnabled(true);
        setPhysicsPreset(name);
        const layer = layerManagerRef.current?.getActiveLayer();
        setAnimState(layer?.animation.manager.state ?? "stopped");
        if (layer) recordAction({ type: "physics", layerId: layer.id, op: "preset", preset: name });
    }, [physics, layerManagerRef, recordAction]);

    const handlePhysicsGravityChange = useCallback((v: number) => {
        setPhysicsGravity(v);
        physics.setConfig({ gravityY: v });
        const layer = layerManagerRef.current?.getActiveLayer();
        if (layer) recordAction({ type: "physics", layerId: layer.id, op: "config", gravityY: v, restitution: layer.physics.restitution });
    }, [physics, layerManagerRef, recordAction]);

    const handlePhysicsBounceChange = useCallback((v: number) => {
        setPhysicsBounce(v);
        physics.setConfig({ restitution: v });
        const layer = layerManagerRef.current?.getActiveLayer();
        if (layer) recordAction({ type: "physics", layerId: layer.id, op: "config", gravityY: layer.physics.gravityY, restitution: v });
    }, [physics, layerManagerRef, recordAction]);

    const handleResetPhysics = useCallback(() => {
        physics.reset();
        setPhysicsPreset(null);
        const layer = layerManagerRef.current?.getActiveLayer();
        if (layer) recordAction({ type: "physics", layerId: layer.id, op: "reset" });
    }, [physics, layerManagerRef, recordAction]);

    // Freeze the live simulation into a looping animation that flows through the
    // normal animation playback/record/export pipeline (mirrors handleSelectAnimation).
    const handleBakePhysics = useCallback((frames: number) => {
        const result = physics.bakeActiveLayer(frames, 30);
        if (!result) return;
        const { config, drawing } = result;
        const activeLayer = layerManagerRef.current?.getActiveLayer();
        const grid = activeLayer?.grid;
        const mgr = animRef.current;
        if (!grid || !mgr || !activeLayer) return;

        strokeRecorder.pause();
        // the original drawing is what we restore when the baked animation stops
        snapshotRef.current = new Uint8ClampedArray(drawing);
        setActiveLayerMarqueeBuffer(null);
        captureActiveLayerSnapshot(snapshotRef.current);

        mgr.load(config, grid.cols, grid.rows, grid.data, activeLayer.animation);
        activeLayer.animation.currentAnim = config;
        activeLayer.animation.snapshot = snapshotRef.current;
        activeLayer.animation.fps = config.fps;
        activeLayer.animation.frame = 0;

        setPhysicsEnabled(false);
        setCurrentAnim(config);
        try { localStorage.removeItem(STORAGE_KEY_ANIM); } catch { }
        setAnimState("playing");
        setAnimFps(config.fps);
        setAnimFrame(0);
        mgr.play();
    }, [physics, layerManagerRef, captureActiveLayerSnapshot, setActiveLayerMarqueeBuffer]);

    // useBoardActions: only replayLayers is consumed here. The action-recording-aware
    // applyTool / handleApplyPattern / handleRenderText are defined inline below (they
    // integrate recordAction / recordLayerSync), so we intentionally don't take them
    // from the hook to avoid redeclaration.
    const { replayLayers } = useBoardActions({
        layerManagerRef, animRef, effectsRef, snapshotRef, contentLayersRef,
        saveGridToStorageRef, activeTool, activeColor,
        backgroundColor: settings.backgroundColor, activePaletteId,
        pushUndo,
        canvasRedraw,
        onStartAnimation,
    });


    // ── Handle grid resize (called from Canvas after resizePreserve) ──
    const handleGridResize = useCallback(
        (oldCols: number, oldRows: number, newCols: number, newRows: number) => {
            if (newCols <= 0 || newRows <= 0) return;
            const grid = layerManagerRef.current?.getActiveLayer()?.grid;
            if (!grid) return;

            const layers = contentLayersRef.current;

            if (layers.length > 0) {
                // Find the text layer (if any) to check for marquee rebuild
                const textLayer = layers.find((l) => l.type === "text") as
                    | (ContentLayer & { type: "text" })
                    | undefined;
                const patternLayers = layers.filter((l) => l.type === "pattern");
                const isMarquee =
                    textLayer &&
                    !textLayer.wrap &&
                    measureText(textLayer.text, textLayer.scale) > newCols;

                if (isMarquee && textLayer) {
                    // Rebuild the marquee buffer for new dimensions
                    let baseData: Uint8ClampedArray | undefined;
                    if (patternLayers.length > 0) {
                        baseData = new Uint8ClampedArray(newCols * newRows * 3);
                        for (const layer of patternLayers) {
                            baseData.fill(0);
                            (layer as ContentLayer & { type: "pattern" }).fn(newCols, newRows, baseData);
                        }
                    }
                    const { buffer, bufferCols } = renderTextToWideBuffer(
                        textLayer.text, newCols, newRows,
                        textLayer.color, textLayer.scale, baseData,
                    );
                    setActiveLayerMarqueeBuffer(buffer, bufferCols);

                    // Update snapshot with base pattern
                    const newSnap = new Uint8ClampedArray(newCols * newRows * 3);
                    if (baseData) newSnap.set(baseData);
                    snapshotRef.current = newSnap;
                    captureActiveLayerSnapshot(snapshotRef.current);
                    grid.loadData(snapshotRef.current);
                } else {
                    // Text fits or wrap mode — replay normally
                    const buf = new Uint8ClampedArray(newCols * newRows * 3);
                    replayLayers(layers, newCols, newRows, buf);

                    // If was a marquee but now fits, stop marquee
                    if (animRef.current?.currentAnimation?.name === "Text Marquee") {
                        setActiveLayerMarqueeBuffer(null);
                    }

                    if (snapshotRef.current) {
                        snapshotRef.current = buf;
                        captureActiveLayerSnapshot(snapshotRef.current);
                        grid.loadData(snapshotRef.current);
                    } else {
                        grid.loadData(buf);
                    }
                }
            } else {
                // No tracked content layers — use resizePreserve data (already done)
                // Just resize the snapshot if active
                if (snapshotRef.current) {
                    const newSnap = new Uint8ClampedArray(newCols * newRows * 3);
                    const copyCols = Math.min(oldCols, newCols);
                    const copyRows = Math.min(oldRows, newRows);
                    for (let r = 0; r < copyRows; r++) {
                        for (let c = 0; c < copyCols; c++) {
                            const si = (r * oldCols + c) * 3;
                            const di = (r * newCols + c) * 3;
                            newSnap[di] = snapshotRef.current[si];
                            newSnap[di + 1] = snapshotRef.current[si + 1];
                            newSnap[di + 2] = snapshotRef.current[si + 2];
                        }
                    }
                    snapshotRef.current = newSnap;
                    captureActiveLayerSnapshot(snapshotRef.current);
                }
            }

            // Clear undo stack on resize (data sizes changed)
            undoStackRef.current = [];
            setCanUndo(false);

            setGridDims({ cols: newCols, rows: newRows });

            // Keep ALL layers' animation managers and effects engines in sync
            const mgr = layerManagerRef.current;
            if (mgr) {
                for (const layer of mgr.layers) {
                    layer.animation.manager.updateGrid(newCols, newRows, layer.grid.data);
                    layer.effects.engine.updateGrid(newCols, newRows);
                }
            }
            syncActiveLayerState();

            // Keep session recorder in sync
            sessionRecRef.current.updateGrid(newCols, newRows);
        },
        [replayLayers],
    );

    // ── Handle cell size change ───────────────────────────
    const handleCellSizeChange = useCallback(
        (newSize: number) => {
            const manager = layerManagerRef.current;
            const activeLayer = manager?.getActiveLayer();
            const grid = activeLayer?.grid;
            if (!manager || !grid) return;

            const clamped = Math.max(1, Math.min(40, Math.round(newSize)));
            if (clamped === grid.cellSize) return;

            const oldCols = grid.cols;
            const oldRows = grid.rows;

            // Update settings state
            setSettings((prev) => ({ ...prev, cellSize: clamped }));
            try { localStorage.setItem(STORAGE_KEY_CELL_SIZE, String(clamped)); } catch { }

            // Resize grid with new cell size (preserves data where possible)
            const w = window.innerWidth;
            const h = window.innerHeight;
            manager.resizeCellSize(w, h, clamped);

            const resizedGrid = manager.getActiveLayer()?.grid;
            if (!resizedGrid) return;

            const newCols = resizedGrid.cols;
            const newRows = resizedGrid.rows;

            // --- Same logic as handleGridResize ---
            const layers = contentLayersRef.current;

            if (layers.length > 0) {
                const textLayer = layers.find((l) => l.type === "text") as
                    | (ContentLayer & { type: "text" })
                    | undefined;
                const patternLayers = layers.filter((l) => l.type === "pattern");
                const isMarquee =
                    textLayer &&
                    !textLayer.wrap &&
                    measureText(textLayer.text, textLayer.scale) > newCols;

                if (isMarquee && textLayer) {
                    let baseData: Uint8ClampedArray | undefined;
                    if (patternLayers.length > 0) {
                        baseData = new Uint8ClampedArray(newCols * newRows * 3);
                        for (const layer of patternLayers) {
                            baseData.fill(0);
                            (layer as ContentLayer & { type: "pattern" }).fn(newCols, newRows, baseData);
                        }
                    }
                    const { buffer, bufferCols } = renderTextToWideBuffer(
                        textLayer.text, newCols, newRows,
                        textLayer.color, textLayer.scale, baseData,
                    );
                    setActiveLayerMarqueeBuffer(buffer, bufferCols);

                    const newSnap = new Uint8ClampedArray(newCols * newRows * 3);
                    if (baseData) newSnap.set(baseData);
                    snapshotRef.current = newSnap;
                    captureActiveLayerSnapshot(snapshotRef.current);
                    resizedGrid.loadData(snapshotRef.current);
                } else {
                    const buf = new Uint8ClampedArray(newCols * newRows * 3);
                    replayLayers(layers, newCols, newRows, buf);

                    if (animRef.current?.currentAnimation?.name === "Text Marquee") {
                        setActiveLayerMarqueeBuffer(null);
                    }

                    if (snapshotRef.current) {
                        snapshotRef.current = buf;
                        captureActiveLayerSnapshot(snapshotRef.current);
                        resizedGrid.loadData(snapshotRef.current);
                    } else {
                        resizedGrid.loadData(buf);
                    }
                }
            } else {
                // No tracked layers — snapshot was already resized by resizeCellSize (copy-preserve)
                if (snapshotRef.current) {
                    const newSnap = new Uint8ClampedArray(newCols * newRows * 3);
                    const copyCols = Math.min(oldCols, newCols);
                    const copyRows = Math.min(oldRows, newRows);
                    for (let r = 0; r < copyRows; r++) {
                        for (let c = 0; c < copyCols; c++) {
                            const si = (r * oldCols + c) * 3;
                            const di = (r * newCols + c) * 3;
                            newSnap[di] = snapshotRef.current[si];
                            newSnap[di + 1] = snapshotRef.current[si + 1];
                            newSnap[di + 2] = snapshotRef.current[si + 2];
                        }
                    }
                    snapshotRef.current = newSnap;
                    captureActiveLayerSnapshot(snapshotRef.current);
                }
            }

            // Clear undo stack (data sizes changed)
            undoStackRef.current = [];
            setCanUndo(false);

            setGridDims({ cols: newCols, rows: newRows });

            // Keep ALL layers' animation/effects in sync after cell size change
            if (manager) {
                for (const layer of manager.layers) {
                    layer.animation.manager.updateGrid(manager.cols, manager.rows, layer.grid.data);
                    // effects engines are already updated by resizeCellSize
                }
            }
            syncActiveLayerState();

            // Keep session recorder in sync
            sessionRecRef.current.updateGrid(newCols, newRows);

            // Force canvas to resize and redraw
            const canvas = canvasHandleRef.current?.getCanvas();
            if (canvas) {
                canvas.width = w;
                canvas.height = h;
            }
            canvasHandleRef.current?.redraw();
            saveGridToStorage();
        },
        [replayLayers, saveGridToStorage],
    );

    // ── Tool change handler (auto-enable effects for vibe) ──
    const handleToolChange = useCallback((tool: ToolKind) => {
        setActiveTool(tool);
        recordAction({ type: "tool", tool });
        if (tool === "vibe" && !effectsEnabled) {
            const layer = layerManagerRef.current?.getActiveLayer();
            if (layer) {
                layer.effects.enabled = true;
                layer.effects.engine.setEnabled(true);
            }
            setEffectsEnabled(true);
            try { localStorage.setItem(STORAGE_KEY_EFFECTS, "true"); } catch { }
        }
    }, [effectsEnabled, recordAction]);

    const handleColorChange = useCallback((color: RGB) => {
        setActiveColor(color);
        recordAction({ type: "color", color });
    }, [recordAction]);

    const handlePaletteChange = useCallback((paletteId: string | null) => {
        setActivePaletteId(paletteId);
        recordAction({ type: "palette", paletteId });
    }, [recordAction]);

    const clearPersistedWorkspaceState = useCallback(() => {
        try {
            for (const key of PERSISTED_WORKSPACE_KEYS) {
                localStorage.removeItem(key);
            }
        } catch { /* ignore */ }
    }, []);

    // ── Undo helpers ───────────────────────────────────
    const handleUndo = useCallback(() => {
        const stack = undoStackRef.current;
        if (stack.length === 0) return;
        const prevData = stack.pop()!;
        setCanUndo(stack.length > 0);

        const grid = layerManagerRef.current?.getActiveLayer()?.grid;
        if (!grid) return;

        if (snapshotRef.current) {
            // Animation mode — restore snapshot
            if (prevData.length === snapshotRef.current.length) {
                snapshotRef.current.set(prevData);
            } else {
                snapshotRef.current = new Uint8ClampedArray(prevData);
            }
            captureActiveLayerSnapshot(snapshotRef.current);
            if (animRef.current?.state !== "playing") {
                grid.loadData(snapshotRef.current);
                canvasHandleRef.current?.redraw();
            }
        } else {
            grid.loadData(prevData);
            canvasHandleRef.current?.redraw();
        }
        saveGridToStorage();
    }, [saveGridToStorage]);

    const handleLayerChangeTracked = useCallback(() => {
        handleLayerChange();
        setLayerManagerView(layerManagerRef.current);
        syncActiveLayerState();
        recordLayerSync();
    }, [handleLayerChange, recordLayerSync, syncActiveLayerState]);

    const selectLayerAtCell = useCallback((col: number, row: number) => {
        const manager = layerManagerRef.current;
        const targetLayer = manager?.pickLayerAt(col, row);
        if (!manager || !targetLayer || manager.activeLayerId === targetLayer.id) return;
        manager.selectLayer(targetLayer.id);
        handleLayerChangeTracked();
    }, [handleLayerChangeTracked]);

    // ── Apply tool to a cell ─────────────────────────────
    const applyToolLegacy = useCallback(
        (col: number, row: number) => {
            const grid = layerManagerRef.current?.getActiveLayer()?.grid;
            if (!grid) return;

            const snap = snapshotRef.current;

            const isMulti = activeColor[0] === -1;
            let drawColor: RGB = activeColor;
            if (isMulti) {
                // Smooth hue over time: completes a full 360 loop every 3.6 seconds
                const hue = (performance.now() / 10) % 360;
                drawColor = hslToRgb(hue, 100, 50);
            }

            if (snap) {
                // Animation active — update the content buffer so changes
                // are reflected in the running (or paused) animation.
                const idx = (row * grid.cols + col) * 3;

                switch (activeTool) {
                    case "select":
                        break;
                    case "draw":
                        snap[idx] = drawColor[0];
                        snap[idx + 1] = drawColor[1];
                        snap[idx + 2] = drawColor[2];
                        strokeRecorder.record(col, row, drawColor[0], drawColor[1], drawColor[2]);
                        effectsRef.current?.trigger(col, row, activeColor);
                        break;
                    case "erase":
                        snap[idx] = settings.backgroundColor[0];
                        snap[idx + 1] = settings.backgroundColor[1];
                        snap[idx + 2] = settings.backgroundColor[2];
                        strokeRecorder.record(
                            col, row,
                            settings.backgroundColor[0],
                            settings.backgroundColor[1],
                            settings.backgroundColor[2],
                        );
                        effectsRef.current?.trigger(col, row, activeColor);
                        break;
                    case "fill": {
                        // Temporarily load content, flood-fill, save back
                        const before = new Uint8ClampedArray(snap);
                        grid.loadData(snap);
                        grid.floodFill(col, row, drawColor);
                        snapshotRef.current = grid.cloneData();
                        captureActiveLayerSnapshot(snapshotRef.current);
                        strokeRecorder.recordBulk(before, snapshotRef.current, grid.cols);
                        break;
                    }
                    case "vibe":
                        // Vibe mode — trigger visual effects without modifying pixels
                        effectsRef.current?.trigger(col, row, activeColor);
                        break;
                }

                // If paused, update display immediately since no ticks run
                if (animRef.current?.state !== "playing") {
                    grid.loadData(snapshotRef.current!);
                    canvasHandleRef.current?.redraw();
                }
            } else {
                // Normal mode — no animation active
                switch (activeTool) {
                    case "select":
                        break;
                    case "draw":
                        grid.setCell(col, row, drawColor);
                        strokeRecorder.record(col, row, drawColor[0], drawColor[1], drawColor[2]);
                        effectsRef.current?.trigger(col, row, activeColor);
                        break;
                    case "erase":
                        grid.setCell(col, row, settings.backgroundColor);
                        strokeRecorder.record(
                            col, row,
                            settings.backgroundColor[0],
                            settings.backgroundColor[1],
                            settings.backgroundColor[2],
                        );
                        effectsRef.current?.trigger(col, row, activeColor);
                        break;
                    case "fill": {
                        const before = grid.cloneData();
                        grid.floodFill(col, row, drawColor);
                        strokeRecorder.recordBulk(before, grid.data, grid.cols);
                        break;
                    }
                    case "vibe":
                        // Vibe mode — trigger visual effects without modifying pixels
                        effectsRef.current?.trigger(col, row, activeColor);
                        break;
                }
                canvasHandleRef.current?.redraw();
            }
        },
        [activeTool, activeColor, settings.backgroundColor],
    );

    // ── Hover callback ────────────────────────────────────
    const applyToolToCell = useCallback(
        (tool: ToolKind, col: number, row: number, forcedColor?: RGB) => {
            const grid = layerManagerRef.current?.getActiveLayer()?.grid;
            if (!grid) return;

            const snap = snapshotRef.current;
            const selectedColor = forcedColor ?? activeColor;
            const isMulti = selectedColor[0] === -1;
            let drawColor: RGB = selectedColor;
            if (isMulti) {
                const hue = (performance.now() / 10) % 360;
                drawColor = hslToRgb(hue, 100, 50);
            }

            if (snap) {
                const idx = (row * grid.cols + col) * 3;

                switch (tool) {
                    case "select":
                        break;
                    case "draw":
                        snap[idx] = drawColor[0];
                        snap[idx + 1] = drawColor[1];
                        snap[idx + 2] = drawColor[2];
                        if (!isApplyingRecordedActionRef.current) {
                            strokeRecorder.record(col, row, drawColor[0], drawColor[1], drawColor[2]);
                        }
                        effectsRef.current?.trigger(col, row, drawColor);
                        break;
                    case "erase":
                        snap[idx] = settings.backgroundColor[0];
                        snap[idx + 1] = settings.backgroundColor[1];
                        snap[idx + 2] = settings.backgroundColor[2];
                        if (!isApplyingRecordedActionRef.current) {
                            strokeRecorder.record(
                                col, row,
                                settings.backgroundColor[0],
                                settings.backgroundColor[1],
                                settings.backgroundColor[2],
                            );
                        }
                        effectsRef.current?.trigger(col, row, selectedColor);
                        break;
                    case "fill": {
                        const before = new Uint8ClampedArray(snap);
                        grid.loadData(snap);
                        grid.floodFill(col, row, drawColor);
                        snapshotRef.current = grid.cloneData();
                        captureActiveLayerSnapshot(snapshotRef.current);
                        if (!isApplyingRecordedActionRef.current) {
                            strokeRecorder.recordBulk(before, snapshotRef.current, grid.cols);
                        }
                        break;
                    }
                    case "vibe":
                        effectsRef.current?.trigger(col, row, selectedColor);
                        break;
                }

                if (animRef.current?.state !== "playing") {
                    grid.loadData(snapshotRef.current!);
                    canvasHandleRef.current?.redraw();
                }
            } else {
                switch (tool) {
                    case "select":
                        break;
                    case "draw":
                        grid.setCell(col, row, drawColor);
                        if (!isApplyingRecordedActionRef.current) {
                            strokeRecorder.record(col, row, drawColor[0], drawColor[1], drawColor[2]);
                        }
                        effectsRef.current?.trigger(col, row, drawColor);
                        break;
                    case "erase":
                        grid.setCell(col, row, settings.backgroundColor);
                        if (!isApplyingRecordedActionRef.current) {
                            strokeRecorder.record(
                                col, row,
                                settings.backgroundColor[0],
                                settings.backgroundColor[1],
                                settings.backgroundColor[2],
                            );
                        }
                        effectsRef.current?.trigger(col, row, selectedColor);
                        break;
                    case "fill": {
                        const before = grid.cloneData();
                        grid.floodFill(col, row, drawColor);
                        if (!isApplyingRecordedActionRef.current) {
                            strokeRecorder.recordBulk(before, grid.data, grid.cols);
                        }
                        break;
                    }
                    case "vibe":
                        effectsRef.current?.trigger(col, row, selectedColor);
                        break;
                }
                canvasHandleRef.current?.redraw();
            }

            switch (tool) {
                case "draw":
                    recordAction({ type: "draw", col, row, color: drawColor });
                    break;
                case "erase":
                    recordAction({ type: "erase", col, row });
                    break;
                case "fill":
                    recordAction({ type: "fill", col, row, color: drawColor });
                    break;
                case "vibe": {
                    const layerId = layerManagerRef.current?.activeLayerId;
                    if (layerId) {
                        recordAction({ type: "effectTrigger", layerId, col, row, color: selectedColor });
                    }
                    break;
                }
            }
        },
        [activeColor, captureActiveLayerSnapshot, recordAction, settings.backgroundColor],
    );

    const applyTool = useCallback((col: number, row: number) => {
        applyToolToCell(activeTool, col, row);
    }, [activeTool, applyToolToCell]);

    const handleCellHover = useCallback((col: number, row: number) => {
        const manager = layerManagerRef.current;
        const activeGrid = manager?.getActiveLayer()?.grid;
        if (!manager || !activeGrid) return;
        const pickedLayer = activeTool === "select" ? manager.pickLayerAt(col, row) : null;
        const color = pickedLayer ? pickedLayer.grid.getCell(col, row) : activeGrid.getCell(col, row);
        setCellInfo({ col, row, color });
    }, [activeTool]);

    // ── Click callback (applies tool once) ─────────────
    const handleCellClick = useCallback(
        (col: number, row: number) => {
            if (activeTool === "select") {
                selectLayerAtCell(col, row);
                return;
            }
            if (activeTool !== "vibe" && !strokeActiveRef.current) {
                pushUndo();
                strokeActiveRef.current = true;
            }
            applyTool(col, row);
        },
        [activeTool, applyTool, pushUndo, selectLayerAtCell],
    );

    // ── Drag callbacks (for draw/erase continuous strokes)
    const handleCellDrag = useCallback(
        (col: number, row: number) => {
            if (activeTool === "select") return;
            if (activeTool === "fill") return; // fill only on click
            if (activeTool === "vibe") { applyTool(col, row); return; } // vibe triggers effects on drag
            applyTool(col, row);
        },
        [activeTool, applyTool],
    );

    const handleDragEnd = useCallback(() => {
        if (strokeActiveRef.current) {
            strokeActiveRef.current = false;
            saveGridToStorage();
        }
    }, [saveGridToStorage]);

    // ── Gesture callbacks ─────────────────────────────
    // Cursor moved (screen pixels from MediaPipe)
    const handleGestureCursorMove = useCallback((x: number, y: number) => {
        setGestureCursorScreen({ x, y });
        const manager = layerManagerRef.current;
        const activeGrid = manager?.getActiveLayer()?.grid;
        if (!manager || !activeGrid) return;
        const col = Math.floor(x / activeGrid.cellSize);
        const row = Math.floor(y / activeGrid.cellSize);
        if (activeGrid.inBounds(col, row)) {
            const pickedLayer = activeTool === "select" ? manager.pickLayerAt(col, row) : null;
            const color = pickedLayer ? pickedLayer.grid.getCell(col, row) : activeGrid.getCell(col, row);
            setCellInfo({ col, row, color });
        }
    }, [activeTool]);

    // Pinch fired at screen (x, y) — click panel elements or draw on canvas
    const handleGesturePinchAt = useCallback(
        (x: number, y: number) => {
            setGestureDrawing(true);

            // ── Check if over the sidebar panel ────────────────────
            const panelEl = panelRef.current;
            if (panelEl) {
                const target = document.elementFromPoint(x, y);
                if (target && panelEl.contains(target)) {
                    // Find the closest clickable element and fire a real click
                    const clickable = (target as HTMLElement).closest(
                        "button, input, select, textarea, [role='button'], label"
                    ) as HTMLElement | null;
                    if (clickable) {
                        clickable.click();
                    }
                    return; // don't draw on canvas
                }
            }

            // ── On canvas — draw ─────────────────────────────
            const grid = layerManagerRef.current?.getActiveLayer()?.grid;
            if (!grid) return;
            const col = Math.floor(x / grid.cellSize);
            const row = Math.floor(y / grid.cellSize);
            if (!grid.inBounds(col, row)) return;

            if (activeTool === "select") {
                selectLayerAtCell(col, row);
                return;
            }

            if (!gestureStrokeRef.current) {
                pushUndo();
                gestureStrokeRef.current = true;
            }
            applyTool(col, row);
        },
        [activeTool, applyTool, pushUndo, selectLayerAtCell],
    );

    // Pinch released
    const handleGesturePinchRelease = useCallback(() => {
        setGestureDrawing(false);
        if (gestureStrokeRef.current) {
            gestureStrokeRef.current = false;
            saveGridToStorage();
        }
    }, [saveGridToStorage]);

    // Two-finger scroll — scroll the panel body
    const handleGestureScroll = useCallback((delta: number) => {
        document.querySelector("[data-gesture-scroll]")?.scrollBy({ top: delta });
    }, []);

    // Full open-hand swipe — stop everything and clear the board
    // Status change from GestureController
    const handleGestureStatus = useCallback(
        (state: GestureLoadState, msg: string, pinching: boolean) => {
            setGestureLoadState(state);
            setGestureStatusMsg(msg);
            setGesturePinching(pinching);
        },
        [],
    );

    const handleToggleGesture = useCallback(() => {
        setGestureEnabled((prev) => {
            if (prev) {
                setGestureCursorScreen(null);
                setGestureDrawing(false);
            }
            return !prev;
        });
    }, []);

    const handleGesturePinchThresholdChange = useCallback((v: number) => {
        setGesturePinchThreshold(v);
    }, []);

    // ── Toggle grid lines ─────────────────────────────────
    const toggleGrid = useCallback(() => {
        setSettings((prev) => {
            const next = { ...prev, showGrid: !prev.showGrid };
            setTimeout(() => canvasHandleRef.current?.redraw(), 0);
            return next;
        });
    }, []);

    // ── Clear board (full reset) ─────────────────────────────
    const clearCanvas = useCallback(() => {
        const manager = layerManagerRef.current;
        manager?.clearCanvas();

        if (sessionRecRef.current.state === "playing" || sessionRecRef.current.state === "paused") {
            sessionRecRef.current.stopPlayback();
        }
        if (actionRecRef.current.state === "playing" || actionRecRef.current.state === "paused") {
            actionRecRef.current.stopPlayback();
        }

        snapshotRef.current = null;
        contentLayersRef.current = [];
        setActiveLayerMarqueeBuffer(null);
        setCellInfo(null);
        strokeActiveRef.current = false;
        gestureStrokeRef.current = false;
        animWasPlayingBeforePlayback.current = false;
        try { localStorage.removeItem(STORAGE_KEY_ANIM); } catch { }

        strokeRecorder.clear();
        strokeRecorder.resume();

        undoStackRef.current = [];
        setCanUndo(false);

        syncActiveLayerState();
        canvasHandleRef.current?.redraw();
        saveGridToStorage();
        recordAction({ type: "clear" });
    }, [recordAction, saveGridToStorage, syncActiveLayerState]);

    const resetWorkspace = useCallback(() => {
        clearPersistedWorkspaceState();
        sessionRecRef.current.clear();
        actionRecRef.current.clear();

        const nextSettings = { ...DEFAULT_SETTINGS };
        setSettings(nextSettings);
        setActiveTool("draw");
        setActiveColor([0, 255, 0]);
        setActivePaletteId(null);
        setRecordingMode("action");
        setAnimState("stopped");
        setCurrentAnim(null);
        setAnimFps(15);
        setAnimFrame(0);
        setEffectsEnabled(false);
        setActiveEffectPreset(EFFECT_PRESETS[0]);
        setEffectsDistance(1);
        setEffectsSpeed(1);
        setShowPlaybackBar(true);
        setShowTimeline(false);
        setGestureEnabled(false);
        setGestureShowCamera(true);
        setGestureCursorScreen(null);
        setGestureDrawing(false);
        setGestureLoadState("loading");
        setGestureStatusMsg("");
        setGesturePinching(false);
        setGesturePinchThreshold(0.08);
        setFrameRecordingState("idle");
        setFrameRecFrameCount(0);
        setFrameRecDuration(0);
        setFrameRecPlaybackFrame(0);
        setFrameRecHasRecording(false);
        setLoopEnabled(false);
        setActionRecordingState("idle");
        setActionCount(0);
        setActionDuration(0);
        setActionPlaybackIndex(0);
        setActionHasRecording(false);

        snapshotRef.current = null;
        contentLayersRef.current = [];
        setActiveLayerMarqueeBuffer(null);
        setCellInfo(null);
        strokeActiveRef.current = false;
        gestureStrokeRef.current = false;
        animWasPlayingBeforePlayback.current = false;
        undoStackRef.current = [];
        setCanUndo(false);

        strokeRecorder.clear();
        strokeRecorder.resume();

        replaceManager(window.innerWidth, window.innerHeight, nextSettings.cellSize);
        const manager = layerManagerRef.current;
        if (manager) {
            setGridDims({ cols: manager.cols, rows: manager.rows });
        }
        requestAnimationFrame(() => {
            syncActiveLayerState();
            canvasHandleRef.current?.redraw();
            saveGridToStorage();
        });
    }, [
        clearPersistedWorkspaceState,
        replaceManager,
        saveGridToStorage,
        setGestureCursorScreen,
        setGestureDrawing,
        setGestureEnabled,
        setGestureLoadState,
        setGesturePinching,
        setGesturePinchThreshold,
        setGestureShowCamera,
        setGestureStatusMsg,
        setLoopEnabled,
        setFrameRecDuration,
        setFrameRecFrameCount,
        setFrameRecHasRecording,
        setFrameRecPlaybackFrame,
        setFrameRecordingState,
        syncActiveLayerState,
    ]);

    // ── Quantize buffer to active palette ─────────────────
    const handleGestureSwipeClear = useCallback(() => {
        clearCanvas();
    }, [clearCanvas]);

    const quantizeBuffer = useCallback((buffer: Uint8ClampedArray) => {
        if (!activePaletteId) return;
        const palette = getPaletteById(activePaletteId);
        if (!palette) return;

        const len = buffer.length;
        for (let i = 0; i < len; i += 3) {
            const r = buffer[i];
            const g = buffer[i + 1];
            const b = buffer[i + 2];
            if (r === 0 && g === 0 && b === 0) continue; // Skip empty pixels

            let bestDist = Infinity;
            let bestColor = palette.colors[0];
            for (const pc of palette.colors) {
                const dr = r - pc[0];
                const dg = g - pc[1];
                const db = b - pc[2];
                const dist = dr * dr + dg * dg + db * db;
                if (dist < bestDist) {
                    bestDist = dist;
                    bestColor = pc;
                    if (dist === 0) break;
                }
            }
            buffer[i] = bestColor[0];
            buffer[i + 1] = bestColor[1];
            buffer[i + 2] = bestColor[2];
        }
    }, [activePaletteId]);

    // ── Apply a pattern ───────────────────────────────────
    const handleApplyPattern = useCallback(
        (fn: (cols: number, rows: number, data: Uint8ClampedArray) => void) => {
            const grid = layerManagerRef.current?.getActiveLayer()?.grid;
            if (!grid) return;
            pushUndo();

            // Pattern replaces everything — reset the layers stack
            contentLayersRef.current = [{ type: "pattern", fn }];

            if (snapshotRef.current) {
                // Apply pattern to the content buffer
                const before = new Uint8ClampedArray(snapshotRef.current);
                snapshotRef.current.fill(0);
                fn(grid.cols, grid.rows, snapshotRef.current);
                quantizeBuffer(snapshotRef.current); // Force colors to palette
                captureActiveLayerSnapshot(snapshotRef.current);
                strokeRecorder.recordBulk(before, snapshotRef.current, grid.cols);
                if (animRef.current?.state !== "playing") {
                    grid.loadData(snapshotRef.current);
                    canvasHandleRef.current?.redraw();
                }
            } else {
                const before = grid.cloneData();
                grid.clear();
                fn(grid.cols, grid.rows, grid.data);
                quantizeBuffer(grid.data); // Force colors to palette
                strokeRecorder.recordBulk(before, grid.data, grid.cols);
                canvasHandleRef.current?.redraw();
            }
            recordLayerSync();
            saveGridToStorage();
        },
        [pushUndo, recordLayerSync, saveGridToStorage, quantizeBuffer],
    );

    // ── Render pixel text ─────────────────────────────────
    const handleRenderText = useCallback(
        (text: string, color: RGB, scale: number = 1, wrap: boolean = true, animId?: string) => {
            const activeLayer = layerManagerRef.current?.getActiveLayer();
            const grid = activeLayer?.grid;
            const mgr = animRef.current;
            if (!grid || !activeLayer) return;

            // Snap color to active palette if necessary
            let targetColor = color;
            if (activePaletteId) {
                const palette = getPaletteById(activePaletteId);
                if (palette) {
                    let bestDist = Infinity;
                    for (const pc of palette.colors) {
                        const dr = color[0] - pc[0];
                        const dg = color[1] - pc[1];
                        const db = color[2] - pc[2];
                        const dist = dr * dr + dg * dg + db * db;
                        if (dist < bestDist) {
                            bestDist = dist;
                            targetColor = pc;
                            if (dist === 0) break;
                        }
                    }
                }
            }

            pushUndo();

            // Replace any previous text layers but keep pattern layers,
            // then add the new text layer on top. This prevents old text
            // from bleeding through when re-rendering or switching modes.
            const patternLayers = contentLayersRef.current.filter(
                (l): l is ContentLayer & { type: "pattern" } => l.type === "pattern",
            );
            const newTextLayer: ContentLayer = { type: "text", text, color: targetColor, scale, wrap };
            contentLayersRef.current = [...patternLayers, newTextLayer];

            const textWidth = measureText(text, scale);
            const overflows = !wrap && textWidth > grid.cols;
            const wantsAnim = animId && animId !== "none";
            const shouldAnimate = wantsAnim && mgr;

            // Generate the wide buffer regardless, to establish "reality" outside the screen boundary
            let baseData: Uint8ClampedArray | undefined;
            if (patternLayers.length > 0) {
                baseData = new Uint8ClampedArray(grid.cols * grid.rows * 3);
                for (const layer of patternLayers) {
                    baseData.fill(0);
                    layer.fn(grid.cols, grid.rows, baseData);
                }
            }
            const { buffer, bufferCols } = renderTextToWideBuffer(
                text, grid.cols, grid.rows, targetColor, scale, baseData,
            );
            setActiveLayerMarqueeBuffer(buffer, bufferCols);

            if (shouldAnimate) {
                // Determine target animation config
                const targetAnimId = wantsAnim ? animId : "Text Marquee";
                const animConfig = TEXT_ANIMATIONS.find(a => a.name === targetAnimId) || MARQUEE_ANIMATION;

                // ── Text animated rendering ──

                // Set up snapshot with just the base pattern (or black)
                if (!snapshotRef.current) {
                    snapshotRef.current = grid.cloneData();
                }
                snapshotRef.current.fill(0);
                if (baseData) snapshotRef.current.set(baseData);
                captureActiveLayerSnapshot(snapshotRef.current);

                strokeRecorder.pause();
                mgr.load(animConfig, grid.cols, grid.rows, grid.data, activeLayer.animation);
                setCurrentAnim(animConfig);
                try { localStorage.setItem(STORAGE_KEY_ANIM, animConfig.name); } catch { }
                setAnimFps(animConfig.fps);
                setAnimFrame(0);
                mgr.play();
            } else {
                // ── Normal rendering (wrap mode or text fits) ──
                // Stop any running marquee
                if (mgr && mgr.currentAnimation?.name === "Text Marquee") {
                    mgr.stop();
                    if (snapshotRef.current) {
                        grid.loadData(snapshotRef.current);
                        snapshotRef.current = null;
                    }
                    setActiveLayerMarqueeBuffer(null);
                    activeLayer.animation.currentAnim = null;
                    activeLayer.animation.snapshot = null;
                    activeLayer.animation.frame = 0;
                    setAnimFrame(0);
                    setAnimState("stopped");
                    setCurrentAnim(null);
                    try { localStorage.removeItem(STORAGE_KEY_ANIM); } catch { }
                    strokeRecorder.resume();
                }

                if (snapshotRef.current) {
                    snapshotRef.current.fill(0);
                    replayLayers(contentLayersRef.current, grid.cols, grid.rows, snapshotRef.current);
                    quantizeBuffer(snapshotRef.current);
                    captureActiveLayerSnapshot(snapshotRef.current);
                    strokeRecorder.recordText(text, grid.cols, grid.rows, targetColor, scale, true);
                    if (animRef.current?.state !== "playing") {
                        grid.loadData(snapshotRef.current);
                        canvasHandleRef.current?.redraw();
                    }
                } else {
                    grid.clear();
                    replayLayers(contentLayersRef.current, grid.cols, grid.rows, grid.data);
                    quantizeBuffer(grid.data);
                    strokeRecorder.recordText(text, grid.cols, grid.rows, targetColor, scale, true);
                    canvasHandleRef.current?.redraw();
                }
            }
            recordAction({
                type: "text",
                text,
                color: targetColor,
                scale,
                wrap,
                animId: animId ?? null,
            });
            saveGridToStorage();
        },
        [pushUndo, saveGridToStorage, replayLayers, quantizeBuffer, activePaletteId, recordAction],
    );

    // ── Animation controls ────────────────────────────────
    const handleSelectAnimation = useCallback((anim: AnimationConfig) => {
        const activeLayer = layerManagerRef.current?.getActiveLayer();
        const grid = activeLayer?.grid;
        const mgr = animRef.current;
        if (!grid || !mgr || !activeLayer) return;

        // Pause recording while animating so tick writes aren't recorded
        strokeRecorder.pause();

        // If no animation running, snapshot the current content.
        if (!snapshotRef.current) {
            snapshotRef.current = grid.cloneData();
        }
        setActiveLayerMarqueeBuffer(null);
        captureActiveLayerSnapshot(snapshotRef.current);

        mgr.load(anim, grid.cols, grid.rows, grid.data, activeLayer.animation);
        // Store animation state on the layer
        activeLayer.animation.currentAnim = anim;
        activeLayer.animation.snapshot = snapshotRef.current;
        activeLayer.animation.fps = anim.fps;
        activeLayer.animation.frame = 0;

        setCurrentAnim(anim);
        try { localStorage.setItem(STORAGE_KEY_ANIM, anim.name); } catch { }
        setAnimState("playing");
        setAnimFps(anim.fps);
        setAnimFrame(0);
        mgr.play();
        const layerId = activeLayer.id;
        recordAction({ type: "animation", layerId, name: anim.name, action: "play", fps: anim.fps });
    }, [recordAction]);

    const handleAnimPlay = useCallback(() => {
        const activeLayer = layerManagerRef.current?.getActiveLayer();
        const grid = layerManagerRef.current?.getActiveLayer()?.grid;
        if (grid && snapshotRef.current) {
            // Re-capture in case we're resuming
            captureActiveLayerSnapshot(snapshotRef.current);
            if (activeLayer) {
                activeLayer.animation.snapshot = snapshotRef.current;
            }
        }
        const mgr = animRef.current;
        if (!mgr) return;
        mgr.play();
        if (mgr.state === "playing") {
            setAnimState("playing");
        }
        const layerId = activeLayer?.id;
        if (layerId) {
            recordAction({
                type: "animation",
                layerId,
                name: layerManagerRef.current?.getActiveLayer()?.animation.currentAnim?.name ?? currentAnim?.name ?? null,
                action: "play",
                fps: animRef.current?.fps,
            });
        }
    }, [currentAnim, recordAction]);

    const handleAnimPause = useCallback(() => {
        const mgr = animRef.current;
        if (!mgr) return;
        mgr.pause();
        const activeLayer = layerManagerRef.current?.getActiveLayer();
        if (activeLayer) {
            activeLayer.animation.frame = mgr.frame;
        }
        if (mgr.state === "paused") {
            setAnimState("paused");
        }
        const layerId = activeLayer?.id;
        if (layerId) {
            recordAction({
                type: "animation",
                layerId,
                name: activeLayer.animation.currentAnim?.name ?? null,
                action: "pause",
                fps: mgr.fps,
            });
        }
    }, [recordAction]);

    const handleAnimStop = useCallback(() => {
        const activeLayer = layerManagerRef.current?.getActiveLayer();
        const mgr = animRef.current;
        mgr?.stop();
        // Restore original content
        const grid = activeLayer?.grid;
        if (grid && snapshotRef.current) {
            grid.loadData(snapshotRef.current);
            snapshotRef.current = null;
        }
        // Update per-layer state
        if (activeLayer) {
            activeLayer.animation.currentAnim = null;
            activeLayer.animation.snapshot = null;
            activeLayer.animation.marqueeBuffer = null;
            activeLayer.animation.marqueeBufferCols = 0;
            activeLayer.animation.frame = 0;
            activeLayer.animation.manager.setRuntimeContext(activeLayer.animation);
        }
        canvasHandleRef.current?.redraw();
        setAnimState("stopped");
        setCurrentAnim(null);
        setAnimState("stopped");
        setAnimFrame(0);
        try { localStorage.removeItem(STORAGE_KEY_ANIM); } catch { }
        strokeRecorder.resume();
        saveGridToStorage();
        if (activeLayer) {
            recordAction({ type: "animation", layerId: activeLayer.id, name: null, action: "stop" });
        }
    }, [recordAction, saveGridToStorage]);

    const handleAnimFpsChange = useCallback((fps: number) => {
        setAnimFps(fps);
        animRef.current?.setFps(fps);
        const activeLayer = layerManagerRef.current?.getActiveLayer();
        if (activeLayer) {
            activeLayer.animation.fps = fps;
            recordAction({
                type: "animation",
                layerId: activeLayer.id,
                name: activeLayer.animation.currentAnim?.name ?? null,
                action: activeLayer.animation.manager.state === "paused" ? "pause" : "play",
                fps,
            });
        }
    }, [recordAction]);

    // ── Effects controls ──────────────────────────────────
    const handleToggleEffects = useCallback(() => {
        setEffectsEnabled((prev) => {
            const next = !prev;
            effectsRef.current?.setEnabled(next);
            const activeLayer = layerManagerRef.current?.getActiveLayer();
            if (activeLayer) {
                activeLayer.effects.enabled = next;
            }
            try { localStorage.setItem(STORAGE_KEY_EFFECTS, String(next)); } catch { }
            if (activeLayer) {
                recordAction({
                    type: "effect",
                    layerId: activeLayer.id,
                    enabled: next,
                    presetName: activeLayer.effects.preset.name,
                    distanceMultiplier: activeLayer.effects.distanceMultiplier,
                    speedMultiplier: activeLayer.effects.speedMultiplier,
                });
            }
            return next;
        });
    }, [recordAction]);

    const handleSelectEffectPreset = useCallback((preset: EffectPreset) => {
        setActiveEffectPreset(preset);
        effectsRef.current?.setPreset(preset);
        const activeLayer = layerManagerRef.current?.getActiveLayer();
        if (activeLayer) {
            activeLayer.effects.preset = preset;
        }
        try { localStorage.setItem(STORAGE_KEY_EFFECT_PRESET, preset.name); } catch { }
        if (activeLayer) {
            recordAction({
                type: "effect",
                layerId: activeLayer.id,
                enabled: activeLayer.effects.enabled,
                presetName: preset.name,
                distanceMultiplier: activeLayer.effects.distanceMultiplier,
                speedMultiplier: activeLayer.effects.speedMultiplier,
            });
        }
    }, [recordAction]);

    const handleEffectsDistanceChange = useCallback((v: number) => {
        setEffectsDistance(v);
        effectsRef.current?.setDistanceMultiplier(v);
        const activeLayer = layerManagerRef.current?.getActiveLayer();
        if (activeLayer) {
            activeLayer.effects.distanceMultiplier = v;
        }
        try { localStorage.setItem(STORAGE_KEY_EFFECT_DISTANCE, String(v)); } catch { }
        if (activeLayer) {
            recordAction({
                type: "effect",
                layerId: activeLayer.id,
                enabled: activeLayer.effects.enabled,
                presetName: activeLayer.effects.preset.name,
                distanceMultiplier: v,
                speedMultiplier: activeLayer.effects.speedMultiplier,
            });
        }
    }, [recordAction]);

    const handleEffectsSpeedChange = useCallback((v: number) => {
        setEffectsSpeed(v);
        effectsRef.current?.setSpeedMultiplier(v);
        const activeLayer = layerManagerRef.current?.getActiveLayer();
        if (activeLayer) {
            activeLayer.effects.speedMultiplier = v;
        }
        try { localStorage.setItem(STORAGE_KEY_EFFECT_SPEED, String(v)); } catch { }
        if (activeLayer) {
            recordAction({
                type: "effect",
                layerId: activeLayer.id,
                enabled: activeLayer.effects.enabled,
                presetName: activeLayer.effects.preset.name,
                distanceMultiplier: activeLayer.effects.distanceMultiplier,
                speedMultiplier: v,
            });
        }
    }, [recordAction]);

    // ── Session recording controls ────────────────────────
    const applyRecordedAction = useCallback((action: ActionEvent) => {
        isApplyingRecordedActionRef.current = true;
        try {
            switch (action.type) {
                case "tool":
                    handleToolChange(action.tool);
                    break;
                case "color":
                    handleColorChange(action.color);
                    break;
                case "palette":
                    handlePaletteChange(action.paletteId);
                    break;
                case "draw":
                    applyToolToCell("draw", action.col, action.row, action.color);
                    break;
                case "erase":
                    applyToolToCell("erase", action.col, action.row);
                    break;
                case "fill":
                    applyToolToCell("fill", action.col, action.row, action.color);
                    break;
                case "pattern": {
                    const pattern = PATTERNS.find((entry) => entry.name === action.name);
                    if (pattern) {
                        handleApplyPattern(pattern.apply);
                    }
                    break;
                }
                case "text":
                    handleRenderText(action.text, action.color, action.scale, action.wrap, action.animId ?? undefined);
                    break;
                case "effect":
                    selectLayerRuntime(action.layerId);
                    handleSelectEffectPreset(EFFECT_PRESETS.find((preset) => preset.name === action.presetName) ?? EFFECT_PRESETS[0]);
                    if (effectsRef.current?.enabled !== action.enabled) {
                        handleToggleEffects();
                    }
                    handleEffectsDistanceChange(action.distanceMultiplier);
                    handleEffectsSpeedChange(action.speedMultiplier);
                    break;
                case "effectTrigger":
                    selectLayerRuntime(action.layerId);
                    effectsRef.current?.trigger(action.col, action.row, action.color);
                    break;
                case "physics": {
                    selectLayerRuntime(action.layerId);
                    switch (action.op) {
                        case "enable":
                            physics.enable();
                            setPhysicsEnabled(true);
                            break;
                        case "disable":
                            physics.disable();
                            setPhysicsEnabled(false);
                            break;
                        case "preset":
                            if (action.preset) {
                                physics.applyPresetToActive(action.preset as PresetName);
                                setPhysicsEnabled(true);
                                setPhysicsPreset(action.preset as PresetName);
                            }
                            break;
                        case "config":
                            physics.setConfig({ gravityY: action.gravityY, restitution: action.restitution });
                            if (typeof action.gravityY === "number") setPhysicsGravity(action.gravityY);
                            if (typeof action.restitution === "number") setPhysicsBounce(action.restitution);
                            break;
                        case "reset":
                            physics.reset();
                            setPhysicsPreset(null);
                            break;
                    }
                    break;
                }
                case "animation": {
                    selectLayerRuntime(action.layerId);
                    if (action.action === "stop") {
                        handleAnimStop();
                        break;
                    }
                    if (action.action === "pause") {
                        handleAnimPause();
                        if (typeof action.fps === "number") {
                            handleAnimFpsChange(action.fps);
                        }
                        break;
                    }
                    if (action.name) {
                        const targetAnim = [...ANIMATIONS, ...TEXT_ANIMATIONS].find((entry) => entry.name === action.name);
                        if (targetAnim) {
                            const currentLayer = layerManagerRef.current?.getActiveLayer();
                            if (currentLayer?.animation.currentAnim?.name !== targetAnim.name || animRef.current?.state === "stopped") {
                                handleSelectAnimation(targetAnim);
                            } else {
                                handleAnimPlay();
                            }
                        } else {
                            handleAnimPlay();
                        }
                    } else {
                        handleAnimPlay();
                    }
                    if (typeof action.fps === "number") {
                        handleAnimFpsChange(action.fps);
                    }
                    break;
                }
                case "clear":
                    layerManagerRef.current?.clearCanvas();
                    snapshotRef.current = null;
                    contentLayersRef.current = [];
                    setActiveLayerMarqueeBuffer(null);
                    syncActiveLayerState();
                    canvasHandleRef.current?.redraw();
                    break;
                case "layer":
                    if (action.action === "sync") {
                        const manager = layerManagerRef.current;
                        if (!manager) break;
                        manager.restoreSerializedLayers(action.layers, action.activeLayerId);
                        setLayerManagerView(manager);
                        syncActiveLayerState();
                        canvasHandleRef.current?.redraw();
                    } else if (action.action === "select") {
                        selectLayerRuntime(action.layerId);
                    }
                    break;
            }
        } finally {
            isApplyingRecordedActionRef.current = false;
        }
    }, [
        applyToolToCell,
        handleAnimFpsChange,
        handleAnimPause,
        handleAnimPlay,
        handleAnimStop,
        handleApplyPattern,
        handleColorChange,
        handleEffectsDistanceChange,
        handleEffectsSpeedChange,
        handlePaletteChange,
        handleRenderText,
        handleSelectAnimation,
        handleSelectEffectPreset,
        handleToggleEffects,
        handleToolChange,
        physics,
        selectLayerRuntime,
        syncActiveLayerState,
    ]);

    useEffect(() => {
        const recorder = actionRecRef.current;
        recorder.configure({
            getInitialState: serializeBoardState,
            getSeed,
            restoreState: restoreBoardState,
            applyAction: applyRecordedAction,
            onStateChange: (state) => {
                setActionRecordingState(state);
                setActionHasRecording(recorder.hasRecording);
                setActionCount(recorder.actionCount);
                setActionDuration(recorder.duration);
                if (state === "idle" && recorder.playbackActionIndex === 0) {
                    setActionPlaybackIndex(0);
                }
            },
            onPlaybackAction: (index, total) => {
                setActionPlaybackIndex(index);
                setActionCount(total);
                setActionDuration(recorder.duration);
            },
        });
    }, [applyRecordedAction, restoreBoardState, serializeBoardState]);

    const handleToggleLoopMode = useCallback(() => {
        setLoopEnabled((value) => {
            const next = !value;
            sessionRecRef.current.setLooping(next);
            actionRecRef.current.setLooping(next);
            return next;
        });
    }, [setLoopEnabled]);

    const handleStartRecording = useCallback(() => {
        const manager = layerManagerRef.current;
        if (!manager) return;

        configureFrameRecorder();
        setShowPlaybackBar(true);

        if (recordingMode === "action") {
            setSeed(createSeed());
            sessionRecRef.current.startRecording();
            actionRecRef.current.startRecording();
            setActionRecordingState("recording");
            setActionCount(0);
            setActionDuration(0);
            setActionPlaybackIndex(0);
            setActionHasRecording(false);
            setFrameRecFrameCount(0);
            setFrameRecDuration(0);
            setFrameRecPlaybackFrame(0);
            setFrameRecHasRecording(false);
            return;
        }

        sessionRecRef.current.startRecording();
        setFrameRecFrameCount(0);
        setFrameRecDuration(0);
        setFrameRecPlaybackFrame(0);
    }, [
        configureFrameRecorder,
        recordingMode,
        sessionRecRef,
        setFrameRecDuration,
        setFrameRecFrameCount,
        setFrameRecHasRecording,
        setFrameRecPlaybackFrame,
    ]);

    const handleStopRecording = useCallback(() => {
        if (recordingMode === "action") {
            actionRecRef.current.stopRecording();
            setActionRecordingState("idle");
            setActionCount(actionRecRef.current.actionCount);
            setActionDuration(actionRecRef.current.duration);
            setActionHasRecording(actionRecRef.current.hasRecording);

            sessionRecRef.current.stopRecording();
            if (actionRecRef.current.hasRecording) {
                setFrameRecFrameCount(sessionRecRef.current.frameCount);
                setFrameRecDuration(sessionRecRef.current.duration);
                setFrameRecHasRecording(sessionRecRef.current.hasRecording);
            } else {
                sessionRecRef.current.clear();
                setFrameRecFrameCount(0);
                setFrameRecDuration(0);
                setFrameRecPlaybackFrame(0);
                setFrameRecHasRecording(false);
            }
            return;
        }

        sessionRecRef.current.stopRecording();
        setFrameRecFrameCount(sessionRecRef.current.frameCount);
        setFrameRecDuration(sessionRecRef.current.duration);
        setFrameRecHasRecording(sessionRecRef.current.hasRecording);
    }, [
        recordingMode,
        sessionRecRef,
        setFrameRecDuration,
        setFrameRecFrameCount,
        setFrameRecHasRecording,
        setFrameRecPlaybackFrame,
    ]);

    const handleStartPlayback = useCallback(() => {
        setShowPlaybackBar(true);

        if (recordingMode === "action") {
            if (actionRecRef.current.state !== "paused") {
                restoreAfterActionPlaybackRef.current = {
                    state: serializeBoardState(),
                    seed: getSeed(),
                };
            }
            actionRecRef.current.startPlayback(loopEnabled);
            return;
        }

        const mgr = animRef.current;
        if (mgr && mgr.state === "playing") {
            mgr.pause();
            animWasPlayingBeforePlayback.current = true;
            setAnimState("paused");
        } else {
            animWasPlayingBeforePlayback.current = false;
        }
        sessionRecRef.current.startPlayback(loopEnabled);
    }, [loopEnabled, recordingMode, serializeBoardState]);

    const handlePausePlayback = useCallback(() => {
        if (recordingMode === "action") {
            actionRecRef.current.pausePlayback();
            return;
        }
        sessionRecRef.current.pausePlayback();
    }, [recordingMode, sessionRecRef]);

    const handleStopPlayback = useCallback(() => {
        if (recordingMode === "action") {
            actionRecRef.current.stopPlayback();
            const previous = restoreAfterActionPlaybackRef.current;
            restoreAfterActionPlaybackRef.current = null;
            if (previous) {
                restoreBoardState(previous.state, previous.seed);
            }
            setActionPlaybackIndex(0);
            return;
        }

        sessionRecRef.current.stopPlayback();
        const grid = layerManagerRef.current?.getActiveLayer()?.grid;
        if (grid && snapshotRef.current) {
            grid.loadData(snapshotRef.current);
            canvasHandleRef.current?.redraw();
        } else if (grid) {
            canvasHandleRef.current?.redraw();
        }
        if (animWasPlayingBeforePlayback.current) {
            animWasPlayingBeforePlayback.current = false;
            animRef.current?.play();
            setAnimState("playing");
        }
    }, [recordingMode, restoreBoardState, sessionRecRef]);

    const handleExportRecording = useCallback(() => {
        if (recordingMode === "action") {
            actionRecRef.current.downloadRecording();
            return;
        }
        sessionRecRef.current.downloadRecording();
    }, [recordingMode, sessionRecRef]);

    const handleImportRecording = useCallback(async (file: File) => {
        const actionOk = await actionRecRef.current.loadFromFileInput(file);
        if (actionOk) {
            setRecordingMode("action");
            setActionRecordingState("idle");
            setActionCount(actionRecRef.current.actionCount);
            setActionDuration(actionRecRef.current.duration);
            setActionPlaybackIndex(0);
            setActionHasRecording(actionRecRef.current.hasRecording);
            return;
        }

        const frameOk = await sessionRecRef.current.loadFromFileInput(file);
        if (frameOk) {
            setRecordingMode("frame");
            setFrameRecFrameCount(sessionRecRef.current.frameCount);
            setFrameRecDuration(sessionRecRef.current.duration);
            setFrameRecHasRecording(sessionRecRef.current.hasRecording);
            setFrameRecordingState("idle");
        }
    }, [sessionRecRef, setFrameRecDuration, setFrameRecFrameCount, setFrameRecHasRecording, setFrameRecordingState]);

    const handleClearRecording = useCallback(() => {
        if (recordingMode === "action") {
            actionRecRef.current.clear();
            setActionRecordingState("idle");
            setActionCount(0);
            setActionDuration(0);
            setActionPlaybackIndex(0);
            setActionHasRecording(false);
            sessionRecRef.current.clear();
            setFrameRecFrameCount(0);
            setFrameRecDuration(0);
            setFrameRecHasRecording(false);
            setFrameRecPlaybackFrame(0);
            return;
        }

        sessionRecRef.current.clear();
        setFrameRecFrameCount(0);
        setFrameRecDuration(0);
        setFrameRecHasRecording(false);
        setFrameRecPlaybackFrame(0);
    }, [
        recordingMode,
        sessionRecRef,
        setFrameRecDuration,
        setFrameRecFrameCount,
        setFrameRecHasRecording,
        setFrameRecPlaybackFrame,
    ]);

    const recordingState = recordingMode === "action" ? actionRecordingState : frameRecordingState;
    const recFrameCount = recordingMode === "action" ? actionCount : frameRecFrameCount;
    const recDuration = recordingMode === "action" ? actionDuration : frameRecDuration;
    const recPlaybackFrame = recordingMode === "action" ? actionPlaybackIndex : frameRecPlaybackFrame;
    const recHasRecording = recordingMode === "action" ? actionHasRecording : frameRecHasRecording;

    // useBoardShortcuts: fullscreen tracking + keyboard shortcuts
    const { toggleFullscreen } = useBoardShortcuts({
        isFullscreen,
        setIsFullscreen,
        animRef,
        handleUndo,
        handleAnimPause,
        handleAnimPlay,
    });


    return (
        <>
            {/* Canvas layer */}
            <LEDCanvas
                ref={canvasHandleRef}
                layerManagerRef={layerManagerRef}
                settings={settings}
                onCellHover={handleCellHover}
                onCellClick={handleCellClick}
                onCellDrag={handleCellDrag}
                onCellDragEnd={handleDragEnd}
                onGridResize={handleGridResize}
            />

            {/* Gesture cursor overlay */}
            {gestureEnabled && gestureCursorScreen && (() => {
                const cs = settings.cellSize;
                const col = Math.floor(gestureCursorScreen.x / cs);
                const row = Math.floor(gestureCursorScreen.y / cs);
                return (
                    <div
                        className="fixed pointer-events-none z-20 rounded-sm transition-[border-color,box-shadow]"
                        style={{
                            left: col * cs - 1,
                            top: row * cs - 1,
                            width: cs + 2,
                            height: cs + 2,
                            border: `2px solid ${gestureDrawing
                                ? "rgba(250,204,21,0.95)"
                                : "rgba(192,132,252,0.8)"
                                }`,
                            boxShadow: gestureDrawing
                                ? "0 0 10px rgba(250,204,21,0.5), 0 0 4px rgba(250,204,21,0.8)"
                                : "0 0 8px rgba(192,132,252,0.4)",
                        }}
                    />
                );
            })()}

            {/* Gesture controller (camera + MediaPipe, renders null) */}
            {gestureEnabled && (
                <>
                    {/* Hidden video element -- always in DOM so the camera feed persists even when sidebar is collapsed */}
                    <video
                        ref={gestureVideoRef}
                        className="fixed top-0 left-0 w-0 h-0 opacity-0 pointer-events-none"
                        muted
                        playsInline
                    />
                    <GestureController
                        videoRef={gestureVideoRef}
                        pinchThreshold={gesturePinchThreshold}
                        onCursorMove={handleGestureCursorMove}
                        onPinchAt={handleGesturePinchAt}
                        onPinchRelease={handleGesturePinchRelease}
                        onScroll={handleGestureScroll}
                        onSlapClear={handleGestureSwipeClear}
                        onStatusChange={handleGestureStatus}
                    />
                </>
            )}

            {/* Control Panel */}
            <ControlPanel
                layerManager={layerManagerView}
                onLayerChange={handleLayerChangeTracked}
                activeTool={activeTool}
                activeColor={activeColor}
                settings={settings}
                gridDims={gridDims}
                cellInfo={cellInfo}
                onToolChange={handleToolChange}
                onColorChange={handleColorChange}
                onToggleGrid={toggleGrid}
                onClear={clearCanvas}
                onReset={resetWorkspace}
                onUndo={handleUndo}
                canUndo={canUndo}
                onApplyPattern={handleApplyPattern}
                onRenderText={handleRenderText}
                onCellSizeChange={handleCellSizeChange}
                // Animation props
                animState={animState}
                currentAnim={currentAnim}
                animFps={animFps}
                animFrame={animFrame}
                onSelectAnimation={handleSelectAnimation}
                onAnimPlay={handleAnimPlay}
                onAnimPause={handleAnimPause}
                onAnimStop={handleAnimStop}
                onAnimFpsChange={handleAnimFpsChange}
                // Recording props
                recordingMode={recordingMode}
                recordingState={recordingState}
                hasRecording={recHasRecording}
                recFrameCount={recFrameCount}
                recDuration={recDuration}
                recPlaybackFrame={recPlaybackFrame}
                onStartRecording={handleStartRecording}
                onStopRecording={handleStopRecording}
                loopEnabled={loopEnabled}
                onRecordingModeChange={setRecordingMode}
                onToggleLoop={handleToggleLoopMode}
                onStartPlayback={handleStartPlayback}
                onPausePlayback={handlePausePlayback}
                onStopPlayback={handleStopPlayback}
                onExportRecording={handleExportRecording}
                onImportRecording={handleImportRecording}
                onClearRecording={handleClearRecording}
                // Effects props
                effectsEnabled={effectsEnabled}
                activeEffectPreset={activeEffectPreset ?? EFFECT_PRESETS[0]}
                effectsDistanceMultiplier={effectsDistance}
                effectsSpeedMultiplier={effectsSpeed}
                onToggleEffects={handleToggleEffects}
                onSelectEffectPreset={handleSelectEffectPreset}
                onEffectsDistanceChange={handleEffectsDistanceChange}
                onEffectsSpeedChange={handleEffectsSpeedChange}
                // Physics props
                physicsEnabled={physicsEnabled}
                physicsPreset={physicsPreset}
                physicsGravity={physicsGravity}
                physicsBounce={physicsBounce}
                onTogglePhysics={handleTogglePhysics}
                onApplyPhysicsPreset={handleApplyPhysicsPreset}
                onPhysicsGravityChange={handlePhysicsGravityChange}
                onPhysicsBounceChange={handlePhysicsBounceChange}
                onResetPhysics={handleResetPhysics}
                onBakePhysics={handleBakePhysics}
                getSimulationFrames={physics.getSimulationFrames}
                // Gesture props
                gestureEnabled={gestureEnabled}
                onToggleGesture={handleToggleGesture}
                gestureVideoRef={gestureVideoRef}
                gestureLoadState={gestureLoadState}
                gestureStatusMsg={gestureStatusMsg}
                gesturePinching={gesturePinching}
                gesturePinchThreshold={gesturePinchThreshold}
                onGesturePinchThresholdChange={handleGesturePinchThresholdChange}
                gestureShowCamera={gestureShowCamera}
                onToggleGestureCamera={() => setGestureShowCamera((v) => !v)}
                panelRef={panelRef}
                exportRecorder={sessionRecorder}
                exportGetGridData={getDisplayGridData}
                exportHasRecording={frameRecHasRecording}
                activePaletteId={activePaletteId}
                onSelectPalette={handlePaletteChange}
            />

            {/* Floating playback mini-bar */}
            {(recordingState === "playing" || recordingState === "paused") && showPlaybackBar && (
                <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 rounded-full bg-black/80 backdrop-blur-md px-4 py-2 shadow-lg border border-white/10 text-xs font-mono select-none pointer-events-auto">
                    {/* State indicator */}
                    <span className={`h-2 w-2 rounded-full shrink-0 ${recordingState === "playing" ? "bg-green-500 animate-pulse" : "bg-yellow-500"}`} />

                    {/* Play / Pause */}
                    {recordingState === "playing" ? (
                        <button
                            onClick={handlePausePlayback}
                            className="flex items-center justify-center rounded-full bg-yellow-500/20 text-yellow-300 w-7 h-7 hover:bg-yellow-500/40 transition"
                            title="Pause"
                        >
                            <svg width={12} height={12} viewBox="0 0 16 16" fill="currentColor"><rect x="3" y="2" width="3.5" height="12" rx="0.5" /><rect x="9.5" y="2" width="3.5" height="12" rx="0.5" /></svg>
                        </button>
                    ) : (
                        <button
                            onClick={handleStartPlayback}
                            className="flex items-center justify-center rounded-full bg-green-500/20 text-green-300 w-7 h-7 hover:bg-green-500/40 transition"
                            title="Resume"
                        >
                            <svg width={12} height={12} viewBox="0 0 16 16" fill="currentColor"><path d="M4 2.5v11l9-5.5z" /></svg>
                        </button>
                    )}

                    {/* Stop */}
                    <button
                        onClick={handleStopPlayback}
                        className="flex items-center justify-center rounded-full bg-white/10 text-white/60 w-7 h-7 hover:bg-white/20 transition"
                        title="Stop"
                    >
                        <svg width={12} height={12} viewBox="0 0 16 16" fill="currentColor"><rect x="3" y="3" width="10" height="10" rx="1" /></svg>
                    </button>

                    {/* Loop toggle */}
                    <button
                        onClick={handleToggleLoopMode}
                        className={`flex items-center justify-center rounded-full w-7 h-7 transition ${loopEnabled ? "bg-green-500/30 text-green-300 hover:bg-green-500/50" : "bg-white/10 text-white/40 hover:bg-white/20"}`}
                        title={loopEnabled ? "Loop: ON" : "Loop: OFF"}
                    >
                        <svg width={12} height={12} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M2 8a6 6 0 0110.5-4" /><path d="M14 8a6 6 0 01-10.5 4" /><path d="M12.5 1v3h-3" /><path d="M3.5 15v-3h3" />
                        </svg>
                    </button>

                    {/* Frame info */}
                    <span className="text-white/50 text-[10px] tabular-nums ml-1">
                        {recPlaybackFrame + 1}/{recFrameCount}
                    </span>

                    {/* Dismiss */}
                    <button
                        onClick={() => setShowPlaybackBar(false)}
                        className="flex items-center justify-center rounded-full bg-white/5 text-white/30 w-5 h-5 hover:bg-white/20 hover:text-white/70 transition ml-1"
                        title="Hide controls"
                    >
                        <svg width={8} height={8} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                            <path d="M4 4l8 8M12 4l-8 8" />
                        </svg>
                    </button>
                </div>
            )}

            {/* Fullscreen button — hidden when already fullscreen */}
            {!isFullscreen && (
                <button
                    onClick={toggleFullscreen}
                    className="fixed bottom-4 right-4 z-20 rounded-full bg-black/70 p-3 text-white/60 hover:text-white hover:bg-black/90 backdrop-blur-md transition shadow-lg border border-white/10"
                    title="Enter fullscreen"
                >
                    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M8 3H5a2 2 0 00-2 2v3" />
                        <path d="M21 8V5a2 2 0 00-2-2h-3" />
                        <path d="M3 16v3a2 2 0 002 2h3" />
                        <path d="M16 21h3a2 2 0 002-2v-3" />
                    </svg>
                </button>
            )}

            {/* Timeline Editor Toggle Button */}
            {!isFullscreen && !showTimeline && (
                <button
                    onClick={() => {
                        setShowTimeline(true);
                        // ensure animations stop when entering timeline mode
                        if (animRef.current?.state === "playing") {
                            animRef.current.stop();
                        }
                    }}
                    className="fixed bottom-4 left-4 z-20 rounded-full bg-slate-800/80 p-3 text-emerald-400 hover:text-white hover:bg-slate-700 backdrop-blur-md transition shadow-lg border border-emerald-500/30"
                    title="Open Timeline Editor"
                >
                    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="3" y1="12" x2="21" y2="12"></line>
                        <line x1="3" y1="6" x2="21" y2="6"></line>
                        <line x1="3" y1="18" x2="21" y2="18"></line>
                        <polygon points="10 9 15 12 10 15 10 9"></polygon>
                    </svg>
                </button>
            )}

            {showTimeline && (
                <TimelinePanel
                    currentTime={timelineCurrentTime}
                    duration={timelineDuration}
                    isPlaying={timelinePlaying}
                    tracks={timelineTracks}
                    layers={layerManagerView?.layers || []}
                    onPlay={() => {
                         if (layerManagerRef.current && effectsRef.current) {
                             handleTimelinePlay(layerManagerRef.current, effectsRef.current);
                         }
                    }}
                    onPause={handleTimelinePause}
                    onStop={() => {
                         if (layerManagerRef.current && effectsRef.current) {
                             handleTimelineStop(layerManagerRef.current, effectsRef.current);
                         }
                    }}
                    onSeek={(t) => {
                         if (layerManagerRef.current && effectsRef.current) {
                             handleTimelineSeek(t, layerManagerRef.current, effectsRef.current);
                         }
                    }}
                    onAddTrack={handleAddTrack}
                    onAddClip={handleAddClip}
                    onMoveClip={handleMoveClip}
                    onResizeClip={handleResizeClip}
                    onDeleteClip={handleDeleteClip}
                    onClose={() => setShowTimeline(false)}
                />
            )}
        </>
    );
}
