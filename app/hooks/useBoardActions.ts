"use client";

import { useCallback } from "react";
import { RGB, AnimationConfig } from "../types";
import { renderTextCentered, renderTextToWideBuffer } from "../lib/font";
import { captureSnapshot, setMarqueeBuffer, MARQUEE_ANIMATION } from "../lib/animations";
import { TEXT_ANIMATIONS } from "../lib/textAnimations";
import { strokeRecorder } from "../lib/recorder";
import { getPaletteById } from "../lib/palette";
import { hslToRgb } from "../lib/utils";
import type { LayerManager } from "../lib/layerManager";
import type { AnimationManager } from "../lib/animation";
import type { EffectsEngine } from "../lib/effects";

export type ContentLayer =
    | { type: "pattern"; fn: (cols: number, rows: number, data: Uint8ClampedArray) => void }
    | { type: "text"; text: string; color: RGB; scale: number; wrap: boolean };

interface UseBoardActionsOptions {
    layerManagerRef: React.RefObject<LayerManager | null>;
    animRef: React.RefObject<AnimationManager | null>;
    effectsRef: React.RefObject<EffectsEngine | null>;
    snapshotRef: React.RefObject<Uint8ClampedArray | null>;
    contentLayersRef: React.RefObject<ContentLayer[]>;
    /** Stable ref — avoids circular dep: saveGridToStorage needs snapshotRef */
    saveGridToStorageRef: React.RefObject<() => void>;
    activeTool: string;
    activeColor: RGB;
    backgroundColor: RGB;
    activePaletteId: string | null;
    pushUndo: () => void;
    canvasRedraw: () => void;
    /** Callback so text+animation rendering can update parent anim state */
    onStartAnimation: (config: AnimationConfig) => void;
}

/**
 * Provides applyTool, handleApplyPattern, handleRenderText, replayLayers,
 * and quantizeBuffer. snapshotRef / contentLayersRef are owned by LEDBoard
 * and passed in so TypeScript scoping is clean.
 */
export function useBoardActions({
    layerManagerRef,
    animRef,
    effectsRef,
    snapshotRef,
    contentLayersRef,
    saveGridToStorageRef,
    activeTool,
    activeColor,
    backgroundColor,
    activePaletteId,
    pushUndo,
    canvasRedraw,
    onStartAnimation,
}: UseBoardActionsOptions) {

    // ── Replay content layers into a buffer ──────────────────────────────
    const replayLayers = useCallback(
        (layers: ContentLayer[], cols: number, rows: number, buf: Uint8ClampedArray) => {
            for (const layer of layers) {
                if (layer.type === "pattern") {
                    buf.fill(0);
                    layer.fn(cols, rows, buf);
                } else if (layer.type === "text") {
                    renderTextCentered(layer.text, cols, rows, buf, layer.color, layer.scale, layer.wrap);
                }
            }
        },
        [],
    );

    // ── Snap a buffer's colors to the active palette ─────────────────────
    const quantizeBuffer = useCallback(
        (buffer: Uint8ClampedArray) => {
            if (!activePaletteId) return;
            const palette = getPaletteById(activePaletteId);
            if (!palette) return;
            const len = buffer.length;
            for (let i = 0; i < len; i += 3) {
                const r = buffer[i], g = buffer[i + 1], b = buffer[i + 2];
                if (r === 0 && g === 0 && b === 0) continue;
                let bestDist = Infinity, bestColor = palette.colors[0];
                for (const pc of palette.colors) {
                    const d = (r - pc[0]) ** 2 + (g - pc[1]) ** 2 + (b - pc[2]) ** 2;
                    if (d < bestDist) { bestDist = d; bestColor = pc; if (d === 0) break; }
                }
                buffer[i] = bestColor[0];
                buffer[i + 1] = bestColor[1];
                buffer[i + 2] = bestColor[2];
            }
        },
        [activePaletteId],
    );

    // ── Apply the active tool to a single cell ────────────────────────────
    const applyTool = useCallback(
        (col: number, row: number) => {
            const grid = layerManagerRef.current?.getActiveLayer()?.grid;
            if (!grid) return;

            const snap = snapshotRef.current;

            const isMulti = activeColor[0] === -1;
            let drawColor: RGB = activeColor;
            if (isMulti) {
                const hue = (performance.now() / 10) % 360;
                drawColor = hslToRgb(hue, 100, 50);
            }

            if (snap) {
                const idx = (row * grid.cols + col) * 3;
                switch (activeTool) {
                    case "draw":
                        snap[idx] = drawColor[0];
                        snap[idx + 1] = drawColor[1];
                        snap[idx + 2] = drawColor[2];
                        strokeRecorder.record(col, row, drawColor[0], drawColor[1], drawColor[2]);
                        effectsRef.current?.trigger(col, row, activeColor);
                        break;
                    case "erase":
                        snap[idx] = backgroundColor[0];
                        snap[idx + 1] = backgroundColor[1];
                        snap[idx + 2] = backgroundColor[2];
                        strokeRecorder.record(col, row, backgroundColor[0], backgroundColor[1], backgroundColor[2]);
                        effectsRef.current?.trigger(col, row, activeColor);
                        break;
                    case "fill": {
                        const before = new Uint8ClampedArray(snap);
                        grid.loadData(snap);
                        grid.floodFill(col, row, drawColor);
                        snapshotRef.current = grid.cloneData();
                        captureSnapshot(snapshotRef.current);
                        strokeRecorder.recordBulk(before, snapshotRef.current, grid.cols);
                        break;
                    }
                    case "vibe":
                        effectsRef.current?.trigger(col, row, activeColor);
                        break;
                }
                if (animRef.current?.state !== "playing") {
                    grid.loadData(snapshotRef.current!);
                    canvasRedraw();
                }
            } else {
                switch (activeTool) {
                    case "draw":
                        grid.setCell(col, row, drawColor);
                        strokeRecorder.record(col, row, drawColor[0], drawColor[1], drawColor[2]);
                        effectsRef.current?.trigger(col, row, activeColor);
                        break;
                    case "erase":
                        grid.setCell(col, row, backgroundColor);
                        strokeRecorder.record(col, row, backgroundColor[0], backgroundColor[1], backgroundColor[2]);
                        effectsRef.current?.trigger(col, row, activeColor);
                        break;
                    case "fill": {
                        const before = grid.cloneData();
                        grid.floodFill(col, row, drawColor);
                        strokeRecorder.recordBulk(before, grid.data, grid.cols);
                        break;
                    }
                    case "vibe":
                        effectsRef.current?.trigger(col, row, activeColor);
                        break;
                }
                canvasRedraw();
            }
        },
        [layerManagerRef, animRef, effectsRef, snapshotRef, activeTool, activeColor, backgroundColor, canvasRedraw],
    );

    // ── Apply a procedural pattern ────────────────────────────────────────
    const handleApplyPattern = useCallback(
        (fn: (cols: number, rows: number, data: Uint8ClampedArray) => void) => {
            const grid = layerManagerRef.current?.getActiveLayer()?.grid;
            if (!grid) return;
            pushUndo();

            contentLayersRef.current = [{ type: "pattern", fn }];

            if (snapshotRef.current) {
                const before = new Uint8ClampedArray(snapshotRef.current);
                snapshotRef.current.fill(0);
                fn(grid.cols, grid.rows, snapshotRef.current);
                quantizeBuffer(snapshotRef.current);
                captureSnapshot(snapshotRef.current);
                strokeRecorder.recordBulk(before, snapshotRef.current, grid.cols);
                if (animRef.current?.state !== "playing") {
                    grid.loadData(snapshotRef.current);
                    canvasRedraw();
                }
            } else {
                const before = grid.cloneData();
                grid.clear();
                fn(grid.cols, grid.rows, grid.data);
                quantizeBuffer(grid.data);
                strokeRecorder.recordBulk(before, grid.data, grid.cols);
                canvasRedraw();
            }
            saveGridToStorageRef.current();
        },
        [layerManagerRef, animRef, snapshotRef, contentLayersRef, pushUndo, canvasRedraw, quantizeBuffer, saveGridToStorageRef],
    );

    // ── Render pixel text (optionally animated) ───────────────────────────
    const handleRenderText = useCallback(
        (text: string, color: RGB, scale: number = 1, wrap: boolean = true, animId?: string) => {
            const grid = layerManagerRef.current?.getActiveLayer()?.grid;
            const mgr = animRef.current;
            if (!grid) return;

            // Snap color to active palette
            let targetColor = color;
            if (activePaletteId) {
                const palette = getPaletteById(activePaletteId);
                if (palette) {
                    let bestDist = Infinity;
                    for (const pc of palette.colors) {
                        const d = (color[0] - pc[0]) ** 2 + (color[1] - pc[1]) ** 2 + (color[2] - pc[2]) ** 2;
                        if (d < bestDist) { bestDist = d; targetColor = pc; if (d === 0) break; }
                    }
                }
            }

            pushUndo();

            const patternLayers = contentLayersRef.current.filter(
                (l): l is ContentLayer & { type: "pattern" } => l.type === "pattern",
            );
            contentLayersRef.current = [...patternLayers, { type: "text", text, color: targetColor, scale, wrap }];

            const wantsAnim = animId && animId !== "none";
            const shouldAnimate = wantsAnim && mgr;

            let baseData: Uint8ClampedArray | undefined;
            if (patternLayers.length > 0) {
                baseData = new Uint8ClampedArray(grid.cols * grid.rows * 3);
                for (const layer of patternLayers) {
                    baseData.fill(0);
                    layer.fn(grid.cols, grid.rows, baseData);
                }
            }
            const { buffer, bufferCols } = renderTextToWideBuffer(text, grid.cols, grid.rows, targetColor, scale, baseData);
            setMarqueeBuffer(buffer, bufferCols);

            if (shouldAnimate) {
                const targetAnimId = wantsAnim ? animId : "Text Marquee";
                const animConfig = TEXT_ANIMATIONS.find(a => a.name === targetAnimId) || MARQUEE_ANIMATION;

                if (!snapshotRef.current) snapshotRef.current = grid.cloneData();
                snapshotRef.current.fill(0);
                if (baseData) snapshotRef.current.set(baseData);
                captureSnapshot(snapshotRef.current);

                strokeRecorder.pause();
                mgr.load(animConfig, grid.cols, grid.rows, grid.data);
                onStartAnimation(animConfig);
                mgr.play();
            } else {
                // Stop marquee if running
                if (mgr && mgr.currentAnimation?.name === "Text Marquee") {
                    mgr.stop();
                    if (snapshotRef.current) { grid.loadData(snapshotRef.current); snapshotRef.current = null; }
                    strokeRecorder.resume();
                }

                if (snapshotRef.current) {
                    snapshotRef.current.fill(0);
                    replayLayers(contentLayersRef.current, grid.cols, grid.rows, snapshotRef.current);
                    quantizeBuffer(snapshotRef.current);
                    captureSnapshot(snapshotRef.current);
                    strokeRecorder.recordText(text, grid.cols, grid.rows, targetColor, scale, true);
                    if (animRef.current?.state !== "playing") {
                        grid.loadData(snapshotRef.current);
                        canvasRedraw();
                    }
                } else {
                    grid.clear();
                    replayLayers(contentLayersRef.current, grid.cols, grid.rows, grid.data);
                    quantizeBuffer(grid.data);
                    strokeRecorder.recordText(text, grid.cols, grid.rows, targetColor, scale, true);
                    canvasRedraw();
                }
            }
            saveGridToStorageRef.current();
        },
        [
            layerManagerRef, animRef, snapshotRef, contentLayersRef, activePaletteId, pushUndo, canvasRedraw,
            replayLayers, quantizeBuffer, onStartAnimation, saveGridToStorageRef,
        ],
    );

    return { applyTool, handleApplyPattern, handleRenderText, replayLayers, quantizeBuffer };
}
