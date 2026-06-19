import { GridManager } from "./grid";
import { AnimationManager } from "./animation";
import { EffectsEngine, EffectPreset, EffectsOverlay, EFFECT_PRESETS } from "./effects";
import { base64ToUint8 } from "./utils";
import {
    AnimationConfig,
    AnimationRuntimeContext,
    SerializedLayerState,
    LayerBlendMode,
} from "../types";

function normalizeCellCount(value: number): number {
    return Number.isFinite(value) ? Math.max(1, Math.floor(value)) : 1;
}

// ── Per-layer animation state ────────────────────────────

export interface LayerAnimationState extends AnimationRuntimeContext {
    manager: AnimationManager;
    currentAnim: AnimationConfig | null;
    fps: number;
    frame: number;
}

// ── Per-layer effects state ──────────────────────────────

export interface LayerEffectsState {
    engine: EffectsEngine;
    enabled: boolean;
    preset: EffectPreset;
    distanceMultiplier: number;
    speedMultiplier: number;
    overlay: EffectsOverlay;
}

// ── Layer interface ──────────────────────────────────────

export interface Layer {
    id: string;
    name: string;
    visible: boolean;
    opacity: number; // 0 to 1
    blendMode: LayerBlendMode; // simple blend modes
    grid: GridManager;
    /** Per-layer animation (one AnimationManager per layer) */
    animation: LayerAnimationState;
    /** Per-layer effects (one EffectsEngine per layer) */
    effects: LayerEffectsState;
}

export class LayerManager {
    layers: Layer[] = [];
    activeLayerId: string | null = null;
    cols: number;
    rows: number;
    cellSize: number;
    private nextLayerId = 1;
    private _redraw: () => void;

    constructor(viewportWidth: number, viewportHeight: number, cellSize: number, redraw?: () => void) {
        const temp = new GridManager(viewportWidth, viewportHeight, cellSize);
        this.cols = temp.cols;
        this.rows = temp.rows;
        this.cellSize = temp.cellSize;
        this._redraw = redraw || (() => {});
        this.addLayer("Background");
    }

    private generateId(): string {
        return `layer-${this.nextLayerId++}`;
    }

    private createGrid(): GridManager {
        return new GridManager(
            this.cols * this.cellSize,
            this.rows * this.cellSize,
            this.cellSize,
        );
    }

    private hasLayerName(name: string, excludeId?: string): boolean {
        const target = name.trim().toLowerCase();
        return this.layers.some((layer) =>
            layer.id !== excludeId && layer.name.trim().toLowerCase() === target,
        );
    }

    private getNextDefaultLayerName(): string {
        let index = Math.max(2, this.layers.length + 1);
        while (this.hasLayerName(`Layer ${index}`)) {
            index++;
        }
        return `Layer ${index}`;
    }

    private getUniqueLayerName(baseName: string, excludeId?: string): string {
        const trimmed = baseName.trim() || this.getNextDefaultLayerName();
        if (!this.hasLayerName(trimmed, excludeId)) {
            return trimmed;
        }

        let copyIndex = 2;
        let candidate = `${trimmed} ${copyIndex}`;
        while (this.hasLayerName(candidate, excludeId)) {
            copyIndex++;
            candidate = `${trimmed} ${copyIndex}`;
        }
        return candidate;
    }

    private getDuplicateLayerName(name: string): string {
        const base = name.trim() || this.getNextDefaultLayerName();
        const preferred = `${base} Copy`;
        if (!this.hasLayerName(preferred)) {
            return preferred;
        }

        let copyIndex = 2;
        let candidate = `${base} Copy ${copyIndex}`;
        while (this.hasLayerName(candidate)) {
            copyIndex++;
            candidate = `${base} Copy ${copyIndex}`;
        }
        return candidate;
    }

    /** Create a new AnimationManager for a layer */
    private createLayerAnimation(): LayerAnimationState {
        const mgr = new AnimationManager(
            () => this._redraw(),
            () => {}, // state change — LEDBoard handles this via polling
            () => {}, // frame change
        );
        return {
            manager: mgr,
            currentAnim: null,
            snapshot: null,
            marqueeBuffer: null,
            marqueeBufferCols: 0,
            fps: 15,
            frame: 0,
        };
    }

    /** Create a new EffectsEngine for a layer */
    private createLayerEffects(): LayerEffectsState {
        const engine = new EffectsEngine(() => this._redraw());
        engine.updateGrid(this.cols, this.rows);
        return {
            engine,
            enabled: false,
            preset: EFFECT_PRESETS[0],
            distanceMultiplier: 1,
            speedMultiplier: 1,
            overlay: engine.overlay,
        };
    }

    addLayer(name?: string): Layer {
        return this._addLayer(name, this.createGrid());
    }

    addLayerWithGrid(name: string, grid: GridManager): Layer {
        return this._addLayer(name, grid);
    }

    private _addLayer(name: string | undefined, grid: GridManager): Layer {
        const id = this.generateId();
        const layer = this.createLayerRecord(id, this.getUniqueLayerName(name || this.getNextDefaultLayerName()), grid);
        // Add to top of stack
        this.layers.unshift(layer);
        this.activeLayerId = id;
        return layer;
    }

    private createLayerRecord(id: string, name: string, grid: GridManager): Layer {
        return {
            id,
            name,
            visible: true,
            opacity: 1,
            blendMode: "normal",
            grid,
            animation: this.createLayerAnimation(),
            effects: this.createLayerEffects(),
        };
    }

    deleteLayer(id: string) {
        if (this.layers.length <= 1) return; // Must have at least 1 layer
        const idx = this.layers.findIndex(l => l.id === id);
        if (idx !== -1) {
            const layer = this.layers[idx];
            // Clean up per-layer animation/effects
            layer.animation.manager.destroy();
            layer.effects.engine.destroy();
            this.layers.splice(idx, 1);
            if (this.activeLayerId === id) {
                this.activeLayerId = this.layers[0].id;
            }
        }
    }

    duplicateLayer(id: string) {
        const layer = this.layers.find(l => l.id === id);
        if (!layer) return;
        const newGrid = this.createGrid();
        newGrid.loadData(layer.grid.cloneData());
        const newLayer = this._addLayer(this.getDuplicateLayerName(layer.name), newGrid);
        newLayer.visible = layer.visible;
        newLayer.opacity = layer.opacity;
        newLayer.blendMode = layer.blendMode;
        newLayer.effects.enabled = layer.effects.enabled;
        newLayer.effects.preset = layer.effects.preset;
        newLayer.effects.distanceMultiplier = layer.effects.distanceMultiplier;
        newLayer.effects.speedMultiplier = layer.effects.speedMultiplier;
        newLayer.effects.engine.setEnabled(layer.effects.enabled);
        newLayer.effects.engine.setPreset(layer.effects.preset);
        newLayer.effects.engine.setDistanceMultiplier(layer.effects.distanceMultiplier);
        newLayer.effects.engine.setSpeedMultiplier(layer.effects.speedMultiplier);

        // Put it right above the duplicated layer
        this.layers.splice(0, 1); // remove from top 
        const targetIdx = this.layers.findIndex(l => l.id === id);
        this.layers.splice(targetIdx, 0, newLayer);
    }

    moveLayerUp(id: string) {
        const idx = this.layers.findIndex(l => l.id === id);
        if (idx > 0) {
            const temp = this.layers[idx];
            this.layers[idx] = this.layers[idx - 1];
            this.layers[idx - 1] = temp;
        }
    }

    moveLayerDown(id: string) {
        const idx = this.layers.findIndex(l => l.id === id);
        if (idx !== -1 && idx < this.layers.length - 1) {
            const temp = this.layers[idx];
            this.layers[idx] = this.layers[idx + 1];
            this.layers[idx + 1] = temp;
        }
    }

    selectLayer(id: string): boolean {
        if (!this.layers.some((layer) => layer.id === id)) {
            return false;
        }
        this.activeLayerId = id;
        return true;
    }

    getActiveLayer(): Layer | null {
        return this.layers.find(l => l.id === this.activeLayerId) || null;
    }

    pickLayerAt(col: number, row: number): Layer | null {
        for (const layer of this.layers) {
            if (!layer.visible || layer.opacity <= 0 || !layer.grid.inBounds(col, row)) continue;
            const color = layer.grid.getCell(col, row);
            if (color[0] !== 0 || color[1] !== 0 || color[2] !== 0) {
                return layer;
            }
        }
        return null;
    }

    resizePreserveDims(newCols: number, newRows: number) {
        if (this.layers.length === 0) return;
        newCols = normalizeCellCount(newCols);
        newRows = normalizeCellCount(newRows);
        
        // Resize all layer grids and effects engines
        for (const layer of this.layers) {
            layer.grid.resizePreserveDims(newCols, newRows);
            layer.effects.engine.updateGrid(newCols, newRows);
            layer.effects.overlay = layer.effects.engine.overlay;
        }
        
        // Update manager's cached properties
        this.cols = newCols;
        this.rows = newRows;
    }

    resizeCellSize(viewportWidth: number, viewportHeight: number, newCellSize: number) {
        if (this.layers.length === 0) return;

        for (const layer of this.layers) {
            layer.grid.resizeCellSize(viewportWidth, viewportHeight, newCellSize);
        }

        const active = this.getActiveLayer();
        if (!active) return;

        this.cols = active.grid.cols;
        this.rows = active.grid.rows;
        this.cellSize = active.grid.cellSize;

        // Update all effects engines with new dimensions
        for (const layer of this.layers) {
            layer.effects.engine.updateGrid(this.cols, this.rows);
            layer.effects.overlay = layer.effects.engine.overlay;
        }
    }

    clearCanvas() {
        for (const layer of this.layers) {
            layer.animation.manager.stop();
            layer.animation.currentAnim = null;
            layer.animation.snapshot = null;
            layer.animation.marqueeBuffer = null;
            layer.animation.marqueeBufferCols = 0;
            layer.animation.frame = 0;

            layer.effects.engine.clearEffects();
            layer.effects.overlay = layer.effects.engine.overlay;

            layer.grid.clear();
        }
    }

    resetAllLayers() {
        this.clearCanvas();

        for (const layer of this.layers) {
            layer.effects.engine.setEnabled(false);
            layer.effects.enabled = false;
            layer.effects.preset = EFFECT_PRESETS[0];
            layer.effects.distanceMultiplier = 1;
            layer.effects.speedMultiplier = 1;
            layer.effects.engine.setPreset(EFFECT_PRESETS[0]);
            layer.effects.engine.setDistanceMultiplier(1);
            layer.effects.engine.setSpeedMultiplier(1);
            layer.effects.overlay = layer.effects.engine.overlay;

            layer.visible = true;
            layer.opacity = 1;
            layer.blendMode = "normal";
        }
    }

    resetProject() {
        this.destroy();
        this.layers = [];
        this.activeLayerId = null;
        this.nextLayerId = 1;
        this.addLayer("Background");
    }

    restoreSerializedLayers(layers: SerializedLayerState[], activeLayerId: string | null) {
        this.destroy();
        this.layers = [];

        for (const serialized of layers) {
            const grid = this.createGrid();
            const data = base64ToUint8(serialized.data);
            grid.loadData(data);

            const layer = this.createLayerRecord(serialized.id, serialized.name, grid);
            layer.visible = serialized.visible;
            layer.opacity = serialized.opacity;
            layer.blendMode = serialized.blendMode;
            layer.effects.enabled = serialized.effects.enabled;
            layer.effects.preset = EFFECT_PRESETS.find((preset) => preset.name === serialized.effects.presetName) ?? EFFECT_PRESETS[0];
            layer.effects.distanceMultiplier = serialized.effects.distanceMultiplier;
            layer.effects.speedMultiplier = serialized.effects.speedMultiplier;
            layer.effects.engine.setEnabled(serialized.effects.enabled);
            layer.effects.engine.setPreset(layer.effects.preset);
            layer.effects.engine.setDistanceMultiplier(serialized.effects.distanceMultiplier);
            layer.effects.engine.setSpeedMultiplier(serialized.effects.speedMultiplier);
            layer.effects.overlay = layer.effects.engine.overlay;
            this.layers.push(layer);
        }

        this.activeLayerId = activeLayerId && this.layers.some((layer) => layer.id === activeLayerId)
            ? activeLayerId
            : this.layers[0]?.id ?? null;

        const maxNumericId = this.layers.reduce((max, layer) => {
            const match = /layer-(\d+)/.exec(layer.id);
            return match ? Math.max(max, parseInt(match[1], 10)) : max;
        }, 0);
        this.nextLayerId = maxNumericId + 1;
    }

    updateLayerEngines(cols: number, rows: number) {
        for (const layer of this.layers) {
            layer.animation.manager.updateGrid(cols, rows, layer.grid.data);
            layer.effects.engine.updateGrid(cols, rows);
            layer.effects.overlay = layer.effects.engine.overlay;
        }
    }

    /** Destroy all per-layer engines (call on unmount) */
    destroy() {
        for (const layer of this.layers) {
            layer.animation.manager.destroy();
            layer.effects.engine.destroy();
        }
    }

    // Flatten all visible layers into a single buffer using their blend modes and opacities
    composite(targetBuffer?: Uint8ClampedArray): Uint8ClampedArray {
        const out = targetBuffer || new Uint8ClampedArray(this.cols * this.rows * 3);
        out.fill(0);

        // Render from bottom to top; layer 0 in array is TOP layer.
        // So we iterate backwards.
        for (let i = this.layers.length - 1; i >= 0; i--) {
            const layer = this.layers[i];
            if (!layer.visible) continue;

            const len = out.length;
            const src = layer.grid.data;
            const op = layer.opacity;

            if (op === 1 && layer.blendMode === "normal") {
                for (let j = 0; j < len; j += 3) {
                    if (src[j] !== 0 || src[j+1] !== 0 || src[j+2] !== 0) {
                        out[j] = src[j];
                        out[j+1] = src[j+1];
                        out[j+2] = src[j+2];
                    }
                }
            } else {
                for (let j = 0; j < len; j += 3) {
                    const r = src[j];
                    const g = src[j+1];
                    const b = src[j+2];
                    if (r === 0 && g === 0 && b === 0) continue;

                    if (layer.blendMode === "normal") {
                        out[j] = Math.min(255, out[j] * (1 - op) + r * op);
                        out[j+1] = Math.min(255, out[j+1] * (1 - op) + g * op);
                        out[j+2] = Math.min(255, out[j+2] * (1 - op) + b * op);
                    } else if (layer.blendMode === "add") {
                        out[j] = Math.min(255, out[j] + r * op);
                        out[j+1] = Math.min(255, out[j+1] + g * op);
                        out[j+2] = Math.min(255, out[j+2] + b * op);
                    } else if (layer.blendMode === "multiply") {
                        out[j] = Math.min(255, (out[j] * (r * op)) / 255);
                        out[j+1] = Math.min(255, (out[j+1] * (g * op)) / 255);
                        out[j+2] = Math.min(255, (out[j+2] * (b * op)) / 255);
                    }
                }
            }
        }
        return out;
    }

    /**
     * Composite all visible layers' effects overlays into a single RGBA overlay.
     * Each layer's effects only affect that layer's pixels.
     */
    compositeEffectsOverlay(): EffectsOverlay {
        const len = this.cols * this.rows;
        const out = new Uint8ClampedArray(len * 4);

        for (let i = this.layers.length - 1; i >= 0; i--) {
            const layer = this.layers[i];
            if (!layer.visible || !layer.effects.enabled) continue;
            const ov = layer.effects.engine.overlay;
            if (!ov.buffer || ov.cols === 0) continue;

            const buf = ov.buffer;
            for (let j = 0; j < len * 4; j += 4) {
                const a = buf[j + 3];
                if (a === 0) continue;
                // Additive blend for effect overlays
                out[j]     = Math.min(255, out[j]     + buf[j]);
                out[j + 1] = Math.min(255, out[j + 1] + buf[j + 1]);
                out[j + 2] = Math.min(255, out[j + 2] + buf[j + 2]);
                out[j + 3] = Math.min(255, out[j + 3] + a);
            }
        }

        return { buffer: out, cols: this.cols, rows: this.rows };
    }
}
