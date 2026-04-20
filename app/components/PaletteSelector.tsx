"use client";

import { useState, useMemo, useCallback } from "react";
import InfoTooltip from "./InfoTooltip";
import {
  getAllPalettes,
  addCustomPalette,
  deleteCustomPalette,
} from "../lib/palette";
import type { RGB } from "../types";

interface PaletteSelectorProps {
  activePaletteId: string | null;
  onSelectPalette: (id: string | null) => void;
  activeColor: RGB;
  onApplyPaletteToBoard?: () => void;
}

export default function PaletteSelector({
  activePaletteId,
  onSelectPalette,
  activeColor,
  onApplyPaletteToBoard,
}: PaletteSelectorProps) {
  const [refreshKey, setRefreshKey] = useState(0);
  const palettes = useMemo(() => getAllPalettes(), [refreshKey]);

  // ── "Create Custom Set" state ──
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColors, setNewColors] = useState<RGB[]>([]);

  const handleAddColor = useCallback(() => {
    setNewColors((prev) => [...prev, [...activeColor] as RGB]);
  }, [activeColor]);

  const handleRemoveColor = useCallback((idx: number) => {
    setNewColors((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const handleSaveSet = useCallback(() => {
    const trimmed = newName.trim();
    if (!trimmed || newColors.length === 0) return;
    const created = addCustomPalette(trimmed, newColors);
    setCreating(false);
    setNewName("");
    setNewColors([]);
    setRefreshKey((k) => k + 1);
    onSelectPalette(created.id);
  }, [newName, newColors, onSelectPalette]);

  const handleDeletePalette = useCallback(
    (id: string) => {
      deleteCustomPalette(id);
      if (activePaletteId === id) onSelectPalette(null);
      setRefreshKey((k) => k + 1);
    },
    [activePaletteId, onSelectPalette],
  );

  const handleCancelCreate = useCallback(() => {
    setCreating(false);
    setNewName("");
    setNewColors([]);
  }, []);

  return (
    <div className="flex flex-col gap-1.5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-widest text-white/40">
            Brand Colors
          </span>
          <InfoTooltip title="Brand Color Palettes" width={220}>
            <ul className="flex flex-col gap-1">
              <li>🎨 Restrict your drawing to specific colors</li>
              <li>✨ Patterns and animations will use these colors</li>
              <li>Select &apos;Free Pick&apos; to use any color again</li>
            </ul>
          </InfoTooltip>
        </div>
        {activePaletteId && onApplyPaletteToBoard && (
          <button
            onClick={onApplyPaletteToBoard}
            className="text-[9px] text-green-400 hover:text-green-300 transition px-1.5 py-0.5 rounded bg-green-500/10 border border-green-500/20"
            title="Apply colors to current board"
          >
            Apply to Board
          </button>
        )}
      </div>

      {/* Palette list — names only, no swatches */}
      <div className="flex flex-wrap gap-1">
        {/* Free Pick */}
        <button
          onClick={() => onSelectPalette(null)}
          className={`rounded px-2 py-1 text-[10px] transition ${
            activePaletteId === null
              ? "bg-green-500/30 text-green-300 ring-1 ring-green-500/50"
              : "bg-white/5 text-white/70 hover:bg-white/10"
          }`}
        >
          Free Pick
        </button>

        {palettes.map((palette) => {
          const isActive = activePaletteId === palette.id;
          return (
            <div key={palette.id} className="flex items-center gap-0.5">
              <button
                onClick={() => onSelectPalette(palette.id)}
                className={`rounded px-2 py-1 text-[10px] transition ${
                  isActive
                    ? "bg-green-500/30 text-green-300 ring-1 ring-green-500/50"
                    : "bg-white/5 text-white/70 hover:bg-white/10"
                }`}
              >
                {palette.name}
              </button>
              {/* Delete button for custom palettes */}
              {!palette.isBuiltIn && (
                <button
                  onClick={() => handleDeletePalette(palette.id)}
                  className="text-[9px] text-red-400/50 hover:text-red-400 transition px-0.5"
                  title={`Delete "${palette.name}"`}
                >
                  ×
                </button>
              )}
            </div>
          );
        })}

        {/* Create New Set button */}
        {!creating && (
          <button
            onClick={() => setCreating(true)}
            className="rounded px-2 py-1 text-[10px] text-emerald-400/70 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 transition border border-emerald-500/20 border-dashed"
          >
            ＋ New Set
          </button>
        )}
      </div>

      {/* Create Custom Set form */}
      {creating && (
        <div className="flex flex-col gap-1.5 p-2 rounded bg-white/5 border border-white/10">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Set name..."
            className="w-full rounded bg-black/40 px-2 py-1 text-[11px] text-white border border-white/10 outline-none focus:border-green-500/50 placeholder-white/30"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSaveSet();
              if (e.key === "Escape") handleCancelCreate();
            }}
          />

          {/* Current color preview + add button */}
          <div className="flex items-center gap-1.5">
            <div
              className="w-4 h-4 rounded-sm border border-white/20 shrink-0"
              style={{
                backgroundColor: `rgb(${activeColor[0]},${activeColor[1]},${activeColor[2]})`,
              }}
            />
            <span className="text-[9px] text-white/40 flex-1">
              Current color
            </span>
            <button
              onClick={handleAddColor}
              className="text-[9px] text-green-400 hover:text-green-300 px-1.5 py-0.5 rounded bg-green-500/10 border border-green-500/20 transition"
            >
              + Add
            </button>
          </div>

          {/* Added colors */}
          {newColors.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {newColors.map((c, i) => (
                <div
                  key={i}
                  className="flex items-center gap-0.5 rounded bg-black/30 px-1 py-0.5"
                >
                  <div
                    className="w-3 h-3 rounded-sm border border-white/20"
                    style={{
                      backgroundColor: `rgb(${c[0]},${c[1]},${c[2]})`,
                    }}
                  />
                  <button
                    onClick={() => handleRemoveColor(i)}
                    className="text-[9px] text-red-400/60 hover:text-red-400 transition"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Save / Cancel buttons */}
          <div className="flex gap-1.5">
            <button
              onClick={handleSaveSet}
              disabled={!newName.trim() || newColors.length === 0}
              className={`flex-1 rounded py-1 text-[10px] font-medium transition ${
                newName.trim() && newColors.length > 0
                  ? "bg-green-600/50 text-green-100 hover:bg-green-500/60"
                  : "bg-white/5 text-white/30 cursor-not-allowed"
              }`}
            >
              Save
            </button>
            <button
              onClick={handleCancelCreate}
              className="flex-1 rounded py-1 text-[10px] text-white/50 bg-white/5 hover:bg-white/10 transition"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
