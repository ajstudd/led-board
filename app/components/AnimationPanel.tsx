"use client";

import { useState, useCallback } from "react";
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

// Play / Pause / Stop SVG icons
function PlayIcon({ size = 14 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" stroke="none">
            <path d="M4 2.5v11l9-5.5z" />
        </svg>
    );
}

function PauseIcon({ size = 14 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" stroke="none">
            <rect x="3" y="2" width="3.5" height="12" rx="0.5" />
            <rect x="9.5" y="2" width="3.5" height="12" rx="0.5" />
        </svg>
    );
}

function StopIcon({ size = 14 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" stroke="none">
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
    const [expanded, setExpanded] = useState(false);

    const handleSelect = useCallback(
        (anim: AnimationConfig) => {
            onSelectAnimation(anim);
        },
        [onSelectAnimation],
    );

    return (
        <div>
            {/* Toggle button */}
            <button
                onClick={() => setExpanded((v) => !v)}
                className="w-full rounded bg-white/10 px-2 py-2 sm:py-1.5 text-xs hover:bg-white/20 transition text-left min-h-9 sm:min-h-0"
            >
                {expanded ? "▾ Animate Content" : "▸ Animate Content"}
                {animState === "playing" && (
                    <span className="ml-2 text-green-400 animate-pulse">●</span>
                )}
                {animState === "paused" && (
                    <span className="ml-2 text-yellow-400">❚❚</span>
                )}
            </button>

            {expanded && (
                <div className="mt-2 flex flex-col gap-2.5">
                    {/* Hint */}
                    <div className="text-[9px] text-white/40 leading-tight">
                        Draw or type something, then pick an effect below to animate it.
                    </div>

                    {/* Animation list */}
                    <div className="grid grid-cols-2 gap-1.5">
                        {ANIMATIONS.map((anim) => (
                            <button
                                key={anim.name}
                                onClick={() => handleSelect(anim)}
                                className={`rounded px-2 py-1.5 text-[10px] sm:text-[11px] transition text-left truncate min-h-9 sm:min-h-0 ${currentAnim?.name === anim.name
                                    ? "bg-green-500/30 text-green-300 ring-1 ring-green-500/50"
                                    : "bg-white/5 text-white/70 hover:bg-white/10"
                                    }`}
                                title={anim.name}
                            >
                                {anim.name}
                            </button>
                        ))}
                    </div>

                    {/* Playback controls */}
                    {currentAnim && (
                        <>
                            <div className="h-px bg-white/10" />

                            <div className="flex items-center gap-1.5">
                                {/* Play / Pause */}
                                {animState === "playing" ? (
                                    <button
                                        onClick={onPause}
                                        className="flex items-center justify-center rounded bg-yellow-500/30 text-yellow-300 px-2 py-1.5 hover:bg-yellow-500/50 transition min-h-9 sm:min-h-0 min-w-9 sm:min-w-0"
                                        title="Pause"
                                    >
                                        <PauseIcon size={12} />
                                    </button>
                                ) : (
                                    <button
                                        onClick={onPlay}
                                        className="flex items-center justify-center rounded bg-green-500/30 text-green-300 px-2 py-1.5 hover:bg-green-500/50 transition min-h-9 sm:min-h-0 min-w-9 sm:min-w-0"
                                        title="Play"
                                    >
                                        <PlayIcon size={12} />
                                    </button>
                                )}

                                {/* Stop */}
                                <button
                                    onClick={onStop}
                                    className="flex items-center justify-center rounded bg-red-500/30 text-red-300 px-2 py-1.5 hover:bg-red-500/50 transition min-h-9 sm:min-h-0 min-w-9 sm:min-w-0"
                                    title="Stop"
                                >
                                    <StopIcon size={12} />
                                </button>

                                {/* Status */}
                                <span className="ml-auto text-[10px] text-white/40">
                                    {animState === "playing" && (
                                        <span className="text-green-400">Playing</span>
                                    )}
                                    {animState === "paused" && (
                                        <span className="text-yellow-400">Paused</span>
                                    )}
                                    {animState === "stopped" && (
                                        <span className="text-white/30">Stopped</span>
                                    )}
                                    {animState !== "stopped" && (
                                        <span className="ml-1.5 text-white/30">F{frame}</span>
                                    )}
                                </span>
                            </div>

                            {/* FPS slider */}
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] text-white/40 shrink-0">FPS</span>
                                <input
                                    type="range"
                                    min={1}
                                    max={60}
                                    value={fps}
                                    onChange={(e) => onFpsChange(Number(e.target.value))}
                                    className="flex-1 h-1 accent-green-500 cursor-pointer"
                                />
                                <span className="text-[10px] text-white/60 w-6 text-right">
                                    {fps}
                                </span>
                            </div>

                            {/* Current animation name */}
                            <div className="text-[9px] text-white/30">
                                {currentAnim.name} · {fps} fps · Stop to restore your content
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
