import { useState, useRef, useCallback } from "react";
import { LayerManager } from "../lib/layerManager";

interface LayerUndoSnapshot {
    layerId: string;
    data: Uint8ClampedArray;
}

const MAX_UNDO = 50;

export function useLayerManager(onRedraw: () => void, saveToStorage: () => void) {
    const managerRef = useRef<LayerManager | null>(null);
    const [layerUpdateTick, setLayerUpdateTick] = useState(0); // For forcing UI renders
    
    // Undo stack for layer-specific changes
    const undoStackRef = useRef<LayerUndoSnapshot[]>([]);
    const [canUndo, setCanUndo] = useState(false);

    const initManager = useCallback((viewportWidth: number, viewportHeight: number, cellSize: number) => {
        if (!managerRef.current) {
            managerRef.current = new LayerManager(viewportWidth, viewportHeight, cellSize, onRedraw);
            setLayerUpdateTick(v => v + 1);
        }
    }, [onRedraw]);

    const handleLayerChange = useCallback(() => {
        setLayerUpdateTick(v => v + 1);
        onRedraw();
        saveToStorage();
    }, [onRedraw, saveToStorage]);

    const pushUndo = useCallback(() => {
        if (!managerRef.current) return;
        const active = managerRef.current.getActiveLayer();
        if (!active) return;

        undoStackRef.current.push({
            layerId: active.id,
            data: active.grid.cloneData()
        });

        if (undoStackRef.current.length > MAX_UNDO) {
            undoStackRef.current.shift();
        }
        setCanUndo(true);
    }, []);

    const popUndo = useCallback(() => {
        if (undoStackRef.current.length === 0 || !managerRef.current) return;
        const snapshot = undoStackRef.current.pop()!;
        
        const layer = managerRef.current.layers.find(l => l.id === snapshot.layerId);
        if (layer) {
            layer.grid.loadData(snapshot.data);
            handleLayerChange();
        }
        setCanUndo(undoStackRef.current.length > 0);
    }, [handleLayerChange]);

    const clearUndo = useCallback(() => {
        undoStackRef.current = [];
        setCanUndo(false);
    }, []);

    return {
        managerRef,
        layerUpdateTick,
        initManager,
        handleLayerChange,
        pushUndo,
        popUndo,
        clearUndo,
        canUndo,
        undoStackRef
    };
}
