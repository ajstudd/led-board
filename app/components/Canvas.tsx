"use client";

import {
    useRef,
    useEffect,
    useCallback,
    forwardRef,
    useImperativeHandle,
} from "react";
import { GridManager } from "../lib/grid";
import { DEFAULT_SETTINGS, BoardSettings } from "../types";

export interface CanvasHandle {
    redraw: () => void;
    getCanvas: () => HTMLCanvasElement | null;
}

interface CanvasProps {
    gridRef: React.RefObject<GridManager | null>;
    settings?: BoardSettings;
    onCellHover?: (col: number, row: number) => void;
    onCellClick?: (col: number, row: number) => void;
}

const LEDCanvas = forwardRef<CanvasHandle, CanvasProps>(function LEDCanvas(
    { gridRef, settings = DEFAULT_SETTINGS, onCellHover, onCellClick },
    ref
) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const rafRef = useRef<number>(0);

    // ── Draw the grid onto the canvas ─────────────────────
    const drawGrid = useCallback(() => {
        const canvas = canvasRef.current;
        const grid = gridRef.current;
        if (!canvas || !grid) return;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const { cols, rows, cellSize } = grid.dimensions;
        const data = grid.data;

        // Fill background
        const bg = settings.backgroundColor;
        ctx.fillStyle = `rgb(${bg[0]},${bg[1]},${bg[2]})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Draw each cell
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const i = (r * cols + c) * 3;
                const red = data[i];
                const green = data[i + 1];
                const blue = data[i + 2];

                // Skip black cells (same as background) for perf
                if (red === 0 && green === 0 && blue === 0) continue;

                ctx.fillStyle = `rgb(${red},${green},${blue})`;
                ctx.fillRect(c * cellSize, r * cellSize, cellSize, cellSize);
            }
        }

        // Draw grid lines
        if (settings.showGrid) {
            const gc = settings.gridColor;
            ctx.strokeStyle = `rgba(${gc[0]},${gc[1]},${gc[2]},0.3)`;
            ctx.lineWidth = 0.5;

            // Vertical lines
            for (let c = 0; c <= cols; c++) {
                const x = c * cellSize;
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x, rows * cellSize);
                ctx.stroke();
            }

            // Horizontal lines
            for (let r = 0; r <= rows; r++) {
                const y = r * cellSize;
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(cols * cellSize, y);
                ctx.stroke();
            }
        }
    }, [gridRef, settings]);

    // ── Expose redraw & canvas ref to parent ──────────────
    useImperativeHandle(
        ref,
        () => ({
            redraw: drawGrid,
            getCanvas: () => canvasRef.current,
        }),
        [drawGrid]
    );

    // ── Resize handler ────────────────────────────────────
    const handleResize = useCallback(() => {
        const canvas = canvasRef.current;
        const grid = gridRef.current;
        if (!canvas || !grid) return;

        const w = window.innerWidth;
        const h = window.innerHeight;

        canvas.width = w;
        canvas.height = h;

        grid.resizePreserve(w, h);

        // Cancel any pending frame, schedule a new one
        cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(drawGrid);
    }, [gridRef, drawGrid]);

    // ── Setup: initial draw + resize listener ─────────────
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        // Set initial size
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;

        // Initial draw
        drawGrid();

        window.addEventListener("resize", handleResize);
        return () => {
            window.removeEventListener("resize", handleResize);
            cancelAnimationFrame(rafRef.current);
        };
    }, [drawGrid, handleResize]);

    // ── Mouse handlers ────────────────────────────────────
    const cellFromEvent = useCallback(
        (e: React.MouseEvent<HTMLCanvasElement>) => {
            const grid = gridRef.current;
            if (!grid) return null;
            const col = Math.floor(e.clientX / grid.cellSize);
            const row = Math.floor(e.clientY / grid.cellSize);
            if (!grid.inBounds(col, row)) return null;
            return { col, row };
        },
        [gridRef]
    );

    const handleMouseMove = useCallback(
        (e: React.MouseEvent<HTMLCanvasElement>) => {
            const cell = cellFromEvent(e);
            if (cell && onCellHover) onCellHover(cell.col, cell.row);
        },
        [cellFromEvent, onCellHover]
    );

    const handleClick = useCallback(
        (e: React.MouseEvent<HTMLCanvasElement>) => {
            const cell = cellFromEvent(e);
            if (cell && onCellClick) onCellClick(cell.col, cell.row);
        },
        [cellFromEvent, onCellClick]
    );

    return (
        <canvas
            ref={canvasRef}
            className="fixed inset-0 block"
            style={{ cursor: "crosshair" }}
            onMouseMove={handleMouseMove}
            onClick={handleClick}
        />
    );
});

export default LEDCanvas;
