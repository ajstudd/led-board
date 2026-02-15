"use client";

import {
    useRef,
    useEffect,
    useCallback,
    useState,
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
    onCellDragStart?: (col: number, row: number) => void;
    onCellDrag?: (col: number, row: number) => void;
    onCellDragEnd?: () => void;
    onGridResize?: (oldCols: number, oldRows: number, newCols: number, newRows: number) => void;
}

const LEDCanvas = forwardRef<CanvasHandle, CanvasProps>(function LEDCanvas(
    {
        gridRef,
        settings = DEFAULT_SETTINGS,
        onCellHover,
        onCellClick,
        onCellDragStart,
        onCellDrag,
        onCellDragEnd,
        onGridResize,
    },
    ref
) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const rafRef = useRef<number>(0);
    const isDraggingRef = useRef(false);
    const cursorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [cursorHidden, setCursorHidden] = useState(false);

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

        // Capture old dims BEFORE resize
        const oldCols = grid.cols;
        const oldRows = grid.rows;

        const w = window.innerWidth;
        const h = window.innerHeight;

        canvas.width = w;
        canvas.height = h;

        grid.resizePreserve(w, h);

        const newCols = grid.cols;
        const newRows = grid.rows;

        // Notify parent so it can resize snapshot / undo stack
        if ((oldCols !== newCols || oldRows !== newRows) && onGridResize) {
            onGridResize(oldCols, oldRows, newCols, newRows);
        }

        // Cancel any pending frame, schedule a new one
        cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(drawGrid);
    }, [gridRef, drawGrid, onGridResize]);

    // ── Setup: initial draw + resize via ResizeObserver ──
    // ResizeObserver fires after layout reflow — handles window resize,
    // fullscreen toggle, DevTools open/close, etc. reliably.
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        // Set initial size
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;

        // Initial draw
        drawGrid();

        const observer = new ResizeObserver(() => {
            handleResize();
        });
        observer.observe(document.documentElement);

        return () => {
            observer.disconnect();
            cancelAnimationFrame(rafRef.current);
        };
    }, [drawGrid, handleResize]);

    // ── Mouse handlers ────────────────────────────────────
    const cellFromEvent = useCallback(
        (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
            const grid = gridRef.current;
            if (!grid) return null;

            let clientX: number, clientY: number;
            if ("touches" in e) {
                if (e.touches.length === 0) return null;
                clientX = e.touches[0].clientX;
                clientY = e.touches[0].clientY;
            } else {
                clientX = e.clientX;
                clientY = e.clientY;
            }

            const col = Math.floor(clientX / grid.cellSize);
            const row = Math.floor(clientY / grid.cellSize);
            if (!grid.inBounds(col, row)) return null;
            return { col, row };
        },
        [gridRef]
    );

    const handleMouseMove = useCallback(
        (e: React.MouseEvent<HTMLCanvasElement>) => {
            // Reset cursor auto-hide timer
            setCursorHidden(false);
            if (cursorTimerRef.current) clearTimeout(cursorTimerRef.current);
            cursorTimerRef.current = setTimeout(() => setCursorHidden(true), 5000);

            const cell = cellFromEvent(e);
            if (!cell) return;
            if (onCellHover) onCellHover(cell.col, cell.row);
            if (isDraggingRef.current && onCellDrag) {
                onCellDrag(cell.col, cell.row);
            }
        },
        [cellFromEvent, onCellHover, onCellDrag]
    );

    const handleMouseDown = useCallback(
        (e: React.MouseEvent<HTMLCanvasElement>) => {
            if (e.button !== 0) return; // left-click only
            isDraggingRef.current = true;
            const cell = cellFromEvent(e);
            if (cell) {
                if (onCellClick) onCellClick(cell.col, cell.row);
                if (onCellDragStart) onCellDragStart(cell.col, cell.row);
            }
        },
        [cellFromEvent, onCellClick, onCellDragStart]
    );

    const handleMouseUp = useCallback(() => {
        isDraggingRef.current = false;
        if (onCellDragEnd) onCellDragEnd();
    }, [onCellDragEnd]);

    const handleMouseLeave = useCallback(() => {
        isDraggingRef.current = false;
        if (onCellDragEnd) onCellDragEnd();
    }, [onCellDragEnd]);

    // ── Touch handlers (mobile / tablet) ──────────────────
    const handleTouchStart = useCallback(
        (e: React.TouchEvent<HTMLCanvasElement>) => {
            e.preventDefault(); // prevent scroll / zoom while drawing
            isDraggingRef.current = true;
            const cell = cellFromEvent(e);
            if (cell) {
                if (onCellClick) onCellClick(cell.col, cell.row);
                if (onCellDragStart) onCellDragStart(cell.col, cell.row);
            }
        },
        [cellFromEvent, onCellClick, onCellDragStart]
    );

    const handleTouchMove = useCallback(
        (e: React.TouchEvent<HTMLCanvasElement>) => {
            e.preventDefault();
            const cell = cellFromEvent(e);
            if (!cell) return;
            if (onCellHover) onCellHover(cell.col, cell.row);
            if (isDraggingRef.current && onCellDrag) {
                onCellDrag(cell.col, cell.row);
            }
        },
        [cellFromEvent, onCellHover, onCellDrag]
    );

    const handleTouchEnd = useCallback(
        (e: React.TouchEvent<HTMLCanvasElement>) => {
            e.preventDefault();
            isDraggingRef.current = false;
            if (onCellDragEnd) onCellDragEnd();
        },
        [onCellDragEnd]
    );

    return (
        <canvas
            ref={canvasRef}
            className="fixed inset-0 block touch-none"
            style={{ cursor: cursorHidden ? "none" : "crosshair" }}
            onMouseMove={handleMouseMove}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={handleTouchEnd}
        />
    );
});

export default LEDCanvas;
