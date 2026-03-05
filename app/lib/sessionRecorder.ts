/**
 * SessionRecorder — programmatically records everything displayed on
 * the LED grid (frame-by-frame) so it can be replayed, exported to a
 * file, and imported on another device running the same platform.
 *
 * Each captured frame stores a full copy of the grid data + a timestamp
 * relative to the recording start.  During playback the frames are
 * rendered back at their original timing, giving a faithful reproduction
 * of exactly what the user saw — animations, drawing, effects and all.
 *
 * File format (.tenix-rec):
 *   JSON wrapper with metadata + base64-encoded frame data.
 */

import { uint8ToBase64, base64ToUint8 } from "./utils";

// ── Types ────────────────────────────────────────────────

export interface RecordedFrame {
  /** Milliseconds since recording started */
  ts: number;
  /** Full grid pixel data (cols * rows * 3 bytes, Uint8ClampedArray) */
  data: Uint8ClampedArray;
}

export interface RecordingData {
  /** Grid column count at capture time */
  cols: number;
  /** Grid row count at capture time */
  rows: number;
  /** Frames per second the recording was captured at */
  captureFps: number;
  /** All captured frames */
  frames: RecordedFrame[];
  /** Total duration in ms */
  duration: number;
}

/** Serialisable format for export / import */
export interface RecordingFile {
  /** Format identifier */
  format: "tenix-recording";
  /** Format version */
  version: 1;
  cols: number;
  rows: number;
  captureFps: number;
  duration: number;
  /** Number of frames */
  frameCount: number;
  /** Base64-encoded concatenation of all frame data buffers */
  frameData: string;
  /** Array of timestamps (ms) for each frame */
  timestamps: number[];
}

export type RecordingState = "idle" | "recording" | "playing" | "paused";

// ── SessionRecorder class ────────────────────────────────

export class SessionRecorder {
  private _state: RecordingState = "idle";

  // Recording state
  private _frames: RecordedFrame[] = [];
  private _cols = 0;
  private _rows = 0;
  /** Dimensions at recording time — separate from _cols/_rows which track live grid */
  private _recCols = 0;
  private _recRows = 0;
  private _captureFps = 30;
  private _captureInterval: ReturnType<typeof setInterval> | null = null;
  private _startTime = 0;

  // Playback state
  private _playbackStart = 0;
  private _playbackPauseOffset = 0;
  private _rafId = 0;
  private _playbackFrame = 0;
  private _looping = false;

  // Callbacks
  private _onStateChange: ((state: RecordingState) => void) | null = null;
  private _onPlaybackFrame: ((frame: number, total: number) => void) | null =
    null;
  private _getGridData: (() => Uint8ClampedArray | null) | null = null;
  private _setGridData: ((data: Uint8ClampedArray) => void) | null = null;
  private _redraw: (() => void) | null = null;

  // ── Configuration ────────────────────────────────────

  configure(opts: {
    cols: number;
    rows: number;
    captureFps?: number;
    getGridData: () => Uint8ClampedArray | null;
    setGridData: (data: Uint8ClampedArray) => void;
    redraw: () => void;
    onStateChange?: (state: RecordingState) => void;
    onPlaybackFrame?: (frame: number, total: number) => void;
  }): void {
    this._cols = opts.cols;
    this._rows = opts.rows;
    if (opts.captureFps) this._captureFps = opts.captureFps;
    this._getGridData = opts.getGridData;
    this._setGridData = opts.setGridData;
    this._redraw = opts.redraw;
    this._onStateChange = opts.onStateChange ?? null;
    this._onPlaybackFrame = opts.onPlaybackFrame ?? null;
  }

  updateGrid(cols: number, rows: number): void {
    this._cols = cols;
    this._rows = rows;
  }

  // ── Getters ──────────────────────────────────────────

  get state(): RecordingState {
    return this._state;
  }

  get frameCount(): number {
    return this._frames.length;
  }

  get duration(): number {
    if (this._frames.length === 0) return 0;
    return this._frames[this._frames.length - 1].ts;
  }

  get hasRecording(): boolean {
    return this._frames.length > 0;
  }

  get playbackFrame(): number {
    return this._playbackFrame;
  }

  // ── Recording ────────────────────────────────────────

  startRecording(): void {
    if (this._state === "recording") return;
    this.stopPlayback();

    this._frames = [];
    // Snapshot the grid dimensions at recording time
    this._recCols = this._cols;
    this._recRows = this._rows;
    this._startTime = performance.now();
    this._state = "recording";
    this._onStateChange?.("recording");

    // Capture the first frame immediately
    this._captureFrame();

    // Then capture at the configured FPS
    const interval = 1000 / this._captureFps;
    this._captureInterval = setInterval(() => {
      this._captureFrame();
    }, interval);
  }

  stopRecording(): void {
    if (this._state !== "recording") return;

    if (this._captureInterval) {
      clearInterval(this._captureInterval);
      this._captureInterval = null;
    }

    // Capture final frame
    this._captureFrame();

    this._state = "idle";
    this._onStateChange?.("idle");
  }

  private _captureFrame(): void {
    if (!this._getGridData) return;
    const data = this._getGridData();
    if (!data) return;

    const ts = performance.now() - this._startTime;
    this._frames.push({
      ts,
      data: new Uint8ClampedArray(data),
    });
  }

  // ── Playback ─────────────────────────────────────────

  startPlayback(loop = false): void {
    if (this._frames.length === 0) return;
    if (this._state === "playing") return;

    this._looping = loop;

    if (this._state === "paused") {
      // Resume from pause
      this._playbackStart = performance.now() - this._playbackPauseOffset;
      this._state = "playing";
      this._onStateChange?.("playing");
      this._rafId = requestAnimationFrame(this._playbackLoop);
      return;
    }

    // Fresh start
    this._playbackStart = performance.now();
    this._playbackPauseOffset = 0;
    this._playbackFrame = 0;
    this._state = "playing";
    this._onStateChange?.("playing");
    this._rafId = requestAnimationFrame(this._playbackLoop);
  }

  pausePlayback(): void {
    if (this._state !== "playing") return;
    cancelAnimationFrame(this._rafId);
    this._playbackPauseOffset = performance.now() - this._playbackStart;
    this._state = "paused";
    this._onStateChange?.("paused");
  }

  stopPlayback(): void {
    if (this._state !== "playing" && this._state !== "paused") return;
    cancelAnimationFrame(this._rafId);
    this._playbackFrame = 0;
    this._playbackPauseOffset = 0;
    this._state = "idle";
    this._onStateChange?.("idle");
  }

  private _playbackLoop = (): void => {
    if (this._state !== "playing") return;

    const elapsed = performance.now() - this._playbackStart;
    const totalDuration = this._frames[this._frames.length - 1].ts;

    let effectiveElapsed = elapsed;
    if (this._looping && totalDuration > 0) {
      effectiveElapsed = elapsed % (totalDuration + 500); // 500ms gap between loops
    }

    // Find the frame to display
    let frameIdx = this._playbackFrame;
    while (
      frameIdx < this._frames.length - 1 &&
      this._frames[frameIdx + 1].ts <= effectiveElapsed
    ) {
      frameIdx++;
    }

    // Handle end of playback
    if (effectiveElapsed > totalDuration) {
      if (this._looping) {
        // Reset for next loop cycle
        if (effectiveElapsed > totalDuration + 500) {
          this._playbackStart = performance.now();
          this._playbackFrame = 0;
          frameIdx = 0;
        }
      } else {
        // Render last frame and stop
        this._renderFrame(this._frames.length - 1);
        this._state = "idle";
        this._onStateChange?.("idle");
        return;
      }
    }

    // Always render the current frame (needed to ensure display stays updated)
    this._renderFrame(frameIdx);
    if (frameIdx !== this._playbackFrame) {
      this._playbackFrame = frameIdx;
      this._onPlaybackFrame?.(frameIdx, this._frames.length);
    }

    this._rafId = requestAnimationFrame(this._playbackLoop);
  };

  private _renderFrame(idx: number): void {
    if (idx < 0 || idx >= this._frames.length) return;
    const frame = this._frames[idx];

    if (!this._setGridData || !this._redraw) return;

    const gridLen = this._cols * this._rows * 3;

    if (frame.data.length === gridLen) {
      // Dimensions match — direct copy
      this._setGridData(frame.data);
    } else {
      // Different grid size — best-effort copy using recorded dimensions
      const buf = new Uint8ClampedArray(gridLen);
      const recCols = this._recCols || this._cols;
      const recRows = this._recRows || this._rows;
      const copyCols = Math.min(this._cols, recCols);
      const copyRows = Math.min(this._rows, recRows);
      for (let r = 0; r < copyRows; r++) {
        for (let c = 0; c < copyCols; c++) {
          const si = (r * recCols + c) * 3;
          const di = (r * this._cols + c) * 3;
          if (si + 2 < frame.data.length && di + 2 < gridLen) {
            buf[di] = frame.data[si];
            buf[di + 1] = frame.data[si + 1];
            buf[di + 2] = frame.data[si + 2];
          }
        }
      }
      this._setGridData(buf);
    }
    this._redraw();
  }

  // ── Export / Import ──────────────────────────────────

  /** Export the recording to a JSON-serialisable object */
  exportToFile(): RecordingFile | null {
    if (this._frames.length === 0) return null;

    // Concatenate all frame data into one big Uint8Array
    const frameSize = this._recCols * this._recRows * 3;
    const totalBytes = this._frames.length * frameSize;
    const combined = new Uint8Array(totalBytes);
    const timestamps: number[] = [];

    for (let i = 0; i < this._frames.length; i++) {
      combined.set(this._frames[i].data, i * frameSize);
      timestamps.push(Math.round(this._frames[i].ts));
    }

    return {
      format: "tenix-recording",
      version: 1,
      cols: this._recCols,
      rows: this._recRows,
      captureFps: this._captureFps,
      duration: Math.round(this.duration),
      frameCount: this._frames.length,
      frameData: uint8ToBase64(new Uint8ClampedArray(combined.buffer)),
      timestamps,
    };
  }

  /** Import a recording from a previously exported file */
  importFromFile(file: RecordingFile): boolean {
    if (file.format !== "tenix-recording" || file.version !== 1) return false;
    if (!file.frameData || !file.timestamps || file.frameCount === 0)
      return false;

    this.stopPlayback();
    this.stopRecording();

    const combined = base64ToUint8(file.frameData);
    const frameSize = file.cols * file.rows * 3;
    const frames: RecordedFrame[] = [];

    for (let i = 0; i < file.frameCount; i++) {
      const offset = i * frameSize;
      if (offset + frameSize > combined.length) break;
      frames.push({
        ts: file.timestamps[i],
        data: new Uint8ClampedArray(
          combined.buffer,
          combined.byteOffset + offset,
          frameSize,
        ),
      });
    }

    this._frames = frames;
    this._recCols = file.cols;
    this._recRows = file.rows;
    this._cols = file.cols;
    this._rows = file.rows;
    this._captureFps = file.captureFps;
    this._state = "idle";
    this._onStateChange?.("idle");

    return true;
  }

  /** Download the recording as a .tenix-rec file */
  downloadRecording(filename?: string): void {
    const file = this.exportToFile();
    if (!file) return;

    const json = JSON.stringify(file);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename ?? `tenix-recording-${Date.now()}.tenix-rec`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /** Load a recording from a .tenix-rec file (via File input) */
  async loadFromFileInput(file: File): Promise<boolean> {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as RecordingFile;
      return this.importFromFile(parsed);
    } catch {
      return false;
    }
  }

  /** Clear the current recording data */
  clear(): void {
    this.stopPlayback();
    if (this._captureInterval) {
      clearInterval(this._captureInterval);
      this._captureInterval = null;
    }
    this._frames = [];
    this._state = "idle";
    this._onStateChange?.("idle");
  }

  /** Clean up on unmount */
  destroy(): void {
    this.clear();
  }
}

/** Singleton shared across the app */
export const sessionRecorder = new SessionRecorder();
