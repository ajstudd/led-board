/**
 * exporter — central export orchestrator for Tenix.
 *
 * Provides a unified API for exporting the LED grid as:
 *  - GIF (animated, universally supported)
 *  - WebM (video, hardware-accelerated via WebCodecs)
 *  - PNG (single frame, high-res)
 *  - SVG (single frame, vector/infinite scaling)
 *
 * Works with recorded sessions (multi-frame) or the current canvas state
 * (single frame).
 */

import { GifEncoder } from "./gifEncoder";
import { encodeVideo } from "./videoEncoder";
import { SessionRecorder } from "./sessionRecorder";
import { applyDelta } from "./deltaCodec";

// ── Types ────────────────────────────────────────────────

export type ExportFormat = "gif" | "webm" | "png" | "svg";

export interface ExportOptions {
  format: ExportFormat;
  /** Resolution multiplier (1 = native, 2 = 2×, 4 = 4×) */
  scale: number;
  /** Frames per second (for animated exports) */
  fps: number;
  /** Loop count for GIF (0 = infinite, 1 = once) */
  loop?: number;
  /** Whether to export with transparent background */
  transparent?: boolean;
  /** Bitrate for video encoding */
  bitrate?: number;
  /** Background color (used when transparent=false and cell is black) */
  backgroundColor?: [number, number, number];
}

export interface ExportProgress {
  /** 0-100 */
  percent: number;
  /** Human-readable status */
  status: string;
}

/**
 * Reconstruct all frames from a SessionRecorder as full RGB buffers.
 * Uses direct frame access — no serialization round-trip needed.
 */
function reconstructFrames(
  recorder: SessionRecorder,
): { data: Uint8ClampedArray; ts: number }[] {
  const rawFrames = recorder.getFrames();
  if (rawFrames.length === 0) return [];

  const { cols, rows } = recorder.getRecDims();
  const frameSize = cols * rows * 3;
  const frames: { data: Uint8ClampedArray; ts: number }[] = [];
  const reconstructed = new Uint8ClampedArray(frameSize);

  for (let i = 0; i < rawFrames.length; i++) {
    const frame = rawFrames[i];

    if (frame.type === "key") {
      // Direct copy from keyframe
      if (frame.data.length >= frameSize) {
        reconstructed.set(frame.data.subarray(0, frameSize));
      } else {
        reconstructed.fill(0);
        reconstructed.set(frame.data);
      }
    } else {
      // Delta frame — apply changes on top of reconstructed buffer
      applyDelta(reconstructed, frame.changedIndices, frame.changedValues);
    }

    frames.push({ data: new Uint8ClampedArray(reconstructed), ts: frame.ts });
  }

  return frames;
}

// ── PNG Export ────────────────────────────────────────────

/**
 * Render a single grid frame to a PNG blob.
 */
export function exportAsPng(
  gridData: Uint8ClampedArray,
  cols: number,
  rows: number,
  options: ExportOptions,
): Promise<Blob> {
  const scale = options.scale || 1;
  const width = cols * scale;
  const height = rows * scale;
  const transparent = options.transparent ?? false;
  const bg = options.backgroundColor ?? [0, 0, 0];

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;

  // Create 1:1 ImageData
  const imgData = ctx.createImageData(cols, rows);
  const px = imgData.data;

  for (let i = 0, j = 0; i < cols * rows; i++, j += 4) {
    const si = i * 3;
    const r = gridData[si], g = gridData[si + 1], b = gridData[si + 2];
    const isBlack = r === 0 && g === 0 && b === 0;

    if (transparent && isBlack) {
      px[j] = 0; px[j + 1] = 0; px[j + 2] = 0; px[j + 3] = 0;
    } else if (!transparent && isBlack) {
      px[j] = bg[0]; px[j + 1] = bg[1]; px[j + 2] = bg[2]; px[j + 3] = 255;
    } else {
      px[j] = r; px[j + 1] = g; px[j + 2] = b; px[j + 3] = 255;
    }
  }

  // Scale up with nearest-neighbor
  const srcCanvas = document.createElement("canvas");
  srcCanvas.width = cols;
  srcCanvas.height = rows;
  srcCanvas.getContext("2d")!.putImageData(imgData, 0, 0);

  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(srcCanvas, 0, 0, width, height);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("PNG encoding failed"))),
      "image/png",
    );
  });
}

// ── SVG Export ────────────────────────────────────────────

/**
 * Convert grid data to an SVG (each cell = one rect element).
 * The SVG scales to any size without pixelation.
 */
export function exportAsSvg(
  gridData: Uint8ClampedArray,
  cols: number,
  rows: number,
  options: ExportOptions,
): Blob {
  const cellSize = options.scale || 1;
  const width = cols * cellSize;
  const height = rows * cellSize;
  const transparent = options.transparent ?? false;
  const bg = options.backgroundColor ?? [0, 0, 0];

  const rects: string[] = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const idx = (row * cols + col) * 3;
      const r = gridData[idx], g = gridData[idx + 1], b = gridData[idx + 2];
      const isBlack = r === 0 && g === 0 && b === 0;

      if (transparent && isBlack) continue; // skip transparent cells

      const fill = isBlack
        ? `rgb(${bg[0]},${bg[1]},${bg[2]})`
        : `rgb(${r},${g},${b})`;

      rects.push(
        `<rect x="${col * cellSize}" y="${row * cellSize}" width="${cellSize}" height="${cellSize}" fill="${fill}"/>`,
      );
    }
  }

  // Background rect (if not transparent)
  const bgRect = transparent
    ? ""
    : `<rect width="${width}" height="${height}" fill="rgb(${bg[0]},${bg[1]},${bg[2]})"/>`;

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" shape-rendering="crispEdges">
${bgRect}
${rects.join("\n")}
</svg>`;

  return new Blob([svg], { type: "image/svg+xml" });
}

// ── GIF Export ────────────────────────────────────────────

/**
 * Export a recorded session as an animated GIF.
 */
export async function exportAsGif(
  recorder: SessionRecorder,
  cols: number,
  rows: number,
  options: ExportOptions,
  onProgress?: (p: ExportProgress) => void,
): Promise<Blob> {
  const scale = options.scale || 1;
  const width = cols * scale;
  const height = rows * scale;
  const transparent = options.transparent ?? false;
  const bg = options.backgroundColor ?? [0, 0, 0];

  onProgress?.({ percent: 0, status: "Reconstructing frames..." });

  const frames = reconstructFrames(recorder);
  if (frames.length === 0) throw new Error("No frames to export");

  // Compute target FPS — use options.fps or derive from recording
  const targetFps = options.fps || 15;
  const frameDuration = 1000 / targetFps;

  // Sample frames at target FPS from the recording timestamps
  const totalDuration = frames[frames.length - 1].ts;
  const sampledFrames: Uint8ClampedArray[] = [];
  let nextSampleTime = 0;
  let frameIdx = 0;

  while (nextSampleTime <= totalDuration) {
    // Find the frame closest to nextSampleTime
    while (frameIdx < frames.length - 1 && frames[frameIdx + 1].ts <= nextSampleTime) {
      frameIdx++;
    }
    sampledFrames.push(frames[frameIdx].data);
    nextSampleTime += frameDuration;
  }

  onProgress?.({ percent: 10, status: `Encoding ${sampledFrames.length} frames as GIF...` });

  const encoder = new GifEncoder({
    width,
    height,
    delay: frameDuration,
    loop: options.loop ?? 0,
    transparentColor: transparent ? [0, 0, 0] : undefined,
  });

  // Render each frame at target scale
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;

  for (let i = 0; i < sampledFrames.length; i++) {
    const data = sampledFrames[i];

    // Build 1:1 ImageData
    const src = document.createElement("canvas");
    src.width = cols;
    src.height = rows;
    const srcCtx = src.getContext("2d")!;
    const imgData = srcCtx.createImageData(cols, rows);
    const px = imgData.data;

    for (let p = 0, j = 0; p < cols * rows; p++, j += 4) {
      const si = p * 3;
      const r = data[si], g = data[si + 1], b = data[si + 2];
      const isBlack = r === 0 && g === 0 && b === 0;

      if (transparent && isBlack) {
        px[j] = 0; px[j + 1] = 0; px[j + 2] = 0; px[j + 3] = 0;
      } else if (!transparent && isBlack) {
        px[j] = bg[0]; px[j + 1] = bg[1]; px[j + 2] = bg[2]; px[j + 3] = 255;
      } else {
        px[j] = r; px[j + 1] = g; px[j + 2] = b; px[j + 3] = 255;
      }
    }
    srcCtx.putImageData(imgData, 0, 0);

    // Scale up
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(src, 0, 0, width, height);

    // Get scaled RGBA
    const scaledData = ctx.getImageData(0, 0, width, height);
    encoder.addFrame(scaledData.data);

    onProgress?.({
      percent: 10 + ((i + 1) / sampledFrames.length) * 85,
      status: `Encoding frame ${i + 1}/${sampledFrames.length}...`,
    });
  }

  onProgress?.({ percent: 95, status: "Finalizing GIF..." });
  const blob = encoder.finish();
  onProgress?.({ percent: 100, status: "Done!" });

  return blob;
}

// ── Video Export ──────────────────────────────────────────

/**
 * Export a recorded session as WebM video.
 */
export async function exportAsVideo(
  recorder: SessionRecorder,
  cols: number,
  rows: number,
  options: ExportOptions,
  onProgress?: (p: ExportProgress) => void,
): Promise<Blob> {
  const scale = options.scale || 1;
  const width = cols * scale;
  const height = rows * scale;
  const bg = options.backgroundColor ?? [0, 0, 0];

  onProgress?.({ percent: 0, status: "Reconstructing frames..." });

  const rawFrames = reconstructFrames(recorder);
  if (rawFrames.length === 0) throw new Error("No frames to export");

  // Sample at target FPS
  const targetFps = options.fps || 30;
  const frameDuration = 1000 / targetFps;
  const totalDuration = rawFrames[rawFrames.length - 1].ts;
  const videoFrames: { data: Uint8ClampedArray; width: number; height: number }[] = [];

  let nextSampleTime = 0;
  let frameIdx = 0;

  while (nextSampleTime <= totalDuration) {
    while (frameIdx < rawFrames.length - 1 && rawFrames[frameIdx + 1].ts <= nextSampleTime) {
      frameIdx++;
    }

    const data = rawFrames[frameIdx].data;

    // Scale the frame
    if (scale === 1) {
      // Apply background color to black cells
      const out = new Uint8ClampedArray(data.length);
      for (let i = 0; i < data.length; i += 3) {
        if (data[i] === 0 && data[i + 1] === 0 && data[i + 2] === 0) {
          out[i] = bg[0]; out[i + 1] = bg[1]; out[i + 2] = bg[2];
        } else {
          out[i] = data[i]; out[i + 1] = data[i + 1]; out[i + 2] = data[i + 2];
        }
      }
      videoFrames.push({ data: out, width, height });
    } else {
      // Scale up with nearest neighbor
      const scaled = new Uint8ClampedArray(width * height * 3);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const srcX = Math.floor(x / scale);
          const srcY = Math.floor(y / scale);
          const si = (srcY * cols + srcX) * 3;
          const di = (y * width + x) * 3;
          const r = data[si], g = data[si + 1], b = data[si + 2];
          if (r === 0 && g === 0 && b === 0) {
            scaled[di] = bg[0]; scaled[di + 1] = bg[1]; scaled[di + 2] = bg[2];
          } else {
            scaled[di] = r; scaled[di + 1] = g; scaled[di + 2] = b;
          }
        }
      }
      videoFrames.push({ data: scaled, width, height });
    }

    nextSampleTime += frameDuration;
  }

  onProgress?.({ percent: 15, status: `Encoding ${videoFrames.length} frames as WebM...` });

  const blob = await encodeVideo(
    videoFrames,
    {
      width,
      height,
      fps: targetFps,
      bitrate: options.bitrate ?? 2_000_000,
    },
    (pct) => {
      onProgress?.({
        percent: 15 + pct * 0.8,
        status: `Encoding video... ${Math.round(pct)}%`,
      });
    },
  );

  onProgress?.({ percent: 100, status: "Done!" });
  return blob;
}

// ── Frame-array export (deterministic sources, e.g. baked physics) ─────────
// These take a ready-made list of full RGB grid frames (already at target fps)
// instead of a SessionRecorder, so deterministic sources like a baked physics
// simulation can be exported frame-exact without going through live recording.

/** Encode a list of RGB grid frames as an animated GIF. */
export async function exportFramesAsGif(
  frames: Uint8ClampedArray[],
  cols: number,
  rows: number,
  options: ExportOptions,
  onProgress?: (p: ExportProgress) => void,
): Promise<Blob> {
  if (frames.length === 0) throw new Error("No frames to export");
  const scale = options.scale || 1;
  const width = cols * scale;
  const height = rows * scale;
  const transparent = options.transparent ?? false;
  const bg = options.backgroundColor ?? [0, 0, 0];
  const frameDuration = 1000 / (options.fps || 30);

  const encoder = new GifEncoder({
    width,
    height,
    delay: frameDuration,
    loop: options.loop ?? 0,
    transparentColor: transparent ? [0, 0, 0] : undefined,
  });

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;

  for (let i = 0; i < frames.length; i++) {
    const data = frames[i];
    const src = document.createElement("canvas");
    src.width = cols;
    src.height = rows;
    const srcCtx = src.getContext("2d")!;
    const imgData = srcCtx.createImageData(cols, rows);
    const px = imgData.data;
    for (let p = 0, j = 0; p < cols * rows; p++, j += 4) {
      const si = p * 3;
      const r = data[si], g = data[si + 1], b = data[si + 2];
      const isBlack = r === 0 && g === 0 && b === 0;
      if (transparent && isBlack) {
        px[j] = 0; px[j + 1] = 0; px[j + 2] = 0; px[j + 3] = 0;
      } else if (!transparent && isBlack) {
        px[j] = bg[0]; px[j + 1] = bg[1]; px[j + 2] = bg[2]; px[j + 3] = 255;
      } else {
        px[j] = r; px[j + 1] = g; px[j + 2] = b; px[j + 3] = 255;
      }
    }
    srcCtx.putImageData(imgData, 0, 0);

    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(src, 0, 0, width, height);
    encoder.addFrame(ctx.getImageData(0, 0, width, height).data);

    onProgress?.({
      percent: ((i + 1) / frames.length) * 95,
      status: `Encoding frame ${i + 1}/${frames.length}...`,
    });
  }

  const blob = encoder.finish();
  onProgress?.({ percent: 100, status: "Done!" });
  return blob;
}

/** Encode a list of RGB grid frames as WebM video. */
export async function exportFramesAsVideo(
  frames: Uint8ClampedArray[],
  cols: number,
  rows: number,
  options: ExportOptions,
  onProgress?: (p: ExportProgress) => void,
): Promise<Blob> {
  if (frames.length === 0) throw new Error("No frames to export");
  const scale = options.scale || 1;
  const width = cols * scale;
  const height = rows * scale;
  const bg = options.backgroundColor ?? [0, 0, 0];
  const targetFps = options.fps || 30;

  const videoFrames = frames.map((data) => {
    if (scale === 1) {
      const out = new Uint8ClampedArray(data.length);
      for (let i = 0; i < data.length; i += 3) {
        if (data[i] === 0 && data[i + 1] === 0 && data[i + 2] === 0) {
          out[i] = bg[0]; out[i + 1] = bg[1]; out[i + 2] = bg[2];
        } else {
          out[i] = data[i]; out[i + 1] = data[i + 1]; out[i + 2] = data[i + 2];
        }
      }
      return { data: out, width, height };
    }
    const scaled = new Uint8ClampedArray(width * height * 3);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const sx = Math.floor(x / scale);
        const sy = Math.floor(y / scale);
        const si = (sy * cols + sx) * 3;
        const di = (y * width + x) * 3;
        const r = data[si], g = data[si + 1], b = data[si + 2];
        if (r === 0 && g === 0 && b === 0) {
          scaled[di] = bg[0]; scaled[di + 1] = bg[1]; scaled[di + 2] = bg[2];
        } else {
          scaled[di] = r; scaled[di + 1] = g; scaled[di + 2] = b;
        }
      }
    }
    return { data: scaled, width, height };
  });

  onProgress?.({ percent: 10, status: `Encoding ${videoFrames.length} frames as WebM...` });
  const blob = await encodeVideo(
    videoFrames,
    { width, height, fps: targetFps, bitrate: options.bitrate ?? 2_000_000 },
    (pct) => onProgress?.({ percent: 10 + pct * 0.85, status: `Encoding video... ${Math.round(pct)}%` }),
  );
  onProgress?.({ percent: 100, status: "Done!" });
  return blob;
}

// ── Download helper ──────────────────────────────────────

/**
 * Trigger a browser download of a Blob.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
