"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { GridManager } from "../lib/grid";
import LEDCanvas, { CanvasHandle } from "./Canvas";
import { DEFAULT_SETTINGS, BoardSettings, RGB } from "../types";

export default function LEDBoard() {
    const gridRef = useRef<GridManager | null>(null);
    const canvasHandleRef = useRef<CanvasHandle>(null);

    const [settings, setSettings] = useState<BoardSettings>(DEFAULT_SETTINGS);
    const [cellInfo, setCellInfo] = useState<{
        col: number;
        row: number;
        color: RGB;
    } | null>(null);
    const [gridDims, setGridDims] = useState<{ cols: number; rows: number }>({
        cols: 0,
        rows: 0,
    });

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

    // ── Update dims on resize ─────────────────────────────
    useEffect(() => {
        const onResize = () => {
            if (gridRef.current) {
                setGridDims({
                    cols: gridRef.current.cols,
                    rows: gridRef.current.rows,
                });
            }
        };
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
    }, []);

    // ── Hover callback ────────────────────────────────────
    const handleCellHover = useCallback(
        (col: number, row: number) => {
            const grid = gridRef.current;
            if (!grid) return;
            setCellInfo({ col, row, color: grid.getCell(col, row) });
        },
        []
    );

    // ── Click callback (paint a sample pixel for testing) ─
    const handleCellClick = useCallback(
        (col: number, row: number) => {
            const grid = gridRef.current;
            if (!grid) return;
            // For Phase 1 demo: paint clicked cell green
            grid.setCell(col, row, [0, 255, 0]);
            canvasHandleRef.current?.redraw();
        },
        []
    );

    // ── Toggle grid lines ─────────────────────────────────
    const toggleGrid = useCallback(() => {
        setSettings((prev) => {
            const next = { ...prev, showGrid: !prev.showGrid };
            // Redraw after state update
            setTimeout(() => canvasHandleRef.current?.redraw(), 0);
            return next;
        });
    }, []);

    // ── Clear board ────────────────────────────────────────
    const clearBoard = useCallback(() => {
        gridRef.current?.clear();
        canvasHandleRef.current?.redraw();
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
            />

            {/* HUD overlay — grid info + cell info */}
            <div className="fixed top-4 left-4 z-10 flex flex-col gap-2 rounded-lg bg-black/70 px-4 py-3 text-xs text-white font-mono backdrop-blur-sm select-none pointer-events-auto">
                <div className="text-sm font-semibold tracking-wide text-green-400">
                    LED Board
                </div>
                <div>
                    Grid: {gridDims.cols} × {gridDims.rows} ({gridDims.cols * gridDims.rows} cells)
                </div>
                <div>Cell size: {settings.cellSize}px</div>
                {cellInfo && (
                    <div>
                        Hover: ({cellInfo.col}, {cellInfo.row}){" "}
                        <span
                            className="inline-block h-3 w-3 rounded-sm border border-white/30 align-middle"
                            style={{
                                backgroundColor: `rgb(${cellInfo.color[0]},${cellInfo.color[1]},${cellInfo.color[2]})`,
                            }}
                        />
                    </div>
                )}

                {/* Controls */}
                <div className="mt-2 flex gap-2">
                    <button
                        onClick={toggleGrid}
                        className="rounded bg-white/10 px-2 py-1 text-xs hover:bg-white/20 transition"
                    >
                        {settings.showGrid ? "Hide Grid" : "Show Grid"}
                    </button>
                    <button
                        onClick={clearBoard}
                        className="rounded bg-red-600/60 px-2 py-1 text-xs hover:bg-red-500/80 transition"
                    >
                        Clear
                    </button>
                </div>
                <div className="text-white/40 text-[10px]">Click cells to paint</div>
            </div>
        </>
    );
}
