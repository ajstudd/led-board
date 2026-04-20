"use client";

import {
    useRef,
    useEffect,
    useCallback,
    useState,
    forwardRef,
    useImperativeHandle,
} from "react";
import { LayerManager } from "../lib/layerManager";
import { DEFAULT_SETTINGS, BoardSettings } from "../types";

export interface CanvasHandle {
    redraw: () => void;
    getCanvas: () => HTMLCanvasElement | null;
}

interface CanvasProps {
    layerManagerRef: React.RefObject<LayerManager | null>;
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
        layerManagerRef,
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

    // Offscreen buffers for fast ImageData-based rendering
    const cellCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const effectsCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const gridLinesCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const gridLinesDimsRef = useRef<{ cols: number; rows: number; cellSize: number; show: boolean } | null>(null);

    // ── Draw the grid onto the canvas (ImageData fast-path) ──
    const drawGrid = useCallback(() => {
        const canvas = canvasRef.current;
        const layerManager = layerManagerRef.current;
        if (!canvas || !layerManager) return;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        // Use the active layer's dimensions for rendering (they all share the same dimension)
        const activeLayer = layerManager.getActiveLayer();
        if (!activeLayer) return;
        const { cols, rows, cellSize } = activeLayer.grid.dimensions;
        
        // Composite all visible layers into a single pixel array
        const data = layerManager.composite();
        const bg = settings.backgroundColor;

        // -- 1. Ensure offscreen cell canvas is the right size --
        let cellCanvas = cellCanvasRef.current;
        if (!cellCanvas || cellCanvas.width !== cols || cellCanvas.height !== rows) {
            cellCanvas = document.createElement("canvas");
            cellCanvas.width = cols;
            cellCanvas.height = rows;
            cellCanvasRef.current = cellCanvas;
        }
        const cellCtx = cellCanvas.getContext("2d", { willReadFrequently: true })!;
        const imgData = cellCtx.createImageData(cols, rows);
        const px = imgData.data; // Uint8ClampedArray RGBA

        // -- 2. Convert RGB grid data -> RGBA ImageData (single pass) --
        for (let i = 0, j = 0, n = cols * rows; i < n; i++, j += 4) {
            const si = i * 3;
            const r = data[si];
            const g = data[si + 1];
            const b = data[si + 2];
            if (r === 0 && g === 0 && b === 0) {
                px[j] = bg[0];
                px[j + 1] = bg[1];
                px[j + 2] = bg[2];
            } else {
                px[j] = r;
                px[j + 1] = g;
                px[j + 2] = b;
            }
            px[j + 3] = 255;
        }
        cellCtx.putImageData(imgData, 0, 0);

        // -- 3. Draw scaled-up cell canvas with nearest-neighbor --
        ctx.imageSmoothingEnabled = false;
        const dw = cols * cellSize;
        const dh = rows * cellSize;
        ctx.drawImage(cellCanvas, 0, 0, dw, dh);

        // Fill any remaining space (right / bottom edges beyond the grid)
        const cw = canvas.width;
        const ch = canvas.height;
        if (dw < cw || dh < ch) {
            ctx.fillStyle = `rgb(${bg[0]},${bg[1]},${bg[2]})`;
            if (dw < cw) ctx.fillRect(dw, 0, cw - dw, ch);
            if (dh < ch) ctx.fillRect(0, dh, dw, ch - dh);
        }

        // -- 4. Grid lines (cached in offscreen canvas) --
        if (settings.showGrid) {
            const dims = gridLinesDimsRef.current;
            if (
                !gridLinesCanvasRef.current ||
                !dims ||
                dims.cols !== cols ||
                dims.rows !== rows ||
                dims.cellSize !== cellSize ||
                dims.show !== true
            ) {
                const glCanvas = document.createElement("canvas");
                glCanvas.width = dw;
                glCanvas.height = dh;
                const glCtx = glCanvas.getContext("2d")!;
                const gc = settings.gridColor;
                glCtx.strokeStyle = `rgba(${gc[0]},${gc[1]},${gc[2]},0.3)`;
                glCtx.lineWidth = 0.5;
                glCtx.beginPath();
                for (let c = 0; c <= cols; c++) {
                    const x = c * cellSize;
                    glCtx.moveTo(x, 0);
                    glCtx.lineTo(x, dh);
                }
                for (let r = 0; r <= rows; r++) {
                    const y = r * cellSize;
                    glCtx.moveTo(0, y);
                    glCtx.lineTo(dw, y);
                }
                glCtx.stroke();
                gridLinesCanvasRef.current = glCanvas;
                gridLinesDimsRef.current = { cols, rows, cellSize, show: true };
            }
            ctx.drawImage(gridLinesCanvasRef.current, 0, 0);
        } else {
            gridLinesDimsRef.current = null;
        }

        // -- 5. Effects overlay (ImageData fast-path, additive blend) --
        const overlay = layerManager.compositeEffectsOverlay();
        if (overlay?.buffer && overlay.cols > 0) {
            let eCanvas = effectsCanvasRef.current;
            if (!eCanvas || eCanvas.width !== overlay.cols || eCanvas.height !== overlay.rows) {
                eCanvas = document.createElement("canvas");
                eCanvas.width = overlay.cols;
                eCanvas.height = overlay.rows;
                effectsCanvasRef.current = eCanvas;
            }
            const eCtx = eCanvas.getContext("2d", { willReadFrequently: true })!;
            const eImg = eCtx.createImageData(overlay.cols, overlay.rows);
            eImg.data.set(overlay.buffer); // direct copy — same RGBA layout
            eCtx.putImageData(eImg, 0, 0);

            ctx.globalCompositeOperation = "lighter";
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(eCanvas, 0, 0, dw, dh);
            ctx.globalCompositeOperation = "source-over";
        }
    }, [layerManagerRef, settings]);

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
        const grid = layerManagerRef.current;
        if (!canvas || !grid) return;

        // Capture old dims BEFORE resize
        const oldCols = grid.cols;
        const oldRows = grid.rows;

        const w = window.innerWidth;
        const h = window.innerHeight;

        canvas.width = w;
        canvas.height = h;

        const newCols = Math.floor(w / settings.cellSize);
        const newRows = Math.floor(h / settings.cellSize);

        grid.resizePreserveDims(newCols, newRows);

        // Notify parent so it can resize snapshot / undo stack
        if ((oldCols !== newCols || oldRows !== newRows) && onGridResize) {
            onGridResize(oldCols, oldRows, newCols, newRows);
        }

        // Cancel any pending frame, schedule a new one
        cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(drawGrid);
    }, [layerManagerRef, drawGrid, onGridResize, settings]);

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
            const layerManager = layerManagerRef.current;
            if (!layerManager) return null;
            const grid = layerManager.getActiveLayer()?.grid;
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
        [layerManagerRef]
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
