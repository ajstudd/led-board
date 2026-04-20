"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import LEDCanvas, { CanvasHandle } from "./Canvas";
import ControlPanel from "./ControlPanel";
import { DEFAULT_SETTINGS, BoardSettings, RGB, ToolKind } from "../types";
import { getPaletteById } from "../lib/palette";

// Custom Hooks
import { useLayerManager } from "../hooks/useLayerManager";

const STORAGE_KEY_COLOR = "tenix-color";
const STORAGE_KEY_TOOL = "tenix-tool";
const STORAGE_KEY_CELL_SIZE = "tenix-cellSize";

export default function LEDBoardLayered() {
    const canvasHandleRef = useRef<CanvasHandle>(null);

    // ── Core states ───────────────────────────
    const [settings, setSettings] = useState<BoardSettings>(DEFAULT_SETTINGS);
    const [activeTool, setActiveTool] = useState<ToolKind>("draw");
    const [activeColor, setActiveColor] = useState<RGB>([0, 255, 0]);
    const [cellInfo, setCellInfo] = useState<{ col: number; row: number; color: RGB; } | null>(null);
    const [gridDims, setGridDims] = useState<{ cols: number; rows: number }>({ cols: 0, rows: 0 });
    const [activePaletteId, setActivePaletteId] = useState<string | null>(null);

    // Helpers
    const redraw = useCallback(() => {
        canvasHandleRef.current?.redraw();
    }, []);

    const saveGridToStorage = useCallback(() => {
        // We will store the layered state as JSON in a future task if needed.
    }, []);

    // ── Layer Manager ──────────────────────────
    const {
        managerRef: layerManagerRef,
        initManager,
        handleLayerChange,
        pushUndo,
        popUndo,
        canUndo
    } = useLayerManager(redraw, saveGridToStorage);

    // ── Initialise grid on mount ───────────────
    useEffect(() => {
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
        initManager(w, h, cellSize);

        if (layerManagerRef.current) {
            setGridDims({ 
                cols: layerManagerRef.current.cols, 
                rows: layerManagerRef.current.rows 
            });
        }
        
        requestAnimationFrame(redraw);
    }, [initManager, layerManagerRef, redraw]);

    // ── Apply Tool ─────────────────────────────
    const applyTool = useCallback((col: number, row: number) => {
        const manager = layerManagerRef.current;
        if (!manager) return;
        const activeLayer = manager.getActiveLayer();
        if (!activeLayer) return;

        const grid = activeLayer.grid;
        if (!grid.inBounds(col, row)) return;

        let targetColor = activeColor;
        if (activePaletteId) {
            const palette = getPaletteById(activePaletteId);
            if (palette) {
                let bestDist = Infinity;
                for (const pc of palette.colors) {
                    const dr = activeColor[0] - pc[0];
                    const dg = activeColor[1] - pc[1];
                    const db = activeColor[2] - pc[2];
                    const dist = dr * dr + dg * dg + db * db;
                    if (dist < bestDist) {
                        bestDist = dist;
                        targetColor = pc;
                        if (dist === 0) break;
                    }
                }
            }
        }

        switch (activeTool) {
            case "draw":
                grid.setCellColor(col, row, targetColor);
                break;
            case "erase":
                grid.clearPixel(col, row);
                break;
            case "fill":
                grid.floodFill(col, row, targetColor);
                break;
            case "vibe":
                // effect logic handled by gesture/hover
                break;
        }

        redraw();
    }, [activeTool, activeColor, activePaletteId, layerManagerRef, redraw]);

    // ── UI Events ──────────────────────────────
    const handleCellHover = useCallback((col: number, row: number) => {
        const active = layerManagerRef.current?.getActiveLayer();
        setCellInfo({
            col,
            row,
            color: active?.grid.inBounds(col, row) ? active.grid.getCellColor(col, row) : [0,0,0],
        });
    }, [layerManagerRef]);

    const handleCellClick = useCallback((col: number, row: number) => {
        pushUndo();
        applyTool(col, row);
        saveGridToStorage();
    }, [applyTool, pushUndo, saveGridToStorage]);

    const handleCellDragStart = useCallback(() => {
        pushUndo();
    }, [pushUndo]);

    const handleCellDrag = useCallback((col: number, row: number) => {
        applyTool(col, row);
    }, [applyTool]);

    const handleCellDragEnd = useCallback(() => {
        saveGridToStorage();
    }, [saveGridToStorage]);

    const handleGridResize = useCallback((oldCols: number, oldRows: number, newCols: number, newRows: number) => {
        // Handle resizing functionality later
    }, []);

    // Tool changes
    const handleToolChange = useCallback((tool: ToolKind) => setActiveTool(tool), []);
    const handleColorChange = useCallback((color: RGB) => setActiveColor(color), []);
    const toggleGrid = useCallback(() => setSettings(p => ({ ...p, showGrid: !p.showGrid })), []);

    return (
        <main className="relative h-screen w-screen bg-black overflow-hidden select-none">
            <LEDCanvas
                ref={canvasHandleRef}
                layerManagerRef={layerManagerRef}
                settings={settings}
                onCellHover={handleCellHover}
                onCellClick={handleCellClick}
                onCellDragStart={handleCellDragStart}
                onCellDrag={handleCellDrag}
                onCellDragEnd={handleCellDragEnd}
                onGridResize={handleGridResize}
            />

            <ControlPanel
                activeTool={activeTool}
                activeColor={activeColor}
                onToolChange={handleToolChange}
                onColorChange={handleColorChange}
                undoDisabled={!canUndo}
                onUndo={popUndo}
                onClearBoard={() => {}}
                onToggleGrid={toggleGrid}
                gridEnabled={settings.showGrid}
                gridDims={gridDims}
                effectsEnabled={false}
                onToggleEffects={() => {}}
                activeEffectPreset={[] as any}
                onSelectEffectPreset={() => {}}
                effectsDistance={1}
                onEffectsDistanceChange={() => {}}
                effectsSpeed={1}
                onEffectsSpeedChange={() => {}}
                animState={"stopped"}
                onAnimPlay={() => {}}
                onAnimPause={() => {}}
                animFps={15}
                onAnimFpsChange={() => {}}
                animFrame={0}
                onApplyPattern={() => {}}
                onRenderText={() => {}}
                recordingState={"idle"}
                onStartRecording={() => {}}
                onStopRecording={() => {}}
                recFrameCount={0}
                recDuration={0}
                recPlaybackFrame={0}
                onStartPlayback={() => {}}
                onPausePlayback={() => {}}
                onStopPlayback={() => {}}
                loopEnabled={false}
                onToggleLoop={() => {}}
                onExportRecording={() => {}}
                onImportRecording={() => {}}
                onClearRecording={() => {}}
                activePaletteId={activePaletteId}
                onSelectPalette={setActivePaletteId}
                onApplyPaletteToBoard={() => {}}
                layerManager={layerManagerRef.current}
                onLayerChange={handleLayerChange}
            />

            {cellInfo && (
                <div className="absolute bottom-4 right-4 pointer-events-none rounded bg-black/80 px-2 py-1 text-xs font-mono text-white/50 border border-white/10 backdrop-blur-md">
                    {cellInfo.col},{cellInfo.row}
                </div>
            )}
        </main>
    );
}
