"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { GridManager } from "../lib/grid";
import LEDCanvas, { CanvasHandle } from "./Canvas";
import ControlPanel from "./ControlPanel";
import { DEFAULT_SETTINGS, BoardSettings, RGB, ToolKind } from "../types";
import { renderTextCentered } from "../lib/font";

export default function LEDBoard() {
    const gridRef = useRef<GridManager | null>(null);
    const canvasHandleRef = useRef<CanvasHandle>(null);

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

    // ── Apply tool to a cell ─────────────────────────────
    const applyTool = useCallback(
        (col: number, row: number) => {
            const grid = gridRef.current;
            if (!grid) return;

            switch (activeTool) {
                case "draw":
                    grid.setCell(col, row, activeColor);
                    break;
                case "erase":
                    grid.setCell(col, row, settings.backgroundColor);
                    break;
                case "fill":
                    grid.floodFill(col, row, activeColor);
                    break;
            }
            canvasHandleRef.current?.redraw();
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
        gridRef.current?.clear();
        canvasHandleRef.current?.redraw();
    }, []);

    // ── Apply a pattern ───────────────────────────────────
    const handleApplyPattern = useCallback(
        (fn: (cols: number, rows: number, data: Uint8ClampedArray) => void) => {
            const grid = gridRef.current;
            if (!grid) return;
            grid.clear();
            fn(grid.cols, grid.rows, grid.data);
            canvasHandleRef.current?.redraw();
        },
        [],
    );

    // ── Render pixel text ─────────────────────────────────
    const handleRenderText = useCallback(
        (text: string, color: RGB, scale: number = 1) => {
            const grid = gridRef.current;
            if (!grid) return;
            renderTextCentered(text, grid.cols, grid.rows, grid.data, color, scale);
            canvasHandleRef.current?.redraw();
        },
        [],
    );

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
            />
        </>
    );
}
