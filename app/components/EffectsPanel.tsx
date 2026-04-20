"use client";

import { useCallback } from "react";
import { EffectPreset, EFFECT_PRESETS } from "../lib/effects";
import InfoTooltip from "./InfoTooltip";

interface EffectsPanelProps {
    enabled: boolean;
    activePreset: EffectPreset;
    distanceMultiplier: number;
    speedMultiplier: number;
    onToggle: () => void;
    onSelectPreset: (preset: EffectPreset) => void;
    onDistanceChange: (v: number) => void;
    onSpeedChange: (v: number) => void;
}

export default function EffectsPanel({
    enabled,
    activePreset,
    distanceMultiplier,
    speedMultiplier,
    onToggle,
    onSelectPreset,
    onDistanceChange,
    onSpeedChange,
}: EffectsPanelProps) {
    const handleSelect = useCallback((preset: EffectPreset) => {
        onSelectPreset(preset);
    }, [onSelectPreset]);

    return (
        <div className="flex flex-col gap-2.5">
            <div className="flex items-center gap-1.5">
                <button
                    onClick={onToggle}
                    className="flex flex-1 items-center justify-between rounded-xl border border-cyan-400/18 bg-cyan-500/[0.06] px-3 py-2 transition hover:bg-cyan-500/[0.11]"
                    role="switch"
                    aria-checked={enabled}
                >
                    <span className={`text-[11px] font-medium ${enabled ? "text-cyan-200" : "text-white/60"}`}>
                        {enabled ? "Effects Enabled" : "Effects Disabled"}
                    </span>
                    <span className={`relative inline-flex h-4 w-8 rounded-full transition-colors ${enabled ? "bg-cyan-500" : "bg-white/16"}`}>
                        <span
                            className={`mt-0.5 inline-block h-3 w-3 rounded-full bg-white shadow transition-transform ${enabled ? "translate-x-4 ml-0.5" : "translate-x-0.5"}`}
                        />
                    </span>
                </button>
                <InfoTooltip title="Pixel Effects" width={210}>
                    <p>Effects are layer-specific and render on top of that layer&apos;s pixels only.</p>
                    <p className="pt-1 text-white/40">Enable them here, then draw or animate on the selected layer.</p>
                </InfoTooltip>
            </div>

            {enabled && (
                <>
                    <div className="grid grid-cols-2 gap-1.5">
                        {EFFECT_PRESETS.map((preset) => (
                            <button
                                key={preset.name}
                                onClick={() => handleSelect(preset)}
                                className={`rounded-md border px-2 py-1.5 text-left text-[10px] transition ${activePreset.name === preset.name
                                    ? "border-cyan-400/35 bg-cyan-500/18 text-cyan-200"
                                    : "border-white/8 bg-white/[0.04] text-white/72 hover:border-white/15 hover:bg-white/[0.08]"
                                    }`}
                                title={preset.name}
                            >
                                {preset.name}
                            </button>
                        ))}
                    </div>

                    <div className="flex items-center gap-2">
                        <span className="w-12 shrink-0 text-[10px] text-white/40">Distance</span>
                        <input
                            type="range"
                            min={20}
                            max={1000}
                            value={Math.round(distanceMultiplier * 100)}
                            onChange={(e) => onDistanceChange(Number(e.target.value) / 100)}
                            className="h-1 min-w-0 flex-1 cursor-pointer accent-cyan-500"
                        />
                        <span className="w-8 shrink-0 text-right text-[10px] text-white/60">{distanceMultiplier.toFixed(1)}x</span>
                    </div>

                    <div className="flex items-center gap-2">
                        <span className="w-12 shrink-0 text-[10px] text-white/40">Speed</span>
                        <input
                            type="range"
                            min={20}
                            max={500}
                            value={Math.round(speedMultiplier * 100)}
                            onChange={(e) => onSpeedChange(Number(e.target.value) / 100)}
                            className="h-1 min-w-0 flex-1 cursor-pointer accent-cyan-500"
                        />
                        <span className="w-8 shrink-0 text-right text-[10px] text-white/60">{speedMultiplier.toFixed(1)}x</span>
                    </div>
                </>
            )}
        </div>
    );
}
