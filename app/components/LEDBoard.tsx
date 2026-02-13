"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { GridManager } from "../lib/grid";
import LEDCanvas, { CanvasHandle } from "./Canvas";
import ControlPanel from "./ControlPanel";
import { DEFAULT_SETTINGS, BoardSettings, RGB, ToolKind, AnimationConfig } from "../types";
import { renderTextCentered } from "../lib/font";
import { AnimationManager, AnimationState } from "../lib/animation";
import { captureSnapshot, updateSnapshotPixel } from "../lib/animations";
import { strokeRecorder } from "../lib/recorder";

export default function LEDBoard() {
    const gridRef = useRef<GridManager | null>(null);
    const canvasHandleRef = useRef<CanvasHandle>(null);
    const animRef = useRef<AnimationManager | null>(null);

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

    // ── Initialise grid on mount ──────────────────────────
    useEffect(() => {
        const w = window.innerWidth;
        const h = window.innerHeight;
        gridRef.current = new GridManager(w, h, settings.cellSize);
        setGridDims({
            cols: gridRef.current.cols,
            rows: gridRef.current.rows,
        });
    }, [settings.cellSize]);

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

    // ── Update dims on resize ─────────────────────────────
    useEffect(() => {
        const onResize = () => {
            if (gridRef.current) {
                setGridDims({
                    cols: gridRef.current.cols,
                    rows: gridRef.current.rows,
                });
                // Keep animation manager in sync with resized grid
                if (animRef.current) {
                    animRef.current.updateGrid(
                        gridRef.current.cols,
                        gridRef.current.rows,
                        gridRef.current.data,
                    );
                }
            }
        };
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
    }, []);

    // ── Apply tool to a cell ─────────────────────────────
    const applyTool = useCallback(
        (col: number, row: number) => {
            const grid = gridRef.current;
            if (!grid) return;

            const snap = snapshotRef.current;

            if (snap) {
                // Animation active — update the content buffer so changes
                // are reflected in the running (or paused) animation.
                const idx = (row * grid.cols + col) * 3;

                switch (activeTool) {
                    case "draw":
                        snap[idx] = activeColor[0];
                        snap[idx + 1] = activeColor[1];
                        snap[idx + 2] = activeColor[2];
                        updateSnapshotPixel(idx, activeColor[0], activeColor[1], activeColor[2]);
                        strokeRecorder.record(idx, activeColor[0], activeColor[1], activeColor[2]);
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
                            idx,
                            settings.backgroundColor[0],
                            settings.backgroundColor[1],
                            settings.backgroundColor[2],
                        );
                        break;
                    case "fill": {
                        // Temporarily load content, flood-fill, save back
                        const before = new Uint8ClampedArray(snap);
                        grid.loadData(snap);
                        grid.floodFill(col, row, activeColor);
                        snapshotRef.current = grid.cloneData();
                        captureSnapshot(snapshotRef.current);
                        strokeRecorder.recordBulk(before, snapshotRef.current);
                        break;
                    }
                }

                // If paused, update display immediately since no ticks run
                if (animRef.current?.state !== "playing") {
                    grid.loadData(snapshotRef.current!);
                    canvasHandleRef.current?.redraw();
                }
            } else {
                // Normal mode — no animation active
                const idx = (row * grid.cols + col) * 3;
                switch (activeTool) {
                    case "draw":
                        grid.setCell(col, row, activeColor);
                        strokeRecorder.record(idx, activeColor[0], activeColor[1], activeColor[2]);
                        break;
                    case "erase":
                        grid.setCell(col, row, settings.backgroundColor);
                        strokeRecorder.record(
                            idx,
                            settings.backgroundColor[0],
                            settings.backgroundColor[1],
                            settings.backgroundColor[2],
                        );
                        break;
                    case "fill": {
                        const before = grid.cloneData();
                        grid.floodFill(col, row, activeColor);
                        strokeRecorder.recordBulk(before, grid.data);
                        break;
                    }
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
            applyTool(col, row);
        },
        [applyTool],
    );

    // ── Drag callbacks (for draw/erase continuous strokes)
    const handleCellDrag = useCallback(
        (col: number, row: number) => {
            if (activeTool === "fill") return; // fill only on click
            applyTool(col, row);
        },
        [activeTool, applyTool],
    );

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
        strokeRecorder.clear();
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
    }, []);

    // ── Apply a pattern ───────────────────────────────────
    const handleApplyPattern = useCallback(
        (fn: (cols: number, rows: number, data: Uint8ClampedArray) => void) => {
            const grid = gridRef.current;
            if (!grid) return;

            if (snapshotRef.current) {
                // Apply pattern to the content buffer
                const before = new Uint8ClampedArray(snapshotRef.current);
                snapshotRef.current.fill(0);
                fn(grid.cols, grid.rows, snapshotRef.current);
                captureSnapshot(snapshotRef.current);
                strokeRecorder.recordBulk(before, snapshotRef.current);
                if (animRef.current?.state !== "playing") {
                    grid.loadData(snapshotRef.current);
                    canvasHandleRef.current?.redraw();
                }
            } else {
                const before = grid.cloneData();
                grid.clear();
                fn(grid.cols, grid.rows, grid.data);
                strokeRecorder.recordBulk(before, grid.data);
                canvasHandleRef.current?.redraw();
            }
        },
        [],
    );

    // ── Render pixel text ─────────────────────────────────
    const handleRenderText = useCallback(
        (text: string, color: RGB, scale: number = 1) => {
            const grid = gridRef.current;
            if (!grid) return;

            if (snapshotRef.current) {
                // Render text into the content buffer
                const before = new Uint8ClampedArray(snapshotRef.current);
                renderTextCentered(text, grid.cols, grid.rows, snapshotRef.current, color, scale);
                captureSnapshot(snapshotRef.current);
                strokeRecorder.recordBulk(before, snapshotRef.current);
                if (animRef.current?.state !== "playing") {
                    grid.loadData(snapshotRef.current);
                    canvasHandleRef.current?.redraw();
                }
            } else {
                const before = grid.cloneData();
                renderTextCentered(text, grid.cols, grid.rows, grid.data, color, scale);
                strokeRecorder.recordBulk(before, grid.data);
                canvasHandleRef.current?.redraw();
            }
        },
        [],
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

        mgr.load(anim, grid.cols, grid.rows, grid.data);
        setCurrentAnim(anim);
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
        // Restore original content
        const grid = gridRef.current;
        if (grid && snapshotRef.current) {
            grid.loadData(snapshotRef.current);
            snapshotRef.current = null;
        }
        canvasHandleRef.current?.redraw();
        setAnimFrame(0);
        strokeRecorder.resume();
    }, []);

    const handleAnimFpsChange = useCallback((fps: number) => {
        setAnimFps(fps);
        animRef.current?.setFps(fps);
    }, []);

    return (
        <>
            {/* Canvas layer */}
            <LEDCanvas
                ref={canvasHandleRef}
                gridRef={gridRef}
                settings={settings}
                onCellHover={handleCellHover}
                onCellClick={handleCellClick}
                onCellDrag={handleCellDrag}
            />

            {/* Control Panel */}
            <ControlPanel
                activeTool={activeTool}
                activeColor={activeColor}
                settings={settings}
                gridDims={gridDims}
                cellInfo={cellInfo}
                onToolChange={setActiveTool}
                onColorChange={setActiveColor}
                onToggleGrid={toggleGrid}
                onClear={clearBoard}
                onApplyPattern={handleApplyPattern}
                onRenderText={handleRenderText}
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
            />
        </>
    );
}
