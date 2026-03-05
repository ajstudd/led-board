"use client";

import { useState, useRef, useCallback } from "react";
import { RecordingState } from "../lib/sessionRecorder";

interface RecordingPanelProps {
    recordingState: RecordingState;
    hasRecording: boolean;
    frameCount: number;
    duration: number;
    playbackFrame: number;
    onStartRecording: () => void;
    onStopRecording: () => void;
    onStartPlayback: () => void;
    onPausePlayback: () => void;
    onStopPlayback: () => void;
    onExportRecording: () => void;
    onImportRecording: (file: File) => void;
    onClearRecording: () => void;
}

// ── SVG Icons ────────────────────────────────────────────

function RecordIcon({ size = 12 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor">
            <circle cx="8" cy="8" r="5" />
        </svg>
    );
}

function StopIcon({ size = 12 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor">
            <rect x="3" y="3" width="10" height="10" rx="1" />
        </svg>
    );
}

function PlayIcon({ size = 12 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor">
            <path d="M4 2.5v11l9-5.5z" />
        </svg>
    );
}

function PauseIcon({ size = 12 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor">
            <rect x="3" y="2" width="3.5" height="12" rx="0.5" />
            <rect x="9.5" y="2" width="3.5" height="12" rx="0.5" />
        </svg>
    );
}

function ExportIcon({ size = 12 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 2v8" />
            <path d="M4 6l4-4 4 4" />
            <path d="M2 12h12" />
        </svg>
    );
}

function ImportIcon({ size = 12 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 10V2" />
            <path d="M4 6l4 4 4-4" />
            <path d="M2 12h12" />
        </svg>
    );
}

function TrashIcon({ size = 12 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 4h12" />
            <path d="M5 4V2.5a.5.5 0 01.5-.5h5a.5.5 0 01.5.5V4" />
            <path d="M12.5 4l-.7 9.1a1 1 0 01-1 .9H5.2a1 1 0 01-1-.9L3.5 4" />
        </svg>
    );
}

function formatDuration(ms: number): string {
    const secs = Math.floor(ms / 1000);
    const mins = Math.floor(secs / 60);
    const s = secs % 60;
    if (mins > 0) return `${mins}:${String(s).padStart(2, "0")}`;
    return `${s}s`;
}

export default function RecordingPanel({
    recordingState,
    hasRecording,
    frameCount,
    duration,
    playbackFrame,
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
    const [expanded, setExpanded] = useState(false);

    const handleImportClick = useCallback(() => {
        fileInputRef.current?.click();
    }, []);

    const handleFileChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0];
            if (file) {
                onImportRecording(file);
                // Reset the input so the same file can be re-imported
                e.target.value = "";
            }
        },
        [onImportRecording],
    );

    const isRecording = recordingState === "recording";
    const isPlaying = recordingState === "playing";
    const isPaused = recordingState === "paused";
    const isIdle = recordingState === "idle";

    return (
        <div>
            {/* Toggle button */}
            <button
                onClick={() => setExpanded((v: boolean) => !v)}
                className="w-full rounded bg-white/10 px-2 py-2 sm:py-1.5 text-xs hover:bg-white/20 transition text-left min-h-9 sm:min-h-0 flex items-center gap-2"
            >
                <svg width={14} height={14} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity={0.7}>
                    <circle cx="8" cy="8" r="5" />
                    <circle cx="8" cy="8" r="2" fill="currentColor" />
                </svg>
                <span>{expanded ? "▾" : "▸"} Record Session</span>
                {isRecording && (
                    <span className="ml-auto text-red-400 animate-pulse text-[10px]">● REC</span>
                )}
                {isPlaying && (
                    <span className="ml-auto text-green-400 animate-pulse text-[10px]">▶ PLAY</span>
                )}
                {isPaused && (
                    <span className="ml-auto text-yellow-400 text-[10px]">❚❚</span>
                )}
                {isIdle && hasRecording && (
                    <span className="ml-auto text-white/30 text-[10px]">{frameCount} frames</span>
                )}
            </button>

            {expanded && (
                <div className="mt-2 flex flex-col gap-2">
                    {/* Hint */}
                    <div className="text-[9px] text-white/40 leading-tight">
                        Record everything on the board — drawing, animations, effects. Export the recording file to replay on any device.
                    </div>

                    {/* Recording controls */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                        {/* Start / Stop Recording */}
                        {isRecording ? (
                            <button
                                onClick={onStopRecording}
                                className="flex items-center gap-1 rounded bg-red-500/30 text-red-300 px-2 py-1.5 hover:bg-red-500/50 transition text-[10px] min-h-9 sm:min-h-0"
                                title="Stop Recording"
                            >
                                <StopIcon size={10} />
                                <span>Stop Rec</span>
                            </button>
                        ) : (
                            <button
                                onClick={onStartRecording}
                                disabled={isPlaying || isPaused}
                                className={`flex items-center gap-1 rounded px-2 py-1.5 transition text-[10px] min-h-9 sm:min-h-0 ${isPlaying || isPaused
                                        ? "bg-white/5 text-white/20 cursor-not-allowed"
                                        : "bg-red-500/20 text-red-300 hover:bg-red-500/40"
                                    }`}
                                title="Start Recording"
                            >
                                <RecordIcon size={10} />
                                <span>Record</span>
                            </button>
                        )}

                        {/* Playback controls — only show when there's a recording */}
                        {hasRecording && !isRecording && (
                            <>
                                {isPlaying ? (
                                    <button
                                        onClick={onPausePlayback}
                                        className="flex items-center gap-1 rounded bg-yellow-500/30 text-yellow-300 px-2 py-1.5 hover:bg-yellow-500/50 transition text-[10px] min-h-9 sm:min-h-0"
                                        title="Pause"
                                    >
                                        <PauseIcon size={10} />
                                    </button>
                                ) : (
                                    <button
                                        onClick={onStartPlayback}
                                        className="flex items-center gap-1 rounded bg-green-500/20 text-green-300 px-2 py-1.5 hover:bg-green-500/40 transition text-[10px] min-h-9 sm:min-h-0"
                                        title="Play Recording"
                                    >
                                        <PlayIcon size={10} />
                                        <span>{isPaused ? "Resume" : "Play"}</span>
                                    </button>
                                )}

                                {(isPlaying || isPaused) && (
                                    <button
                                        onClick={onStopPlayback}
                                        className="flex items-center justify-center rounded bg-white/10 text-white/60 px-2 py-1.5 hover:bg-white/20 transition text-[10px] min-h-9 sm:min-h-0"
                                        title="Stop Playback"
                                    >
                                        <StopIcon size={10} />
                                    </button>
                                )}
                            </>
                        )}
                    </div>

                    {/* Status bar */}
                    {isRecording && (
                        <div className="flex items-center gap-2 rounded bg-red-950/40 border border-red-500/20 px-2 py-1 text-[10px]">
                            <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse shrink-0" />
                            <span className="text-red-300">Recording... {frameCount} frames · {formatDuration(duration)}</span>
                        </div>
                    )}

                    {(isPlaying || isPaused) && (
                        <div className="flex items-center gap-2 rounded bg-green-950/40 border border-green-500/20 px-2 py-1 text-[10px]">
                            <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${isPlaying ? "bg-green-500 animate-pulse" : "bg-yellow-500"}`} />
                            <span className="text-green-300">
                                {isPlaying ? "Playing" : "Paused"} · Frame {playbackFrame + 1}/{frameCount}
                            </span>
                        </div>
                    )}

                    {/* Recording info + actions — only when idle with a recording */}
                    {isIdle && hasRecording && (
                        <>
                            <div className="text-[9px] text-white/40">
                                {frameCount} frames · {formatDuration(duration)}
                            </div>

                            <div className="flex items-center gap-1.5 flex-wrap">
                                {/* Export */}
                                <button
                                    onClick={onExportRecording}
                                    className="flex items-center gap-1 rounded bg-blue-500/20 text-blue-300 px-2 py-1.5 hover:bg-blue-500/40 transition text-[10px] min-h-9 sm:min-h-0"
                                    title="Export recording file"
                                >
                                    <ExportIcon size={10} />
                                    <span>Export</span>
                                </button>

                                {/* Clear */}
                                <button
                                    onClick={onClearRecording}
                                    className="flex items-center gap-1 rounded bg-white/10 text-white/50 px-2 py-1.5 hover:bg-white/20 transition text-[10px] min-h-9 sm:min-h-0"
                                    title="Clear recording"
                                >
                                    <TrashIcon size={10} />
                                    <span>Clear</span>
                                </button>
                            </div>
                        </>
                    )}

                    {/* Import section — always visible when not recording/playing */}
                    {isIdle && (
                        <div className="flex items-center gap-1.5">
                            <button
                                onClick={handleImportClick}
                                className="flex items-center gap-1 rounded bg-purple-500/20 text-purple-300 px-2 py-1.5 hover:bg-purple-500/40 transition text-[10px] min-h-9 sm:min-h-0"
                                title="Import recording file (.tenix-rec)"
                            >
                                <ImportIcon size={10} />
                                <span>Import</span>
                            </button>
                            <span className="text-[9px] text-white/30">.tenix-rec file</span>
                        </div>
                    )}

                    {/* Hidden file input */}
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".tenix-rec,application/json"
                        onChange={handleFileChange}
                        className="hidden"
                    />
                </div>
            )}
        </div>
    );
}
