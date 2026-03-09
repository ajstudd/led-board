"use client";

import { useState, useCallback } from "react";
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

// Small icon per effect for visual flavour
function EffectIcon({ name, size = 14 }: { name: string; size?: number }) {
    switch (name) {
        case "Ripple":
            return (
                <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" opacity={0.7}>
                    <circle cx="8" cy="8" r="2" />
                    <circle cx="8" cy="8" r="4.5" strokeDasharray="2 1.5" />
                    <circle cx="8" cy="8" r="7" strokeDasharray="2 2" />
                </svg>
            );
        case "Wave":
            return (
                <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" opacity={0.7}>
                    <path d="M1 8c2-3 4 3 6 0s4 3 6 0" />
                    <path d="M1 11c2-2 4 2 6 0s4 2 6 0" strokeDasharray="2 1.5" />
                </svg>
            );
        case "Raindrop":
            return (
                <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" opacity={0.7}>
                    <path d="M8 2l-2 4a2.5 2.5 0 105 0z" />
                    <circle cx="8" cy="12" r="1.5" strokeDasharray="1.5 1" />
                    <circle cx="8" cy="12" r="3" strokeDasharray="1.5 1.5" />
                </svg>
            );
        case "Star Burst":
            return (
                <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" opacity={0.7}>
                    <line x1="8" y1="1" x2="8" y2="15" />
                    <line x1="1" y1="8" x2="15" y2="8" />
                    <line x1="3" y1="3" x2="13" y2="13" />
                    <line x1="13" y1="3" x2="3" y2="13" />
                </svg>
            );
        case "Helix":
            return (
                <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" opacity={0.7}>
                    <path d="M8 2c3 0 5 2 4 5s-5 3-4 6" />
                    <path d="M8 14c-3 0-5-2-4-5s5-3 4-6" strokeDasharray="2 1.5" />
                </svg>
            );
        case "Sparkle":
            return (
                <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" opacity={0.7}>
                    <circle cx="4" cy="4" r="1" />
                    <circle cx="11" cy="3" r="0.7" />
                    <circle cx="8" cy="8" r="1.2" />
                    <circle cx="3" cy="11" r="0.6" />
                    <circle cx="12" cy="12" r="0.9" />
                    <circle cx="6" cy="13" r="0.5" />
                </svg>
            );
        case "Firework":
            return (
                <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" opacity={0.7}>
                    <line x1="8" y1="14" x2="8" y2="6" />
                    <line x1="8" y1="6" x2="4" y2="2" />
                    <line x1="8" y1="6" x2="12" y2="2" />
                    <line x1="8" y1="6" x2="3" y2="7" />
                    <line x1="8" y1="6" x2="13" y2="7" />
                    <line x1="8" y1="6" x2="5" y2="4" />
                    <line x1="8" y1="6" x2="11" y2="4" />
                    <circle cx="8" cy="6" r="1" fill="currentColor" />
                </svg>
            );
        case "Vortex":
            return (
                <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" opacity={0.7}>
                    <path d="M8 3c4 0 5 3 3 5s-5 1-3 5" />
                    <path d="M8 3c-4 0-5 3-3 5s5 1 3 5" strokeDasharray="2 1.5" />
                    <circle cx="8" cy="8" r="1.5" fill="currentColor" />
                </svg>
            );
        case "Plasma":
            return (
                <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" opacity={0.6}>
                    <ellipse cx="8" cy="8" rx="5" ry="4" />
                    <ellipse cx="6" cy="7" rx="3" ry="2.5" opacity={0.5} />
                    <ellipse cx="10" cy="9" rx="2.5" ry="2" opacity={0.4} />
                </svg>
            );
        case "Shockwave":
            return (
                <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" opacity={0.7}>
                    <circle cx="8" cy="8" r="3" strokeWidth="2" />
                    <circle cx="8" cy="8" r="6" strokeWidth="1.5" strokeDasharray="3 1.5" />
                    <circle cx="8" cy="8" r="1" fill="currentColor" />
                </svg>
            );
        case "Butterfly":
            return (
                <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" opacity={0.7}>
                    <line x1="8" y1="3" x2="8" y2="13" stroke="currentColor" strokeWidth="1" />
                    <ellipse cx="5.5" cy="6" rx="3" ry="2.5" opacity={0.8} />
                    <ellipse cx="10.5" cy="6" rx="3" ry="2.5" opacity={0.8} />
                    <ellipse cx="6" cy="10.5" rx="2" ry="1.8" opacity={0.5} />
                    <ellipse cx="10" cy="10.5" rx="2" ry="1.8" opacity={0.5} />
                </svg>
            );
        default:
            return (
                <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" opacity={0.7}>
                    <circle cx="8" cy="8" r="5" />
                </svg>
            );
    }
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
    const [expanded, setExpanded] = useState(false);

    const handleSelect = useCallback(
        (preset: EffectPreset) => {
            onSelectPreset(preset);
        },
        [onSelectPreset],
    );

    return (
        <div>
            {/* Section header with toggle */}
            <button
                onClick={() => setExpanded((v) => !v)}
                className="w-full rounded bg-white/10 px-2 py-2 sm:py-1.5 text-xs hover:bg-white/20 transition text-left min-h-9 sm:min-h-0 flex items-center gap-2"
            >
                <span>{expanded ? "▾" : "▸"} Pixel Effects</span>
                {enabled && (
                    <span className="ml-auto text-cyan-400 animate-pulse text-[10px]">● ON</span>
                )}
            </button>

            {expanded && (
                <div className="mt-2 flex flex-col gap-2.5">

                    {/* Enable / Disable toggle */}
                    <div className="flex items-center gap-1.5">
                        <button
                            onClick={onToggle}
                            className="flex-1 flex items-center justify-between px-3 py-2 sm:py-1.5 rounded bg-white/5 hover:bg-white/10 transition min-h-9 sm:min-h-0"
                            role="switch"
                            aria-checked={enabled}
                        >
                            <span className={`text-[11px] font-medium ${enabled ? "text-cyan-300" : "text-white/60"}`}>
                                {enabled ? "✦ Effects On" : "Effects Off"}
                            </span>
                            <span
                                className={`relative inline-flex h-4 w-8 shrink-0 rounded-full transition-colors duration-200 ${enabled ? "bg-cyan-500" : "bg-white/20"}`}
                            >
                                <span
                                    className={`inline-block h-3 w-3 rounded-full bg-white shadow transform transition-transform duration-200 mt-0.5 ${enabled ? "translate-x-4 ml-0.5" : "translate-x-0.5"}`}
                                />
                            </span>
                        </button>
                        <InfoTooltip title="Pixel Effects" width={210}>
                            <p>When enabled, drawing triggers a visual effect at each pixel — like a gaming keyboard.</p>
                            <p className="text-white/40 pt-1">Pick a preset, then draw on the canvas to see it.</p>
                        </InfoTooltip>
                    </div>

                    {/* Effect presets grid */}
                    {enabled && (
                        <>
                            <div className="text-[10px] text-white/40 uppercase tracking-widest">
                                Choose Effect
                            </div>
                            <div className="grid grid-cols-2 gap-1.5">
                                {EFFECT_PRESETS.map((preset) => (
                                    <button
                                        key={preset.name}
                                        onClick={() => handleSelect(preset)}
                                        className={`rounded px-2 py-1.5 text-[10px] sm:text-[11px] transition text-left truncate min-h-9 sm:min-h-0 flex items-center gap-1.5 ${activePreset.name === preset.name
                                            ? "bg-cyan-500/30 text-cyan-300 ring-1 ring-cyan-500/50"
                                            : "bg-white/5 text-white/70 hover:bg-white/10"
                                            }`}
                                        title={preset.name}
                                    >
                                        <EffectIcon name={preset.name} size={12} />
                                        <span className="truncate">{preset.name}</span>
                                    </button>
                                ))}
                            </div>

                            {/* Distance slider */}
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] text-white/40 shrink-0 w-12">Distance</span>
                                <input
                                    type="range"
                                    min={20}
                                    max={1000}
                                    value={Math.round(distanceMultiplier * 100)}
                                    onChange={(e) => onDistanceChange(Number(e.target.value) / 100)}
                                    className="flex-1 min-w-0 h-1 accent-cyan-500 cursor-pointer"
                                />
                                <span className="text-[10px] text-white/60 w-8 text-right shrink-0">
                                    {distanceMultiplier.toFixed(1)}x
                                </span>
                            </div>

                            {/* Speed slider */}
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] text-white/40 shrink-0 w-12">Speed</span>
                                <input
                                    type="range"
                                    min={20}
                                    max={500}
                                    value={Math.round(speedMultiplier * 100)}
                                    onChange={(e) => onSpeedChange(Number(e.target.value) / 100)}
                                    className="flex-1 min-w-0 h-1 accent-cyan-500 cursor-pointer"
                                />
                                <span className="text-[10px] text-white/60 w-8 text-right shrink-0">
                                    {speedMultiplier.toFixed(1)}x
                                </span>
                            </div>

                        </>
                    )}
                </div>
            )}
        </div>
    );
}
