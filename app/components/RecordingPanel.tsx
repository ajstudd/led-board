"use client";

import { useRef, useCallback } from "react";
import { RecordingState } from "../lib/sessionRecorder";
import { RecordingMode } from "../lib/actionRecorder";

interface RecordingPanelProps {
    recordingMode: RecordingMode;
    recordingState: RecordingState;
    hasRecording: boolean;
    frameCount: number;
    duration: number;
    playbackFrame: number;
    loopEnabled: boolean;
    onRecordingModeChange: (mode: RecordingMode) => void;
    onToggleLoop: () => void;
    onStartRecording: () => void;
    onStopRecording: () => void;
    onStartPlayback: () => void;
    onPausePlayback: () => void;
    onStopPlayback: () => void;
    onExportRecording: () => void;
    onImportRecording: (file: File) => void;
    onClearRecording: () => void;
}

function formatDuration(ms: number): string {
    const secs = Math.floor(ms / 1000);
    const mins = Math.floor(secs / 60);
    const seconds = secs % 60;
    if (mins > 0) return `${mins}:${String(seconds).padStart(2, "0")}`;
    return `${seconds}s`;
}

export default function RecordingPanel({
    recordingMode,
    recordingState,
    hasRecording,
    frameCount,
    duration,
    playbackFrame,
    loopEnabled,
    onRecordingModeChange,
    onToggleLoop,
    onStartRecording,
    onStopRecording,
    onStartPlayback,
    onPausePlayback,
    onStopPlayback,
    onExportRecording,
    onImportRecording,
    onClearRecording,
}: RecordingPanelProps) {
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleImportClick = useCallback(() => {
        fileInputRef.current?.click();
    }, []);

    const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            onImportRecording(file);
            e.target.value = "";
        }
    }, [onImportRecording]);

    const isRecording = recordingState === "recording";
    const isPlaying = recordingState === "playing";
    const isPaused = recordingState === "paused";
    const isIdle = recordingState === "idle";
    const modeLocked = isRecording || isPlaying || isPaused;
    const unitLabel = recordingMode === "action" ? "actions" : "frames";
    const playbackLabel = recordingMode === "action" ? "Action" : "Frame";

    return (
        <div className="flex flex-col gap-2.5">
            <div className="flex gap-1.5">
                {(["action", "frame"] as const).map((mode) => (
                    <button
                        key={mode}
                        onClick={() => onRecordingModeChange(mode)}
                        disabled={modeLocked}
                        className={`flex-1 rounded-md px-2.5 py-1.5 text-[10px] uppercase tracking-[0.18em] transition ${
                            recordingMode === mode
                                ? "bg-emerald-500/18 text-emerald-200 ring-1 ring-emerald-400/25"
                                : modeLocked
                                    ? "cursor-not-allowed bg-white/6 text-white/25"
                                    : "bg-white/8 text-white/58 hover:bg-white/14"
                        }`}
                    >
                        {mode}
                    </button>
                ))}
            </div>

            <div className="text-[9px] leading-relaxed text-white/45">
                {recordingMode === "action"
                    ? "Store a layered board snapshot plus timed actions for compact .tenix-rec playback."
                    : "Capture the live composite frame-by-frame. Use this when you need GIF or WebM-ready footage."}
            </div>

            <div className="rounded-xl border border-white/8 bg-white/[0.04] px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] uppercase tracking-[0.18em] text-white/38">
                        {recordingMode === "action" ? "Action State" : "Frame State"}
                    </span>
                    <span className={`text-[10px] ${isRecording
                        ? "text-red-300"
                        : isPlaying
                            ? "text-emerald-300"
                            : isPaused
                                ? "text-amber-300"
                                : "text-white/45"
                        }`}>
                        {isRecording && "Recording"}
                        {isPlaying && "Playing"}
                        {isPaused && "Paused"}
                        {isIdle && (hasRecording ? "Ready" : "Idle")}
                    </span>
                </div>
                <div className="mt-1 text-[10px] text-white/50">
                    {hasRecording
                        ? `${frameCount} ${unitLabel} · ${formatDuration(duration)}`
                        : "No recorded session yet"}
                </div>
                {(isPlaying || isPaused) && (
                    <div className="mt-1 text-[10px] text-white/36">
                        {playbackLabel} {playbackFrame + 1} / {frameCount}
                    </div>
                )}
            </div>

            <div className="flex flex-wrap gap-1.5">
                {isRecording ? (
                    <button
                        onClick={onStopRecording}
                        className="rounded-md bg-red-500/20 px-2.5 py-1.5 text-[10px] text-red-200 transition hover:bg-red-500/35"
                    >
                        Stop Recording
                    </button>
                ) : (
                    <button
                        onClick={onStartRecording}
                        disabled={isPlaying || isPaused}
                        className={`rounded-md px-2.5 py-1.5 text-[10px] transition ${isPlaying || isPaused
                            ? "cursor-not-allowed bg-white/6 text-white/25"
                            : "bg-red-500/18 text-red-200 hover:bg-red-500/30"
                            }`}
                    >
                        Start Recording
                    </button>
                )}

                {hasRecording && !isRecording && (
                    <>
                        {isPlaying ? (
                            <button
                                onClick={onPausePlayback}
                                className="rounded-md bg-amber-500/20 px-2.5 py-1.5 text-[10px] text-amber-200 transition hover:bg-amber-500/35"
                            >
                                Pause
                            </button>
                        ) : (
                            <button
                                onClick={onStartPlayback}
                                className="rounded-md bg-emerald-500/18 px-2.5 py-1.5 text-[10px] text-emerald-200 transition hover:bg-emerald-500/30"
                            >
                                {isPaused ? "Resume" : "Play"}
                            </button>
                        )}

                        {(isPlaying || isPaused) && (
                            <button
                                onClick={onStopPlayback}
                                className="rounded-md bg-white/8 px-2.5 py-1.5 text-[10px] text-white/70 transition hover:bg-white/14"
                            >
                                Stop
                            </button>
                        )}

                        <button
                            onClick={onToggleLoop}
                            className={`rounded-md px-2.5 py-1.5 text-[10px] transition ${loopEnabled
                                ? "bg-emerald-500/18 text-emerald-200 hover:bg-emerald-500/30"
                                : "bg-white/8 text-white/55 hover:bg-white/14"
                                }`}
                        >
                            {loopEnabled ? "Loop On" : "Loop Off"}
                        </button>
                    </>
                )}
            </div>

            {isIdle && (
                <div className="flex flex-wrap gap-1.5">
                    <button
                        onClick={handleImportClick}
                        className="rounded-md bg-white/8 px-2.5 py-1.5 text-[10px] text-white/72 transition hover:bg-white/14"
                    >
                        Import .tenix-rec
                    </button>

                    {hasRecording && (
                        <>
                            <button
                                onClick={onExportRecording}
                                className="rounded-md bg-sky-500/18 px-2.5 py-1.5 text-[10px] text-sky-200 transition hover:bg-sky-500/30"
                            >
                                Export .tenix-rec
                            </button>
                            <button
                                onClick={onClearRecording}
                                className="rounded-md bg-white/8 px-2.5 py-1.5 text-[10px] text-white/55 transition hover:bg-white/14"
                            >
                                Clear Recording
                            </button>
                        </>
                    )}
                </div>
            )}

            <input
                ref={fileInputRef}
                type="file"
                accept=".tenix-rec,application/json"
                onChange={handleFileChange}
                className="hidden"
            />
        </div>
    );
}
