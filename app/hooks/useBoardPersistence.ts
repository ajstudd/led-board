"use client";

import { useEffect } from "react";
import { RGB } from "../types";

// ── Storage Keys (single source of truth) ─────────────────────────────────────
export const STORAGE_KEY_COLOR          = "tenix-color";
export const STORAGE_KEY_TOOL           = "tenix-tool";
export const STORAGE_KEY_GRID           = "tenix-grid";
export const STORAGE_KEY_SHOW_GRID      = "tenix-showGrid";
export const STORAGE_KEY_EFFECTS        = "tenix-effects";
export const STORAGE_KEY_EFFECT_PRESET  = "tenix-effectPreset";
export const STORAGE_KEY_EFFECT_DISTANCE= "tenix-effectDistance";
export const STORAGE_KEY_EFFECT_SPEED   = "tenix-effectSpeed";
export const STORAGE_KEY_CELL_SIZE      = "tenix-cellSize";

interface UseBoardPersistenceOptions {
    /** Stable callback that writes the current grid to localStorage */
    saveGridToStorage: () => void;
    /** Reactive values — each triggers a localStorage write on change */
    activeColor: RGB;
    activeTool: string;
    showGrid: boolean;
}

/**
 * Handles all localStorage write-on-change effects and the
 * beforeunload / periodic save interval.
 * `saveGridToStorage` is defined in LEDBoard (needs snapshotRef from
 * useBoardActions) and passed in here.
 */
export function useBoardPersistence({
    saveGridToStorage,
    activeColor,
    activeTool,
    showGrid,
}: UseBoardPersistenceOptions) {
    // beforeunload + 5-second periodic save
    useEffect(() => {
        window.addEventListener("beforeunload", saveGridToStorage);
        const id = setInterval(saveGridToStorage, 5000);
        return () => {
            window.removeEventListener("beforeunload", saveGridToStorage);
            clearInterval(id);
        };
    }, [saveGridToStorage]);

    // Reactive saves
    useEffect(() => {
        try { localStorage.setItem(STORAGE_KEY_COLOR, JSON.stringify(activeColor)); } catch { }
    }, [activeColor]);

    useEffect(() => {
        try { localStorage.setItem(STORAGE_KEY_TOOL, activeTool); } catch { }
    }, [activeTool]);

    useEffect(() => {
        try { localStorage.setItem(STORAGE_KEY_SHOW_GRID, String(showGrid)); } catch { }
    }, [showGrid]);
}
