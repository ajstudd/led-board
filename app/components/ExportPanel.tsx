"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import InfoTooltip from "./InfoTooltip";
import {
  ExportFormat,
  ExportProgress,
  exportAsPng,
  exportAsSvg,
  exportAsGif,
  exportAsVideo,
  exportFramesAsGif,
  exportFramesAsVideo,
  downloadBlob,
} from "../lib/exporter";
import { SessionRecorder } from "../lib/sessionRecorder";
import { hasWebCodecs, hasMediaRecorder } from "../lib/videoEncoder";

// ── Types ────────────────────────────────────────────────

interface ExportPanelProps {
  /** Grid dimensions */
  cols: number;
  rows: number;
  /** Current grid data (for single-frame export) */
  getGridData: () => Uint8ClampedArray | null;
  /** Session recorder (for animated export from a recorded session) */
  recorder: SessionRecorder;
  /** Whether a recording exists */
  hasRecording: boolean;
  /**
   * Deterministic physics-sim frame source. Present means the active layer can
   * be exported directly as a simulation (no recording needed).
   */
  getSimulationFrames?: (
    frameCount: number,
    fps: number,
  ) => { frames: Uint8ClampedArray[]; cols: number; rows: number } | null;
  /** True when physics is enabled on the active layer. */
  simulationAvailable?: boolean;
}

type ExportSource = "board" | "simulation";

// ── Constants ────────────────────────────────────────────

const FORMAT_OPTIONS: { value: ExportFormat; label: string; icon: string; animated: boolean }[] = [
  { value: "png", label: "PNG", icon: "🖼", animated: false },
  { value: "svg", label: "SVG", icon: "📐", animated: false },
  { value: "gif", label: "GIF", icon: "🎞", animated: true },
  { value: "webm", label: "WebM", icon: "🎬", animated: true },
];

const SCALE_OPTIONS = [1, 2, 4, 8];

// ── Component ────────────────────────────────────────────

export default function ExportPanel({
  cols,
  rows,
  getGridData,
  recorder,
  hasRecording,
  getSimulationFrames,
  simulationAvailable = false,
}: ExportPanelProps) {
  const [source, setSource] = useState<ExportSource>("board");
  const [simFrames, setSimFrames] = useState(90);
  const [format, setFormat] = useState<ExportFormat>("png");
  const [scale, setScale] = useState(2);
  const [fps, setFps] = useState(15);
  const [loop, setLoop] = useState(0); // 0 = infinite
  const [transparent, setTransparent] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef(false);

  // Can't keep "simulation" selected once physics is off.
  useEffect(() => {
    if (!simulationAvailable && source === "simulation") setSource("board");
  }, [simulationAvailable, source]);

  const selectedFormat = FORMAT_OPTIONS.find((f) => f.value === format)!;
  const isAnimated = selectedFormat.animated;
  // Animated export: from a recording (board) or directly from the sim.
  const canExportAnimated = source === "simulation" ? simulationAvailable : hasRecording;

  // Video capability detection
  const videoSupported = hasWebCodecs() || hasMediaRecorder();

  const handleExport = useCallback(async () => {
    setIsExporting(true);
    setError(null);
    setProgress({ percent: 0, status: "Starting..." });
    abortRef.current = false;

    try {
      const onProgress = (p: ExportProgress) => {
        if (!abortRef.current) setProgress(p);
      };

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      let blob: Blob;
      let filename: string;

      switch (format) {
        case "png": {
          const data = getGridData();
          if (!data) throw new Error("No grid data");
          blob = await exportAsPng(data, cols, rows, {
            format: "png",
            scale,
            fps: 0,
            transparent,
          });
          filename = `tenix-${timestamp}.png`;
          break;
        }
        case "svg": {
          const data = getGridData();
          if (!data) throw new Error("No grid data");
          blob = exportAsSvg(data, cols, rows, {
            format: "svg",
            scale,
            fps: 0,
            transparent,
          });
          filename = `tenix-${timestamp}.svg`;
          break;
        }
        case "gif": {
          if (source === "simulation") {
            const sim = getSimulationFrames?.(simFrames, fps);
            if (!sim || sim.frames.length === 0) throw new Error("Enable Physics on a layer with content first");
            blob = await exportFramesAsGif(sim.frames, sim.cols, sim.rows, {
              format: "gif", scale, fps, loop, transparent,
            }, onProgress);
          } else {
            if (!canExportAnimated) throw new Error("Record a session first");
            blob = await exportAsGif(recorder, cols, rows, {
              format: "gif", scale, fps, loop, transparent,
            }, onProgress);
          }
          filename = `tenix-${timestamp}.gif`;
          break;
        }
        case "webm": {
          if (!videoSupported) throw new Error("Video encoding not supported in this browser");
          if (source === "simulation") {
            const sim = getSimulationFrames?.(simFrames, fps);
            if (!sim || sim.frames.length === 0) throw new Error("Enable Physics on a layer with content first");
            blob = await exportFramesAsVideo(sim.frames, sim.cols, sim.rows, {
              format: "webm", scale, fps, transparent,
            }, onProgress);
          } else {
            if (!canExportAnimated) throw new Error("Record a session first");
            blob = await exportAsVideo(recorder, cols, rows, {
              format: "webm", scale, fps, transparent,
            }, onProgress);
          }
          filename = `tenix-${timestamp}.webm`;
          break;
        }
        default:
          throw new Error(`Unknown format: ${format}`);
      }

      if (!abortRef.current) {
        downloadBlob(blob, filename);
        setProgress({ percent: 100, status: "Downloaded!" });
      }
    } catch (err) {
      if (!abortRef.current) {
        setError(err instanceof Error ? err.message : "Export failed");
      }
    } finally {
      setIsExporting(false);
    }
  }, [format, scale, fps, loop, transparent, cols, rows, getGridData, recorder, canExportAnimated, videoSupported, source, simFrames, getSimulationFrames]);

  const handleCancel = useCallback(() => {
    abortRef.current = true;
    setIsExporting(false);
    setProgress(null);
  }, []);

  // Output resolution preview
  const outputWidth = cols * scale;
  const outputHeight = rows * scale;

  return (
    <div className="flex flex-col gap-1.5">
      {/* Section header */}
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] uppercase tracking-widest text-white/40">
          Export
        </span>
        <InfoTooltip title="Export Options" width={220}>
          <ul className="flex flex-col gap-1">
            <li>🖼 PNG — single frame, pixel-perfect</li>
            <li>📐 SVG — single frame, infinite scaling</li>
            <li>🎞 GIF — animated, universal support</li>
            <li>🎬 WebM — animated, high quality video</li>
            <li className="pt-0.5 text-white/50">
              Record a session first for GIF/WebM export
            </li>
          </ul>
        </InfoTooltip>
      </div>

      {/* Source selector — only when a physics sim is available */}
      {simulationAvailable && (
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-white/40">Source</span>
          <div className="flex gap-1">
            {(["board", "simulation"] as ExportSource[]).map((s) => (
              <button
                key={s}
                onClick={() => setSource(s)}
                className={`rounded px-2 py-0.5 text-[10px] capitalize transition ${
                  source === s
                    ? "bg-green-500/30 text-green-300"
                    : "bg-white/5 text-white/60 hover:bg-white/10"
                }`}
                title={s === "simulation" ? "Export the active layer's physics simulation (deterministic, no recording needed)" : "Export the board / recorded session"}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Format selector */}
      <div className="flex gap-1">
        {FORMAT_OPTIONS.map((f) => {
          const disabled = f.animated && !canExportAnimated;
          const isActive = format === f.value;
          return (
            <button
              key={f.value}
              onClick={() => !disabled && setFormat(f.value)}
              disabled={disabled}
              className={`flex-1 flex flex-col items-center gap-0.5 rounded px-1 py-1.5 sm:py-1 text-[10px] transition min-h-8 sm:min-h-0 ${
                disabled
                  ? "opacity-30 cursor-not-allowed bg-white/5"
                  : isActive
                    ? "bg-green-500/30 text-green-300 ring-1 ring-green-500/50"
                    : "bg-white/5 text-white/70 hover:bg-white/10"
              }`}
              title={
                disabled
                  ? `Record a session to export as ${f.label}`
                  : `Export as ${f.label}`
              }
            >
              <span className="text-sm leading-none">{f.icon}</span>
              <span className="leading-none">{f.label}</span>
            </button>
          );
        })}
      </div>

      {/* Scale selector */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-white/40">Scale</span>
        <div className="flex gap-1">
          {SCALE_OPTIONS.map((s) => (
            <button
              key={s}
              onClick={() => setScale(s)}
              className={`rounded px-1.5 py-0.5 text-[10px] transition ${
                scale === s
                  ? "bg-green-500/30 text-green-300"
                  : "bg-white/5 text-white/60 hover:bg-white/10"
              }`}
            >
              {s}×
            </button>
          ))}
        </div>
      </div>

      {/* Resolution preview */}
      <div className="text-[9px] text-white/30 text-right">
        {outputWidth}×{outputHeight}px
      </div>

      {/* Animated-only options */}
      {isAnimated && (
        <div className="flex flex-col gap-1.5 pl-1 border-l border-white/10">
          {/* Simulation length (sim source only) */}
          {source === "simulation" && (
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-white/40">Length</span>
              <input
                type="range"
                min={15}
                max={240}
                step={15}
                value={simFrames}
                onChange={(e) => setSimFrames(parseInt(e.target.value, 10))}
                className="w-16 accent-green-400 cursor-pointer"
              />
              <span className="text-[10px] text-white/60 w-10 text-right tabular-nums">
                {(simFrames / fps).toFixed(1)}s
              </span>
            </div>
          )}
          {/* FPS */}
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-white/40">FPS</span>
            <input
              type="range"
              min={5}
              max={60}
              step={5}
              value={fps}
              onChange={(e) => setFps(parseInt(e.target.value, 10))}
              className="w-16 accent-green-400 cursor-pointer"
            />
            <span className="text-[10px] text-white/60 w-6 text-right tabular-nums">
              {fps}
            </span>
          </div>

          {/* Loop (GIF only) */}
          {format === "gif" && (
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-white/40">Loop</span>
              <button
                onClick={() => setLoop(loop === 0 ? 1 : 0)}
                className={`rounded px-2 py-0.5 text-[10px] transition ${
                  loop === 0
                    ? "bg-green-500/30 text-green-300"
                    : "bg-white/5 text-white/60 hover:bg-white/10"
                }`}
              >
                {loop === 0 ? "∞ Forever" : "Once"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Transparent background */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-white/40">Transparent BG</span>
        <button
          onClick={() => setTransparent(!transparent)}
          className={`rounded px-2 py-0.5 text-[10px] transition ${
            transparent
              ? "bg-purple-500/30 text-purple-300"
              : "bg-white/5 text-white/60 hover:bg-white/10"
          }`}
          title={
            format === "webm"
              ? "WebM transparency requires VP9 with alpha"
              : undefined
          }
        >
          {transparent ? "ON" : "OFF"}
        </button>
      </div>

      {/* Export button */}
      {isExporting ? (
        <div className="flex flex-col gap-1">
          {/* Progress bar */}
          <div className="relative h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-green-400 transition-[width] duration-200"
              style={{ width: `${progress?.percent ?? 0}%` }}
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[9px] text-white/40 truncate flex-1">
              {progress?.status ?? "Exporting..."}
            </span>
            <button
              onClick={handleCancel}
              className="text-[9px] text-red-400 hover:text-red-300 transition"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={handleExport}
          disabled={isAnimated && !canExportAnimated}
          className={`w-full rounded py-2 sm:py-1.5 text-xs font-medium transition min-h-9 sm:min-h-0 ${
            isAnimated && !canExportAnimated
              ? "bg-white/5 text-white/30 cursor-not-allowed"
              : "bg-green-600/60 text-green-100 hover:bg-green-500/70 active:bg-green-500/90"
          }`}
        >
          {isAnimated && !canExportAnimated
            ? "Record a session first"
            : `Export ${selectedFormat.label}`}
        </button>
      )}

      {/* Error message */}
      {error && (
        <div className="text-[9px] text-red-400/80 bg-red-950/30 rounded px-2 py-1 border border-red-500/20">
          {error}
        </div>
      )}
    </div>
  );
}
