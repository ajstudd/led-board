"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { GridManager } from "../lib/grid";
import LEDCanvas, { CanvasHandle } from "./Canvas";
import ControlPanel from "./ControlPanel";
import { DEFAULT_SETTINGS, BoardSettings, RGB, ToolKind, AnimationConfig } from "../types";
import { renderTextCentered, renderTextToWideBuffer, measureText } from "../lib/font";
import { AnimationManager, AnimationState } from "../lib/animation";
import { ANIMATIONS, MARQUEE_ANIMATION, captureSnapshot, updateSnapshotPixel, setMarqueeBuffer } from "../lib/animations";
import { strokeRecorder } from "../lib/recorder";
import { uint8ToBase64, base64ToUint8, hslToRgb } from "../lib/utils";
import { EffectsEngine, EffectPreset, EFFECT_PRESETS, EffectsOverlay } from "../lib/effects";
import { SessionRecorder, RecordingState, sessionRecorder } from "../lib/sessionRecorder";
import GestureController, { GestureLoadState } from "./GestureController";

const STORAGE_KEY_COLOR = "tenix-color";
const STORAGE_KEY_TOOL = "tenix-tool";
const STORAGE_KEY_GRID = "tenix-grid";
const STORAGE_KEY_SHOW_GRID = "tenix-showGrid";
const STORAGE_KEY_ANIM = "tenix-anim";
const STORAGE_KEY_EFFECTS = "tenix-effects";
const STORAGE_KEY_EFFECT_PRESET = "tenix-effectPreset";
const STORAGE_KEY_EFFECT_DISTANCE = "tenix-effectDistance";
const STORAGE_KEY_EFFECT_SPEED = "tenix-effectSpeed";
const STORAGE_KEY_CELL_SIZE = "tenix-cellSize";
const MAX_UNDO = 50;

export default function LEDBoard() {
    const gridRef = useRef<GridManager | null>(null);
    const canvasHandleRef = useRef<CanvasHandle>(null);
    const animRef = useRef<AnimationManager | null>(null);
    const effectsRef = useRef<EffectsEngine | null>(null);
    const effectsOverlayRef = useRef<EffectsOverlay | null>(null);

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

    // ── Animation state ───────────────────────────────────
    const [animState, setAnimState] = useState<AnimationState>("stopped");
    const [currentAnim, setCurrentAnim] = useState<AnimationConfig | null>(null);
    const [animFps, setAnimFps] = useState(15);
    const [animFrame, setAnimFrame] = useState(0);
    const snapshotRef = useRef<Uint8ClampedArray | null>(null);

    // ── Effects state ──────────────────────────────────
    const [effectsEnabled, setEffectsEnabled] = useState(true);
    const [activeEffectPreset, setActiveEffectPreset] = useState<EffectPreset>(EFFECT_PRESETS[0]);
    const [effectsDistance, setEffectsDistance] = useState(1);
    const [effectsSpeed, setEffectsSpeed] = useState(1);

    // ── Gesture control state ─────────────────────────
    const [gestureEnabled, setGestureEnabled] = useState(false);
    const [gestureCursorScreen, setGestureCursorScreen] = useState<{ x: number; y: number } | null>(null);
    const [gestureDrawing, setGestureDrawing] = useState(false);
    const [gestureLoadState, setGestureLoadState] = useState<GestureLoadState>("loading");
    const [gestureStatusMsg, setGestureStatusMsg] = useState("");
    const [gesturePinching, setGesturePinching] = useState(false);
    const [gesturePinchThreshold, setGesturePinchThreshold] = useState(0.08);
    const [gestureShowCamera, setGestureShowCamera] = useState(true);
    const gestureVideoRef = useRef<HTMLVideoElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const gestureStrokeRef = useRef(false);

    // ── Undo stack ──────────────────────────────────────
    const undoStackRef = useRef<Uint8ClampedArray[]>([]);
    const strokeActiveRef = useRef(false);
    const [canUndo, setCanUndo] = useState(false);

    // ── Session recording state ────────────────────────
    const sessionRecRef = useRef<SessionRecorder>(sessionRecorder);
    const [recordingState, setRecordingState] = useState<RecordingState>("idle");
    const [recFrameCount, setRecFrameCount] = useState(0);
    const [recDuration, setRecDuration] = useState(0);
    const [recPlaybackFrame, setRecPlaybackFrame] = useState(0);
    const [recHasRecording, setRecHasRecording] = useState(false);
    const [loopEnabled, setLoopEnabled] = useState(false);
    const [showPlaybackBar, setShowPlaybackBar] = useState(true);
    /** Tracks whether animation was playing before recording playback started */
    const animWasPlayingBeforePlayback = useRef(false);

    // ── Fullscreen state ────────────────────────────────
    const [isFullscreen, setIsFullscreen] = useState(false);

    // ── Content layers tracking (for re-applying on resize) ──
    // Stores an ordered list of operations to replay when the grid resizes.
    // A pattern always replaces everything (resets the stack), while text
    // is additive (pushed on top).
    type ContentLayer =
        | { type: "pattern"; fn: (cols: number, rows: number, data: Uint8ClampedArray) => void }
        | { type: "text"; text: string; color: RGB; scale: number; wrap: boolean };
    const contentLayersRef = useRef<ContentLayer[]>([]);

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
        gridRef.current = new GridManager(w, h, cellSize);

        // Load saved grid data from localStorage
        try {
            const saved = localStorage.getItem(STORAGE_KEY_GRID);
            if (saved) {
                const { data: b64, cols: savedCols, rows: savedRows } = JSON.parse(saved);
                const savedData = base64ToUint8(b64);
                const grid = gridRef.current;
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
        } catch { /* ignore corrupted data */ }

        const dims = { cols: gridRef.current.cols, rows: gridRef.current.rows };
        setGridDims(dims);

        // Redraw after loading (canvas effect may have run before data was loaded)
        requestAnimationFrame(() => canvasHandleRef.current?.redraw());
    }, []);

    // ── Initialise animation manager ─────────────────────
    useEffect(() => {
        const redraw = () => {
            canvasHandleRef.current?.redraw();
        };
        const onStateChange = (state: AnimationState) => {
            setAnimState(state);
        };
        animRef.current = new AnimationManager(redraw, onStateChange);
        return () => {
            animRef.current?.destroy();
        };
    }, []);

    // ── Initialise effects engine ─────────────────────────
    useEffect(() => {
        const redraw = () => {
            canvasHandleRef.current?.redraw();
        };
        const engine = new EffectsEngine(redraw);
        effectsRef.current = engine;
        // Size the overlay to match the current grid
        const grid = gridRef.current;
        if (grid) {
            engine.updateGrid(grid.cols, grid.rows);
            effectsOverlayRef.current = engine.overlay;
        }
        // Restore saved preferences
        try {
            const savedEnabled = localStorage.getItem(STORAGE_KEY_EFFECTS);
            if (savedEnabled === "false") {
                engine.setEnabled(false);
                queueMicrotask(() => setEffectsEnabled(false));
            } else {
                engine.setEnabled(true);
                queueMicrotask(() => setEffectsEnabled(true));
            }
            const savedPreset = localStorage.getItem(STORAGE_KEY_EFFECT_PRESET);
            if (savedPreset) {
                const match = EFFECT_PRESETS.find((p) => p.name === savedPreset);
                if (match) {
                    engine.setPreset(match);
                    queueMicrotask(() => setActiveEffectPreset(match));
                }
            }
            const savedDist = localStorage.getItem(STORAGE_KEY_EFFECT_DISTANCE);
            if (savedDist) {
                const v = parseFloat(savedDist);
                if (!isNaN(v)) {
                    engine.setDistanceMultiplier(v);
                    queueMicrotask(() => setEffectsDistance(v));
                }
            }
            const savedSpeed = localStorage.getItem(STORAGE_KEY_EFFECT_SPEED);
            if (savedSpeed) {
                const v = parseFloat(savedSpeed);
                if (!isNaN(v)) {
                    engine.setSpeedMultiplier(v);
                    queueMicrotask(() => setEffectsSpeed(v));
                }
            }
        } catch { /* ignore */ }
        return () => {
            engine.destroy();
        };
    }, []);

    // ── Initialise session recorder ───────────────────────
    useEffect(() => {
        const rec = sessionRecRef.current;
        const grid = gridRef.current;
        if (!grid) return;

        rec.configure({
            cols: grid.cols,
            rows: grid.rows,
            captureFps: 30,
            getGridData: () => {
                const g = gridRef.current;
                if (!g) return null;
                const raw = g.data;
                const overlay = effectsOverlayRef.current;
                if (!overlay?.buffer || overlay.cols === 0) return raw;
                const len = g.cols * g.rows;
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
            },
            setGridData: (data: Uint8ClampedArray) => {
                gridRef.current?.loadData(data);
            },
            redraw: () => canvasHandleRef.current?.redraw(),
            onStateChange: (state: RecordingState) => {
                setRecordingState(state);
                setRecHasRecording(rec.hasRecording);
            },
            onPlaybackFrame: (frame: number) => {
                setRecPlaybackFrame(frame);
            },
        });

        return () => {
            rec.destroy();
        };
    }, []);

    // Sync recording stats periodically while recording
    useEffect(() => {
        if (recordingState !== "recording") return;
        const id = setInterval(() => {
            const rec = sessionRecRef.current;
            setRecFrameCount(rec.frameCount);
            setRecDuration(rec.duration);
        }, 200);
        return () => clearInterval(id);
    }, [recordingState]);

    // Sync frame counter periodically while playing
    useEffect(() => {
        if (animState !== "playing") return;
        const id = setInterval(() => {
            if (animRef.current) {
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
                if (savedTool && ["draw", "erase", "fill"].includes(savedTool)) {
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
                            const grid = gridRef.current;
                            const mgr = animRef.current;
                            if (!grid || !mgr) return;
                            strokeRecorder.pause();
                            if (!snapshotRef.current) {
                                snapshotRef.current = grid.cloneData();
                            }
                            captureSnapshot(snapshotRef.current);
                            mgr.load(match, grid.cols, grid.rows, grid.data);
                            setCurrentAnim(match);
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
    useEffect(() => {
        try { localStorage.setItem(STORAGE_KEY_COLOR, JSON.stringify(activeColor)); } catch { }
    }, [activeColor]);

    useEffect(() => {
        try { localStorage.setItem(STORAGE_KEY_TOOL, activeTool); } catch { }
    }, [activeTool]);

    useEffect(() => {
        try { localStorage.setItem(STORAGE_KEY_SHOW_GRID, String(settings.showGrid)); } catch { }
    }, [settings.showGrid]);

    // ── Save grid data to localStorage periodically + on unload
    const saveGridToStorage = useCallback(() => {
        const grid = gridRef.current;
        if (!grid) return;
        const data = snapshotRef.current || grid.data;
        try {
            localStorage.setItem(STORAGE_KEY_GRID, JSON.stringify({
                data: uint8ToBase64(data),
                cols: grid.cols,
                rows: grid.rows,
            }));
        } catch { }
    }, []);

    useEffect(() => {
        window.addEventListener("beforeunload", saveGridToStorage);
        const interval = setInterval(saveGridToStorage, 5000);
        return () => {
            window.removeEventListener("beforeunload", saveGridToStorage);
            clearInterval(interval);
        };
    }, [saveGridToStorage]);

    // ── Replay content layers into a buffer ─────────────
    const replayLayers = useCallback(
        (layers: ContentLayer[], cols: number, rows: number, buf: Uint8ClampedArray) => {
            for (const layer of layers) {
                if (layer.type === "pattern") {
                    buf.fill(0);
                    layer.fn(cols, rows, buf);
                } else if (layer.type === "text") {
                    renderTextCentered(
                        layer.text, cols, rows, buf,
                        layer.color, layer.scale, layer.wrap,
                    );
                }
            }
        },
        [],
    );

    // ── Handle grid resize (called from Canvas after resizePreserve) ──
    const handleGridResize = useCallback(
        (oldCols: number, oldRows: number, newCols: number, newRows: number) => {
            const grid = gridRef.current;
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
                    setMarqueeBuffer(buffer, bufferCols);

                    // Update snapshot with base pattern
                    const newSnap = new Uint8ClampedArray(newCols * newRows * 3);
                    if (baseData) newSnap.set(baseData);
                    snapshotRef.current = newSnap;
                    captureSnapshot(snapshotRef.current);
                    grid.loadData(snapshotRef.current);
                } else {
                    // Text fits or wrap mode — replay normally
                    const buf = new Uint8ClampedArray(newCols * newRows * 3);
                    replayLayers(layers, newCols, newRows, buf);

                    // If was a marquee but now fits, stop marquee
                    if (animRef.current?.currentAnimation?.name === "Text Marquee") {
                        setMarqueeBuffer(null);
                    }

                    if (snapshotRef.current) {
                        snapshotRef.current = buf;
                        captureSnapshot(snapshotRef.current);
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
                    captureSnapshot(snapshotRef.current);
                }
            }

            // Clear undo stack on resize (data sizes changed)
            undoStackRef.current = [];
            setCanUndo(false);

            setGridDims({ cols: newCols, rows: newRows });

            // Keep animation manager in sync with resized grid
            if (animRef.current) {
                animRef.current.updateGrid(newCols, newRows, grid.data);
            }

            // Keep effects engine in sync with resized grid
            if (effectsRef.current) {
                effectsRef.current.updateGrid(newCols, newRows);
                effectsOverlayRef.current = effectsRef.current.overlay;
            }

            // Keep session recorder in sync
            sessionRecRef.current.updateGrid(newCols, newRows);
        },
        [replayLayers],
    );

    // ── Handle cell size change ───────────────────────────
    const handleCellSizeChange = useCallback(
        (newSize: number) => {
            const grid = gridRef.current;
            if (!grid) return;

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
            grid.resizeCellSize(w, h, clamped);

            const newCols = grid.cols;
            const newRows = grid.rows;

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
                    setMarqueeBuffer(buffer, bufferCols);

                    const newSnap = new Uint8ClampedArray(newCols * newRows * 3);
                    if (baseData) newSnap.set(baseData);
                    snapshotRef.current = newSnap;
                    captureSnapshot(snapshotRef.current);
                    grid.loadData(snapshotRef.current);
                } else {
                    const buf = new Uint8ClampedArray(newCols * newRows * 3);
                    replayLayers(layers, newCols, newRows, buf);

                    if (animRef.current?.currentAnimation?.name === "Text Marquee") {
                        setMarqueeBuffer(null);
                    }

                    if (snapshotRef.current) {
                        snapshotRef.current = buf;
                        captureSnapshot(snapshotRef.current);
                        grid.loadData(snapshotRef.current);
                    } else {
                        grid.loadData(buf);
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
                    captureSnapshot(snapshotRef.current);
                }
            }

            // Clear undo stack (data sizes changed)
            undoStackRef.current = [];
            setCanUndo(false);

            setGridDims({ cols: newCols, rows: newRows });

            if (animRef.current) {
                animRef.current.updateGrid(newCols, newRows, grid.data);
            }
            if (effectsRef.current) {
                effectsRef.current.updateGrid(newCols, newRows);
                effectsOverlayRef.current = effectsRef.current.overlay;
            }

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
        if (tool === "vibe" && !effectsEnabled) {
            setEffectsEnabled(true);
            effectsRef.current?.setEnabled(true);
            try { localStorage.setItem(STORAGE_KEY_EFFECTS, "true"); } catch { }
        }
    }, [effectsEnabled]);

    // ── Undo helpers ───────────────────────────────────
    const pushUndo = useCallback(() => {
        const grid = gridRef.current;
        if (!grid) return;
        const data = snapshotRef.current
            ? new Uint8ClampedArray(snapshotRef.current)
            : grid.cloneData();
        undoStackRef.current.push(data);
        if (undoStackRef.current.length > MAX_UNDO) {
            undoStackRef.current.shift();
        }
        setCanUndo(true);
    }, []);

    const handleUndo = useCallback(() => {
        const stack = undoStackRef.current;
        if (stack.length === 0) return;
        const prevData = stack.pop()!;
        setCanUndo(stack.length > 0);

        const grid = gridRef.current;
        if (!grid) return;

        if (snapshotRef.current) {
            // Animation mode — restore snapshot
            if (prevData.length === snapshotRef.current.length) {
                snapshotRef.current.set(prevData);
            } else {
                snapshotRef.current = new Uint8ClampedArray(prevData);
            }
            captureSnapshot(snapshotRef.current);
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

    // ── Apply tool to a cell ─────────────────────────────
    const applyTool = useCallback(
        (col: number, row: number) => {
            const grid = gridRef.current;
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
                    case "draw":
                        snap[idx] = drawColor[0];
                        snap[idx + 1] = drawColor[1];
                        snap[idx + 2] = drawColor[2];
                        updateSnapshotPixel(idx, drawColor[0], drawColor[1], drawColor[2]);
                        strokeRecorder.record(col, row, drawColor[0], drawColor[1], drawColor[2]);
                        effectsRef.current?.trigger(col, row, activeColor);
                        break;
                    case "erase":
                        snap[idx] = settings.backgroundColor[0];
                        snap[idx + 1] = settings.backgroundColor[1];
                        snap[idx + 2] = settings.backgroundColor[2];
                        updateSnapshotPixel(
                            idx,
                            settings.backgroundColor[0],
                            settings.backgroundColor[1],
                            settings.backgroundColor[2],
                        );
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
                        captureSnapshot(snapshotRef.current);
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
    const handleCellHover = useCallback((col: number, row: number) => {
        const grid = gridRef.current;
        if (!grid) return;
        setCellInfo({ col, row, color: grid.getCell(col, row) });
    }, []);

    // ── Click callback (applies tool once) ─────────────
    const handleCellClick = useCallback(
        (col: number, row: number) => {
            if (activeTool !== "vibe" && !strokeActiveRef.current) {
                pushUndo();
                strokeActiveRef.current = true;
            }
            applyTool(col, row);
        },
        [activeTool, applyTool, pushUndo],
    );

    // ── Drag callbacks (for draw/erase continuous strokes)
    const handleCellDrag = useCallback(
        (col: number, row: number) => {
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
        const grid = gridRef.current;
        if (!grid) return;
        const col = Math.floor(x / grid.cellSize);
        const row = Math.floor(y / grid.cellSize);
        if (grid.inBounds(col, row)) {
            setCellInfo({ col, row, color: grid.getCell(col, row) });
        }
    }, []);

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
            const grid = gridRef.current;
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
        [applyTool, pushUndo],
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
    const handleGestureSwipeClear = useCallback(() => {
        // Stop animation if running
        if (animRef.current && animRef.current.state !== "stopped") {
            animRef.current.stop();
            setMarqueeBuffer(null);
            if (snapshotRef.current) {
                snapshotRef.current = null;
            }
            setCurrentAnim(null);
            setAnimFrame(0);
            try { localStorage.removeItem(STORAGE_KEY_ANIM); } catch { }
            strokeRecorder.resume();
        }
        // Clear effects
        effectsRef.current?.clearEffects();
        // Clear the board
        strokeRecorder.clear();
        contentLayersRef.current = [];
        gridRef.current?.clear();
        canvasHandleRef.current?.redraw();
        // Clear undo stack
        undoStackRef.current = [];
        setCanUndo(false);
        saveGridToStorage();
    }, [saveGridToStorage]);

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

    // ── Clear board ────────────────────────────────────────
    const clearBoard = useCallback(() => {
        pushUndo();
        strokeRecorder.clear();
        contentLayersRef.current = [];
        setMarqueeBuffer(null);
        if (snapshotRef.current) {
            // Clear the content buffer; animation tick picks up the change
            snapshotRef.current.fill(0);
            captureSnapshot(snapshotRef.current);
            if (animRef.current?.state !== "playing") {
                gridRef.current?.clear();
                canvasHandleRef.current?.redraw();
            }
        } else {
            gridRef.current?.clear();
            canvasHandleRef.current?.redraw();
        }
        saveGridToStorage();
    }, [pushUndo, saveGridToStorage]);

    // ── Apply a pattern ───────────────────────────────────
    const handleApplyPattern = useCallback(
        (fn: (cols: number, rows: number, data: Uint8ClampedArray) => void) => {
            const grid = gridRef.current;
            if (!grid) return;
            pushUndo();

            // Pattern replaces everything — reset the layers stack
            contentLayersRef.current = [{ type: "pattern", fn }];

            if (snapshotRef.current) {
                // Apply pattern to the content buffer
                const before = new Uint8ClampedArray(snapshotRef.current);
                snapshotRef.current.fill(0);
                fn(grid.cols, grid.rows, snapshotRef.current);
                captureSnapshot(snapshotRef.current);
                strokeRecorder.recordBulk(before, snapshotRef.current, grid.cols);
                if (animRef.current?.state !== "playing") {
                    grid.loadData(snapshotRef.current);
                    canvasHandleRef.current?.redraw();
                }
            } else {
                const before = grid.cloneData();
                grid.clear();
                fn(grid.cols, grid.rows, grid.data);
                strokeRecorder.recordBulk(before, grid.data, grid.cols);
                canvasHandleRef.current?.redraw();
            }
            saveGridToStorage();
        },
        [pushUndo, saveGridToStorage],
    );

    // ── Render pixel text ─────────────────────────────────
    const handleRenderText = useCallback(
        (text: string, color: RGB, scale: number = 1, wrap: boolean = true) => {
            const grid = gridRef.current;
            const mgr = animRef.current;
            if (!grid) return;
            pushUndo();

            // Replace any previous text layers but keep pattern layers,
            // then add the new text layer on top. This prevents old text
            // from bleeding through when re-rendering or switching modes.
            const patternLayers = contentLayersRef.current.filter(
                (l): l is ContentLayer & { type: "pattern" } => l.type === "pattern",
            );
            const newTextLayer: ContentLayer = { type: "text", text, color, scale, wrap };
            contentLayersRef.current = [...patternLayers, newTextLayer];

            const textWidth = measureText(text, scale);
            const overflows = !wrap && textWidth > grid.cols;

            if (overflows && mgr) {
                // ── Text overflows in overflow mode → auto-start marquee ──
                // Build a base layer (pattern) if any
                let baseData: Uint8ClampedArray | undefined;
                if (patternLayers.length > 0) {
                    baseData = new Uint8ClampedArray(grid.cols * grid.rows * 3);
                    for (const layer of patternLayers) {
                        baseData.fill(0);
                        layer.fn(grid.cols, grid.rows, baseData);
                    }
                }

                // Render text into a wide buffer for the marquee animation
                const { buffer, bufferCols } = renderTextToWideBuffer(
                    text, grid.cols, grid.rows, color, scale, baseData,
                );
                setMarqueeBuffer(buffer, bufferCols);

                // Set up snapshot with just the base pattern (or black)
                if (!snapshotRef.current) {
                    snapshotRef.current = grid.cloneData();
                }
                snapshotRef.current.fill(0);
                if (baseData) snapshotRef.current.set(baseData);
                captureSnapshot(snapshotRef.current);

                strokeRecorder.pause();
                mgr.load(MARQUEE_ANIMATION, grid.cols, grid.rows, grid.data);
                setCurrentAnim(MARQUEE_ANIMATION);
                try { localStorage.setItem(STORAGE_KEY_ANIM, MARQUEE_ANIMATION.name); } catch { }
                setAnimFps(MARQUEE_ANIMATION.fps);
                setAnimFrame(0);
                mgr.play();
            } else {
                // ── Normal rendering (wrap mode or text fits) ──
                // Stop any running marquee
                if (mgr && mgr.currentAnimation?.name === "Text Marquee") {
                    mgr.stop();
                    setMarqueeBuffer(null);
                    if (snapshotRef.current) {
                        grid.loadData(snapshotRef.current);
                        snapshotRef.current = null;
                    }
                    setAnimFrame(0);
                    try { localStorage.removeItem(STORAGE_KEY_ANIM); } catch { }
                    strokeRecorder.resume();
                }

                if (snapshotRef.current) {
                    snapshotRef.current.fill(0);
                    replayLayers(contentLayersRef.current, grid.cols, grid.rows, snapshotRef.current);
                    captureSnapshot(snapshotRef.current);
                    strokeRecorder.recordText(text, grid.cols, grid.rows, color, scale, true);
                    if (animRef.current?.state !== "playing") {
                        grid.loadData(snapshotRef.current);
                        canvasHandleRef.current?.redraw();
                    }
                } else {
                    grid.clear();
                    replayLayers(contentLayersRef.current, grid.cols, grid.rows, grid.data);
                    strokeRecorder.recordText(text, grid.cols, grid.rows, color, scale, true);
                    canvasHandleRef.current?.redraw();
                }
            }
            saveGridToStorage();
        },
        [pushUndo, saveGridToStorage, replayLayers],
    );

    // ── Animation controls ────────────────────────────────
    const handleSelectAnimation = useCallback((anim: AnimationConfig) => {
        const grid = gridRef.current;
        const mgr = animRef.current;
        if (!grid || !mgr) return;

        // Pause recording while animating so tick writes aren't recorded
        strokeRecorder.pause();

        // If no animation running, snapshot the current content.
        // If already animating, KEEP the existing content buffer —
        // switching effects should not capture the animated output.
        if (!snapshotRef.current) {
            snapshotRef.current = grid.cloneData();
        }
        captureSnapshot(snapshotRef.current);

        // Clean up marquee buffer if switching to a different animation
        setMarqueeBuffer(null);

        mgr.load(anim, grid.cols, grid.rows, grid.data);
        setCurrentAnim(anim);
        try { localStorage.setItem(STORAGE_KEY_ANIM, anim.name); } catch { }
        setAnimFps(anim.fps);
        setAnimFrame(0);
        mgr.play();
    }, []);

    const handleAnimPlay = useCallback(() => {
        const grid = gridRef.current;
        if (grid && snapshotRef.current) {
            // Re-capture in case we're resuming
            captureSnapshot(snapshotRef.current);
        }
        animRef.current?.play();
    }, []);

    const handleAnimPause = useCallback(() => {
        animRef.current?.pause();
    }, []);

    const handleAnimStop = useCallback(() => {
        animRef.current?.stop();
        setMarqueeBuffer(null); // clean up marquee if it was running
        // Restore original content
        const grid = gridRef.current;
        if (grid && snapshotRef.current) {
            grid.loadData(snapshotRef.current);
            snapshotRef.current = null;
        }
        canvasHandleRef.current?.redraw();
        setCurrentAnim(null); // fully clear — not just paused
        setAnimFrame(0);
        try { localStorage.removeItem(STORAGE_KEY_ANIM); } catch { }
        strokeRecorder.resume();
        saveGridToStorage();
    }, [saveGridToStorage]);

    const handleAnimFpsChange = useCallback((fps: number) => {
        setAnimFps(fps);
        animRef.current?.setFps(fps);
    }, []);

    // ── Effects controls ──────────────────────────────────
    const handleToggleEffects = useCallback(() => {
        setEffectsEnabled((prev) => {
            const next = !prev;
            effectsRef.current?.setEnabled(next);
            try { localStorage.setItem(STORAGE_KEY_EFFECTS, String(next)); } catch { }
            return next;
        });
    }, []);

    const handleSelectEffectPreset = useCallback((preset: EffectPreset) => {
        setActiveEffectPreset(preset);
        effectsRef.current?.setPreset(preset);
        try { localStorage.setItem(STORAGE_KEY_EFFECT_PRESET, preset.name); } catch { }
    }, []);

    const handleEffectsDistanceChange = useCallback((v: number) => {
        setEffectsDistance(v);
        effectsRef.current?.setDistanceMultiplier(v);
        try { localStorage.setItem(STORAGE_KEY_EFFECT_DISTANCE, String(v)); } catch { }
    }, []);

    const handleEffectsSpeedChange = useCallback((v: number) => {
        setEffectsSpeed(v);
        effectsRef.current?.setSpeedMultiplier(v);
        try { localStorage.setItem(STORAGE_KEY_EFFECT_SPEED, String(v)); } catch { }
    }, []);

    // ── Session recording controls ────────────────────────
    const handleStartRecording = useCallback(() => {
        const rec = sessionRecRef.current;
        const grid = gridRef.current;
        if (!grid) return;
        rec.configure({
            cols: grid.cols,
            rows: grid.rows,
            captureFps: 30,
            getGridData: () => {
                const g = gridRef.current;
                if (!g) return null;
                const raw = g.data;
                const overlay = effectsOverlayRef.current;
                if (!overlay?.buffer || overlay.cols === 0) return raw;
                const len = g.cols * g.rows;
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
            },
            setGridData: (data: Uint8ClampedArray) => {
                gridRef.current?.loadData(data);
            },
            redraw: () => canvasHandleRef.current?.redraw(),
            onStateChange: (state: RecordingState) => {
                setRecordingState(state);
                setRecHasRecording(rec.hasRecording);
            },
            onPlaybackFrame: (frame: number) => {
                setRecPlaybackFrame(frame);
            },
        });
        rec.startRecording();
        setRecFrameCount(0);
        setRecDuration(0);
    }, []);

    const handleStopRecording = useCallback(() => {
        const rec = sessionRecRef.current;
        rec.stopRecording();
        setRecFrameCount(rec.frameCount);
        setRecDuration(rec.duration);
        setRecHasRecording(rec.hasRecording);
    }, []);

    const handleStartPlayback = useCallback(() => {
        // Pause any running animation so it doesn't overwrite grid data
        const mgr = animRef.current;
        if (mgr && mgr.state === "playing") {
            mgr.pause();
            animWasPlayingBeforePlayback.current = true;
        } else {
            animWasPlayingBeforePlayback.current = false;
        }
        setShowPlaybackBar(true);
        sessionRecRef.current.startPlayback(loopEnabled);
    }, [loopEnabled]);

    const handlePausePlayback = useCallback(() => {
        sessionRecRef.current.pausePlayback();
    }, []);

    const handleStopPlayback = useCallback(() => {
        sessionRecRef.current.stopPlayback();
        // Restore the grid to whatever was there before playback
        const grid = gridRef.current;
        if (grid && snapshotRef.current) {
            grid.loadData(snapshotRef.current);
            canvasHandleRef.current?.redraw();
        } else if (grid) {
            canvasHandleRef.current?.redraw();
        }
        // Resume animation if it was playing before
        if (animWasPlayingBeforePlayback.current) {
            animWasPlayingBeforePlayback.current = false;
            animRef.current?.play();
        }
    }, []);

    const handleExportRecording = useCallback(() => {
        sessionRecRef.current.downloadRecording();
    }, []);

    const handleImportRecording = useCallback(async (file: File) => {
        const rec = sessionRecRef.current;
        const ok = await rec.loadFromFileInput(file);
        if (ok) {
            setRecFrameCount(rec.frameCount);
            setRecDuration(rec.duration);
            setRecHasRecording(rec.hasRecording);
            setRecordingState("idle");
        }
    }, []);

    const handleClearRecording = useCallback(() => {
        sessionRecRef.current.clear();
        setRecFrameCount(0);
        setRecDuration(0);
        setRecHasRecording(false);
        setRecPlaybackFrame(0);
    }, []);

    // ── Fullscreen tracking ──────────────────────────────
    useEffect(() => {
        const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
        document.addEventListener("fullscreenchange", onFsChange);
        return () => document.removeEventListener("fullscreenchange", onFsChange);
    }, []);

    const toggleFullscreen = useCallback(() => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(() => { });
        } else {
            document.exitFullscreen().catch(() => { });
        }
    }, []);

    // ── Keyboard shortcuts ────────────────────────────
    useEffect(() => {
        const isInputFocused = () => {
            const el = document.activeElement;
            if (!el) return false;
            const tag = el.tagName;
            return (
                tag === "INPUT" ||
                tag === "TEXTAREA" ||
                tag === "SELECT" ||
                (el as HTMLElement).isContentEditable
            );
        };

        const onKeyDown = (e: KeyboardEvent) => {
            // Ctrl+Z / Cmd+Z — undo (always, even in input)
            if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
                e.preventDefault();
                handleUndo();
                return;
            }

            // Skip remaining shortcuts when typing in an input
            if (isInputFocused()) return;

            // F — toggle fullscreen
            if (e.key === "f" || e.key === "F") {
                e.preventDefault();
                toggleFullscreen();
                return;
            }

            // Space — pause / resume animation (only when an animation is active)
            if (e.key === " " && animRef.current) {
                const state = animRef.current.state;
                if (state === "playing") {
                    e.preventDefault();
                    handleAnimPause();
                } else if (state === "paused") {
                    e.preventDefault();
                    handleAnimPlay();
                }
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [handleUndo, toggleFullscreen, handleAnimPause, handleAnimPlay]);

    return (
        <>
            {/* Canvas layer */}
            <LEDCanvas
                ref={canvasHandleRef}
                gridRef={gridRef}
                effectsOverlayRef={effectsOverlayRef}
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
                activeTool={activeTool}
                activeColor={activeColor}
                settings={settings}
                gridDims={gridDims}
                cellInfo={cellInfo}
                onToolChange={handleToolChange}
                onColorChange={setActiveColor}
                onToggleGrid={toggleGrid}
                onClear={clearBoard}
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
                recordingState={recordingState}
                hasRecording={recHasRecording}
                recFrameCount={recFrameCount}
                recDuration={recDuration}
                recPlaybackFrame={recPlaybackFrame}
                onStartRecording={handleStartRecording}
                onStopRecording={handleStopRecording}
                loopEnabled={loopEnabled}
                onToggleLoop={() => {
                    setLoopEnabled(v => {
                        const next = !v;
                        sessionRecRef.current.setLooping(next);
                        return next;
                    });
                }}
                onStartPlayback={handleStartPlayback}
                onPausePlayback={handlePausePlayback}
                onStopPlayback={handleStopPlayback}
                onExportRecording={handleExportRecording}
                onImportRecording={handleImportRecording}
                onClearRecording={handleClearRecording}
                // Effects props
                effectsEnabled={effectsEnabled}
                activeEffectPreset={activeEffectPreset}
                effectsDistanceMultiplier={effectsDistance}
                effectsSpeedMultiplier={effectsSpeed}
                onToggleEffects={handleToggleEffects}
                onSelectEffectPreset={handleSelectEffectPreset}
                onEffectsDistanceChange={handleEffectsDistanceChange}
                onEffectsSpeedChange={handleEffectsSpeedChange}
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
                        onClick={() => {
                            setLoopEnabled(v => {
                                const next = !v;
                                sessionRecRef.current.setLooping(next);
                                return next;
                            });
                        }}
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
        </>
    );
}
