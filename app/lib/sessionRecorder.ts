/**
 * SessionRecorder — programmatically records everything displayed on
 * the LED grid (frame-by-frame) so it can be replayed, exported to a
 * file, and imported on another device running the same platform.
 *
 * v2: Delta compression — only changed cells are stored between keyframes.
 * Full keyframes are inserted every KEYFRAME_INTERVAL frames (default 30,
 * i.e. once per second at 30fps) so random-access seeking remains fast.
 *
 * File format (.tenix-rec):
 *   JSON wrapper with metadata + base64-encoded frame data.
 *   v1 files (full-frame) are still importable for backward compatibility.
 */

import { uint8ToBase64, base64ToUint8 } from "./utils";
import {
  encodeDelta,
  applyDelta,
  packDelta,
  unpackDelta,
  packedDeltaSize,
} from "./deltaCodec";

// ── Constants ────────────────────────────────────────────

/** How often to insert a full keyframe (in frames). */
const KEYFRAME_INTERVAL = 30;

// ── Types ────────────────────────────────────────────────

/** A full-frame keyframe. */
export interface KeyFrame {
  type: "key";
  /** Milliseconds since recording started */
  ts: number;
  /** Full grid pixel data (cols * rows * 3 bytes, Uint8ClampedArray) */
  data: Uint8ClampedArray;
}

/** A delta frame — stores only changed cells. */
export interface DeltaFrame {
  type: "delta";
  /** Milliseconds since recording started */
  ts: number;
  /** Flat cell indices that changed */
  changedIndices: Uint32Array;
  /** RGB values for changed cells */
  changedValues: Uint8ClampedArray;
}

export type RecordedFrame = KeyFrame | DeltaFrame;

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

/** v1 serialisable format (backward compat, full-frame only) */
export interface RecordingFileV1 {
  format: "tenix-recording";
  version: 1;
  cols: number;
  rows: number;
  captureFps: number;
  duration: number;
  frameCount: number;
  frameData: string;
  timestamps: number[];
}

/** v2 serialisable format (delta-compressed) */
export interface RecordingFileV2 {
  format: "tenix-recording";
  version: 2;
  cols: number;
  rows: number;
  captureFps: number;
  duration: number;
  frameCount: number;
  /**
   * Base64-encoded binary blob containing all frames sequentially.
   * Each frame is prefixed with:
   *   [1 byte: type] 0x00 = keyframe, 0x01 = delta
   *   [4 bytes: timestamp, uint32 LE]
   *   [4 bytes: payload length, uint32 LE]
   *   [N bytes: payload]
   * For keyframes, payload = raw RGB data (cols*rows*3).
   * For deltas, payload = packed delta (see deltaCodec.ts).
   */
  frameBlob: string;
}

export type RecordingFile = RecordingFileV1 | RecordingFileV2;

export type RecordingState = "idle" | "recording" | "playing" | "paused";

// ── Frame header constants ───────────────────────────────

const FRAME_TYPE_KEY = 0x00;
const FRAME_TYPE_DELTA = 0x01;
/** 1 (type) + 4 (timestamp) + 4 (payload length) */
const FRAME_HEADER_SIZE = 9;

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
  /** Frame counter since last keyframe (used for keyframe interval) */
  private _framesSinceKeyframe = 0;
  /** Previous frame data for delta encoding */
  private _prevFrameData: Uint8ClampedArray | null = null;

  // Playback state
  private _playbackStart = 0;
  private _playbackPauseOffset = 0;
  private _rafId = 0;
  private _playbackFrame = 0;
  private _looping = false;
  /** Reconstructed frame buffer for delta playback */
  private _reconstructed: Uint8ClampedArray | null = null;
  /** Index of the last reconstructed frame (for forward-only optimisation) */
  private _reconstructedFrameIdx = -1;

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

  get looping(): boolean {
    return this._looping;
  }

  /** Direct read-only access to the recorded frames (for export pipeline) */
  getFrames(): readonly RecordedFrame[] {
    return this._frames;
  }

  /** Get the grid dimensions at recording time */
  getRecDims(): { cols: number; rows: number } {
    return { cols: this._recCols || this._cols, rows: this._recRows || this._rows };
  }

  /** Set looping on/off — can be called even during playback */
  setLooping(v: boolean): void {
    this._looping = v;
  }

  // ── Recording ────────────────────────────────────────

  startRecording(): void {
    if (this._state === "recording") return;
    this.stopPlayback();

    this._frames = [];
    this._prevFrameData = null;
    this._framesSinceKeyframe = 0;
    // Snapshot the grid dimensions at recording time
    this._recCols = this._cols;
    this._recRows = this._rows;
    this._startTime = performance.now();
    this._state = "recording";
    this._onStateChange?.("recording");

    // Capture the first frame immediately (always a keyframe)
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

    // Clean up recording-only state
    this._prevFrameData = null;

    this._state = "idle";
    this._onStateChange?.("idle");
  }

  private _captureFrame(): void {
    if (!this._getGridData) return;
    const data = this._getGridData();
    if (!data) return;

    const ts = performance.now() - this._startTime;
    const isKeyframe =
      this._prevFrameData === null ||
      this._framesSinceKeyframe >= KEYFRAME_INTERVAL;

    if (isKeyframe) {
      // Store a full keyframe
      const copy = new Uint8ClampedArray(data);
      this._frames.push({ type: "key", ts, data: copy });
      this._prevFrameData = copy;
      this._framesSinceKeyframe = 0;
    } else {
      // Store a delta frame
      const delta = encodeDelta(this._prevFrameData!, data);

      // If >50% of cells changed, store a keyframe instead (delta is larger)
      const totalCells = (data.length / 3) | 0;
      if (delta.changedIndices.length > totalCells * 0.5) {
        const copy = new Uint8ClampedArray(data);
        this._frames.push({ type: "key", ts, data: copy });
        this._prevFrameData = copy;
        this._framesSinceKeyframe = 0;
      } else {
        this._frames.push({
          type: "delta",
          ts,
          changedIndices: delta.changedIndices,
          changedValues: delta.changedValues,
        });
        // Update prevFrameData for the next comparison
        this._prevFrameData = new Uint8ClampedArray(data);
        this._framesSinceKeyframe++;
      }
    }
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
    this._reconstructed = null;
    this._reconstructedFrameIdx = -1;
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
    this._reconstructed = null;
    this._reconstructedFrameIdx = -1;
    this._state = "idle";
    this._onStateChange?.("idle");
  }

  private _playbackLoop = (): void => {
    if (this._state !== "playing") return;

    const elapsed = performance.now() - this._playbackStart;
    const totalDuration = this._frames[this._frames.length - 1].ts;

    // Stop at the end when not looping
    if (!this._looping && elapsed >= totalDuration) {
      this._renderFrame(this._frames.length - 1);
      this._state = "idle";
      this._onStateChange?.("idle");
      return;
    }

    // Wrap elapsed time for looping — always search from frame 0 so rewind works
    const effectiveElapsed =
      this._looping && totalDuration > 0 ? elapsed % totalDuration : elapsed;

    let frameIdx = this._looping ? 0 : this._playbackFrame;
    while (
      frameIdx < this._frames.length - 1 &&
      this._frames[frameIdx + 1].ts <= effectiveElapsed
    ) {
      frameIdx++;
    }

    this._renderFrame(frameIdx);
    if (frameIdx !== this._playbackFrame) {
      this._playbackFrame = frameIdx;
      this._onPlaybackFrame?.(frameIdx, this._frames.length);
    }

    this._rafId = requestAnimationFrame(this._playbackLoop);
  };

  /**
   * Reconstruct the full frame at the given index and render it.
   *
   * For keyframes this is a direct copy. For delta frames we need to
   * find the nearest keyframe before `idx` and apply all deltas forward.
   *
   * Optimisation: if the previously reconstructed frame is at `idx - 1`,
   * we only need to apply a single delta (the common forward-playback case).
   */
  private _renderFrame(idx: number): void {
    if (idx < 0 || idx >= this._frames.length) return;
    if (!this._setGridData || !this._redraw) return;

    const gridLen = this._cols * this._rows * 3;
    const frame = this._frames[idx];

    // Ensure we have a reconstruction buffer
    if (!this._reconstructed || this._reconstructed.length !== gridLen) {
      this._reconstructed = new Uint8ClampedArray(gridLen);
      this._reconstructedFrameIdx = -1;
    }

    if (frame.type === "key") {
      // Direct copy from keyframe
      if (frame.data.length === gridLen) {
        this._reconstructed.set(frame.data);
      } else {
        // Different grid size — best-effort copy
        this._reconstructed.fill(0);
        this._copyResized(frame.data, this._reconstructed);
      }
      this._reconstructedFrameIdx = idx;
    } else {
      // Delta frame — need to reconstruct
      if (this._reconstructedFrameIdx === idx - 1) {
        // Fast path: already have previous frame, just apply one delta
        applyDelta(
          this._reconstructed,
          frame.changedIndices,
          frame.changedValues,
        );
        this._reconstructedFrameIdx = idx;
      } else {
        // Slow path: find nearest keyframe and apply deltas forward
        let keyIdx = idx;
        while (keyIdx >= 0 && this._frames[keyIdx].type !== "key") {
          keyIdx--;
        }
        if (keyIdx < 0) return; // should never happen — frame 0 is always key

        const keyFrame = this._frames[keyIdx] as KeyFrame;
        if (keyFrame.data.length === gridLen) {
          this._reconstructed.set(keyFrame.data);
        } else {
          this._reconstructed.fill(0);
          this._copyResized(keyFrame.data, this._reconstructed);
        }

        // Apply deltas from keyIdx+1 to idx
        for (let i = keyIdx + 1; i <= idx; i++) {
          const f = this._frames[i];
          if (f.type === "delta") {
            applyDelta(this._reconstructed, f.changedIndices, f.changedValues);
          } else {
            // Another keyframe encountered (shouldn't happen within interval, but handle it)
            if (f.data.length === gridLen) {
              this._reconstructed.set(f.data);
            } else {
              this._reconstructed.fill(0);
              this._copyResized(f.data, this._reconstructed);
            }
          }
        }
        this._reconstructedFrameIdx = idx;
      }
    }

    this._setGridData(this._reconstructed);
    this._redraw();
  }

  /** Copy data between different grid dimensions (best-effort) */
  private _copyResized(
    src: Uint8ClampedArray,
    dst: Uint8ClampedArray,
  ): void {
    const recCols = this._recCols || this._cols;
    const recRows = this._recRows || this._rows;
    const copyCols = Math.min(this._cols, recCols);
    const copyRows = Math.min(this._rows, recRows);
    const dstCols = this._cols;
    for (let r = 0; r < copyRows; r++) {
      for (let c = 0; c < copyCols; c++) {
        const si = (r * recCols + c) * 3;
        const di = (r * dstCols + c) * 3;
        if (si + 2 < src.length && di + 2 < dst.length) {
          dst[di] = src[si];
          dst[di + 1] = src[si + 1];
          dst[di + 2] = src[si + 2];
        }
      }
    }
  }

  // ── Export / Import ──────────────────────────────────

  /** Export the recording to the v2 delta-compressed format */
  exportToFile(): RecordingFileV2 | null {
    if (this._frames.length === 0) return null;

    const frameSize = this._recCols * this._recRows * 3;

    // Calculate total blob size
    let totalBlobSize = 0;
    for (const frame of this._frames) {
      totalBlobSize += FRAME_HEADER_SIZE;
      if (frame.type === "key") {
        totalBlobSize += frameSize;
      } else {
        totalBlobSize += packedDeltaSize(frame.changedIndices.length);
      }
    }

    const blob = new Uint8Array(totalBlobSize);
    const view = new DataView(blob.buffer);
    let offset = 0;

    for (const frame of this._frames) {
      if (frame.type === "key") {
        // Type
        blob[offset] = FRAME_TYPE_KEY;
        offset += 1;
        // Timestamp
        view.setUint32(offset, Math.round(frame.ts), true);
        offset += 4;
        // Payload length
        view.setUint32(offset, frameSize, true);
        offset += 4;
        // Payload
        blob.set(frame.data.subarray(0, frameSize), offset);
        offset += frameSize;
      } else {
        const packed = packDelta({
          changedIndices: frame.changedIndices,
          changedValues: frame.changedValues,
        });
        // Type
        blob[offset] = FRAME_TYPE_DELTA;
        offset += 1;
        // Timestamp
        view.setUint32(offset, Math.round(frame.ts), true);
        offset += 4;
        // Payload length
        view.setUint32(offset, packed.length, true);
        offset += 4;
        // Payload
        blob.set(packed, offset);
        offset += packed.length;
      }
    }

    return {
      format: "tenix-recording",
      version: 2,
      cols: this._recCols,
      rows: this._recRows,
      captureFps: this._captureFps,
      duration: Math.round(this.duration),
      frameCount: this._frames.length,
      frameBlob: uint8ToBase64(new Uint8ClampedArray(blob.buffer)),
    };
  }

  /** Import a recording from a v1 or v2 file */
  importFromFile(file: RecordingFile): boolean {
    if (file.format !== "tenix-recording") return false;

    if (file.version === 1) {
      return this._importV1(file as RecordingFileV1);
    } else if (file.version === 2) {
      return this._importV2(file as RecordingFileV2);
    }
    return false;
  }

  /** Import legacy v1 full-frame format */
  private _importV1(file: RecordingFileV1): boolean {
    if (!file.frameData || !file.timestamps || file.frameCount === 0)
      return false;

    this.stopPlayback();
    this._stopRecordingInternal();

    const combined = base64ToUint8(file.frameData);
    const frameSize = file.cols * file.rows * 3;
    const frames: RecordedFrame[] = [];

    for (let i = 0; i < file.frameCount; i++) {
      const offset = i * frameSize;
      if (offset + frameSize > combined.length) break;
      frames.push({
        type: "key",
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
    this._reconstructed = null;
    this._reconstructedFrameIdx = -1;
    this._onStateChange?.("idle");

    return true;
  }

  /** Import v2 delta-compressed format */
  private _importV2(file: RecordingFileV2): boolean {
    if (!file.frameBlob || file.frameCount === 0) return false;

    this.stopPlayback();
    this._stopRecordingInternal();

    const blob = base64ToUint8(file.frameBlob);
    const view = new DataView(blob.buffer, blob.byteOffset);
    const frameSize = file.cols * file.rows * 3;
    const frames: RecordedFrame[] = [];

    let offset = 0;
    for (let i = 0; i < file.frameCount; i++) {
      if (offset + FRAME_HEADER_SIZE > blob.length) break;

      const type = blob[offset];
      offset += 1;
      const ts = view.getUint32(offset, true);
      offset += 4;
      const payloadLen = view.getUint32(offset, true);
      offset += 4;

      if (offset + payloadLen > blob.length) break;

      if (type === FRAME_TYPE_KEY) {
        const data = new Uint8ClampedArray(
          blob.buffer,
          blob.byteOffset + offset,
          Math.min(payloadLen, frameSize),
        );
        frames.push({ type: "key", ts, data: new Uint8ClampedArray(data) });
      } else if (type === FRAME_TYPE_DELTA) {
        const packedSlice = new Uint8Array(
          blob.buffer,
          blob.byteOffset + offset,
          payloadLen,
        );
        const delta = unpackDelta(packedSlice);
        frames.push({
          type: "delta",
          ts,
          changedIndices: delta.changedIndices,
          changedValues: delta.changedValues,
        });
      }

      offset += payloadLen;
    }

    this._frames = frames;
    this._recCols = file.cols;
    this._recRows = file.rows;
    this._cols = file.cols;
    this._rows = file.rows;
    this._captureFps = file.captureFps;
    this._state = "idle";
    this._reconstructed = null;
    this._reconstructedFrameIdx = -1;
    this._onStateChange?.("idle");

    return true;
  }

  /** Stop recording without changing state (used internally during import) */
  private _stopRecordingInternal(): void {
    if (this._captureInterval) {
      clearInterval(this._captureInterval);
      this._captureInterval = null;
    }
    this._prevFrameData = null;
    this._framesSinceKeyframe = 0;
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
    this._stopRecordingInternal();
    this._frames = [];
    this._reconstructed = null;
    this._reconstructedFrameIdx = -1;
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
