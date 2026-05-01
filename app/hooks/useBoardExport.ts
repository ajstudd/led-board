"use client";

import { useCallback } from "react";
import type { LayerManager } from "../lib/layerManager";

interface UseBoardExportOptions {
    layerManagerRef: React.RefObject<LayerManager | null>;
}

/**
 * Wraps the composite grid+effects snapshot used by both the session
 * recorder and the export pipeline.
 */
export function useBoardExport({ layerManagerRef }: UseBoardExportOptions) {
    const getCompositeGridWithEffects = useCallback((): Uint8ClampedArray | null => {
        const manager = layerManagerRef.current;
        if (!manager) return null;

        const raw = manager.composite();
        const overlay = manager.compositeEffectsOverlay();
        if (!overlay.buffer || overlay.cols === 0) return raw;

        const len = manager.cols * manager.rows;
        const out = new Uint8ClampedArray(len * 3);
        const buf = overlay.buffer;

        for (let i = 0, j = 0; i < len; i++, j += 4) {
            const si = i * 3;
            const a = buf[j + 3] / 255;
            out[si]     = Math.min(255, raw[si]     + buf[j]     * a);
            out[si + 1] = Math.min(255, raw[si + 1] + buf[j + 1] * a);
            out[si + 2] = Math.min(255, raw[si + 2] + buf[j + 2] * a);
        }

        return out;
    }, [layerManagerRef]);

    return { getCompositeGridWithEffects };
}
