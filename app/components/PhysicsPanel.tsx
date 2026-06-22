"use client";

import { useState } from "react";
import type { PresetName } from "../lib/physics/presets";
import InfoTooltip from "./InfoTooltip";

interface PhysicsPanelProps {
    enabled: boolean;
    preset: PresetName | null;
    gravity: number;
    bounce: number;
    onToggle: () => void;
    onApplyPreset: (name: PresetName) => void;
    onGravityChange: (v: number) => void;
    onBounceChange: (v: number) => void;
    onReset: () => void;
    onBake: (frames: number) => void;
}

const PRESETS: { name: PresetName; label: string }[] = [
    { name: "explode", label: "Explode" },
    { name: "gravityDrop", label: "Gravity Drop" },
    { name: "fountain", label: "Fountain" },
    { name: "scatter", label: "Scatter" },
    { name: "swirl", label: "Swirl" },
    { name: "magnet", label: "Magnet" },
    { name: "breeze", label: "Breeze" },
    { name: "antigravity", label: "Anti-Gravity" },
];

export default function PhysicsPanel({
    enabled,
    preset,
    gravity,
    bounce,
    onToggle,
    onApplyPreset,
    onGravityChange,
    onBounceChange,
    onReset,
    onBake,
}: PhysicsPanelProps) {
    const [bakeFrames, setBakeFrames] = useState(90);
    return (
        <div className="flex flex-col gap-2.5">
            <div className="flex items-center gap-1.5">
                <button
                    onClick={onToggle}
                    className="flex flex-1 items-center justify-between rounded-xl border border-amber-400/18 bg-amber-500/[0.06] px-3 py-2 transition hover:bg-amber-500/[0.11]"
                    role="switch"
                    aria-checked={enabled}
                >
                    <span className={`text-[11px] font-medium ${enabled ? "text-amber-200" : "text-white/60"}`}>
                        {enabled ? "Physics Enabled" : "Physics Disabled"}
                    </span>
                    <span className={`relative inline-flex h-4 w-8 rounded-full transition-colors ${enabled ? "bg-amber-500" : "bg-white/16"}`}>
                        <span
                            className={`mt-0.5 inline-block h-3 w-3 rounded-full bg-white shadow transition-transform ${enabled ? "translate-x-4 ml-0.5" : "translate-x-0.5"}`}
                        />
                    </span>
                </button>
                <InfoTooltip title="Pixel Physics" width={220}>
                    <p>Turns the selected layer&apos;s pixels into particles that obey gravity, collisions and forces.</p>
                    <p className="pt-1 text-white/40">Pick a preset to launch an effect; Reset restores your drawing and replays it.</p>
                </InfoTooltip>
            </div>

            {enabled && (
                <>
                    <div className="grid grid-cols-2 gap-1.5">
                        {PRESETS.map((p) => (
                            <button
                                key={p.name}
                                onClick={() => onApplyPreset(p.name)}
                                className={`rounded-md border px-2 py-1.5 text-left text-[10px] transition ${preset === p.name
                                    ? "border-amber-400/35 bg-amber-500/18 text-amber-200"
                                    : "border-white/8 bg-white/[0.04] text-white/72 hover:border-white/15 hover:bg-white/[0.08]"
                                    }`}
                                title={p.label}
                            >
                                {p.label}
                            </button>
                        ))}
                    </div>

                    <div className="flex items-center gap-2">
                        <span className="w-12 shrink-0 text-[10px] text-white/40">Gravity</span>
                        <input
                            type="range"
                            min={-60}
                            max={120}
                            value={Math.round(gravity)}
                            onChange={(e) => onGravityChange(Number(e.target.value))}
                            className="h-1 min-w-0 flex-1 cursor-pointer accent-amber-500"
                        />
                        <span className="w-8 shrink-0 text-right text-[10px] text-white/60">{Math.round(gravity)}</span>
                    </div>

                    <div className="flex items-center gap-2">
                        <span className="w-12 shrink-0 text-[10px] text-white/40">Bounce</span>
                        <input
                            type="range"
                            min={0}
                            max={100}
                            value={Math.round(bounce * 100)}
                            onChange={(e) => onBounceChange(Number(e.target.value) / 100)}
                            className="h-1 min-w-0 flex-1 cursor-pointer accent-amber-500"
                        />
                        <span className="w-8 shrink-0 text-right text-[10px] text-white/60">{bounce.toFixed(2)}</span>
                    </div>

                    <button
                        onClick={onReset}
                        className="rounded-md border border-white/8 bg-white/[0.04] px-2 py-1.5 text-[10px] text-white/72 transition hover:border-white/15 hover:bg-white/[0.08]"
                    >
                        ↺ Reset to Drawing
                    </button>

                    <div className="h-px bg-white/10" />

                    <div className="flex items-center gap-2">
                        <span className="w-12 shrink-0 text-[10px] text-white/40">Frames</span>
                        <input
                            type="range"
                            min={15}
                            max={240}
                            step={15}
                            value={bakeFrames}
                            onChange={(e) => setBakeFrames(Number(e.target.value))}
                            className="h-1 min-w-0 flex-1 cursor-pointer accent-amber-500"
                        />
                        <span className="w-8 shrink-0 text-right text-[10px] text-white/60">{bakeFrames}</span>
                    </div>
                    <button
                        onClick={() => onBake(bakeFrames)}
                        className="rounded-md border border-amber-400/30 bg-amber-500/14 px-2 py-1.5 text-[10px] font-medium text-amber-200 transition hover:bg-amber-500/22"
                        title="Freeze the simulation into a looping animation you can play, record and export"
                    >
                        ⤓ Bake to Animation ({(bakeFrames / 30).toFixed(1)}s)
                    </button>

                    <p className="text-[9px] leading-snug text-white/35">
                        Tip: export this simulation as GIF/WebM from the <span className="text-white/55">Session &amp; Rendering › Export</span> section (set Source to “Simulation”).
                    </p>
                </>
            )}
        </div>
    );
}
