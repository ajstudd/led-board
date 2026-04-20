"use client";

import { useCallback } from "react";
import { AnimationConfig } from "../types";
import { AnimationState } from "../lib/animation";
import { ANIMATIONS } from "../lib/animations";

interface AnimationPanelProps {
    animState: AnimationState;
    currentAnim: AnimationConfig | null;
    fps: number;
    frame: number;
    onSelectAnimation: (anim: AnimationConfig) => void;
    onPlay: () => void;
    onPause: () => void;
    onStop: () => void;
    onFpsChange: (fps: number) => void;
}

function PlayIcon({ size = 14 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor">
            <path d="M4 2.5v11l9-5.5z" />
        </svg>
    );
}

function PauseIcon({ size = 14 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor">
            <rect x="3" y="2" width="3.5" height="12" rx="0.5" />
            <rect x="9.5" y="2" width="3.5" height="12" rx="0.5" />
        </svg>
    );
}

function StopIcon({ size = 14 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor">
            <rect x="3" y="3" width="10" height="10" rx="1" />
        </svg>
    );
}

export default function AnimationPanel({
    animState,
    currentAnim,
    fps,
    frame,
    onSelectAnimation,
    onPlay,
    onPause,
    onStop,
    onFpsChange,
}: AnimationPanelProps) {
    const handleSelect = useCallback((anim: AnimationConfig) => {
        onSelectAnimation(anim);
    }, [onSelectAnimation]);

    return (
        <div className="flex flex-col gap-2.5">
            <div className="text-[9px] leading-relaxed text-white/45">
                Pick an animation for the active layer. It runs independently from the other visible layers.
            </div>

            <div className="grid grid-cols-2 gap-1.5">
                {ANIMATIONS.map((anim) => (
                    <button
                        key={anim.name}
                        onClick={() => handleSelect(anim)}
                        className={`rounded-md border px-2 py-1.5 text-left text-[10px] transition ${currentAnim?.name === anim.name
                            ? "border-emerald-400/35 bg-emerald-500/18 text-emerald-200"
                            : "border-white/8 bg-white/[0.04] text-white/72 hover:border-white/15 hover:bg-white/[0.08]"
                            }`}
                        title={anim.name}
                    >
                        {anim.name}
                    </button>
                ))}
            </div>

            {currentAnim && (
                <>
                    <div className="h-px bg-white/10" />

                    <div className="flex items-center gap-1.5">
                        {animState === "playing" ? (
                            <button
                                onClick={onPause}
                                className="flex min-w-9 items-center justify-center rounded-md bg-amber-500/20 px-2 py-1.5 text-amber-200 transition hover:bg-amber-500/35"
                                title="Pause"
                            >
                                <PauseIcon size={12} />
                            </button>
                        ) : (
                            <button
                                onClick={onPlay}
                                className="flex min-w-9 items-center justify-center rounded-md bg-emerald-500/20 px-2 py-1.5 text-emerald-200 transition hover:bg-emerald-500/35"
                                title="Play"
                            >
                                <PlayIcon size={12} />
                            </button>
                        )}

                        <button
                            onClick={onStop}
                            className="flex min-w-9 items-center justify-center rounded-md bg-red-500/20 px-2 py-1.5 text-red-200 transition hover:bg-red-500/35"
                            title="Stop"
                        >
                            <StopIcon size={12} />
                        </button>

                        <span className="ml-auto text-[10px] text-white/40">
                            {animState === "playing" && <span className="text-emerald-300">Playing</span>}
                            {animState === "paused" && <span className="text-amber-300">Paused</span>}
                            {animState === "stopped" && <span>Stopped</span>}
                            {animState !== "stopped" && <span className="ml-1.5 text-white/28">F{frame}</span>}
                        </span>
                    </div>

                    <div className="flex items-center gap-2">
                        <span className="shrink-0 text-[10px] text-white/40">FPS</span>
                        <input
                            type="range"
                            min={1}
                            max={60}
                            value={fps}
                            onChange={(e) => onFpsChange(Number(e.target.value))}
                            className="h-1 min-w-0 flex-1 cursor-pointer accent-emerald-500"
                        />
                        <span className="w-6 shrink-0 text-right text-[10px] text-white/60">{fps}</span>
                    </div>

                    <div className="text-[9px] text-white/32">
                        {currentAnim.name} active on the selected layer.
                    </div>
                </>
            )}
        </div>
    );
}
