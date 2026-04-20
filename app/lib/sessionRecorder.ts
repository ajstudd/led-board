/**
 * SessionRecorder — event-based recording system that captures user
 * interactions (cell changes, clears, tool actions) instead of raw frame
 * data.  This produces recordings that are typically ~100-1000x smaller
 * than the old frame-by-frame approach.
 *
 * During recording, the recorder watches for grid changes by comparing
 * the current grid to a shadow buffer and emitting delta events.
 * 
 * During playback, the recorder replays those events onto a blank grid,
 * faithfully reproducing the user's drawing session.
 *
 * File format (.tenix-rec):
 *   JSON wrapper with metadata + compact event array.
 *   Version 2 = event-based, Version 1 = legacy frame-based.
 */

import { uint8ToBase64, base64ToUint8 } from "./utils";

// ── Types ────────────────────────────────────────────────

/** A single cell-change event: col, row, r, g, b */
export interface CellEvent {
  /** Milliseconds since recording started */
  t: number;
  /** Column */
  c: number;
  /** Row */
  r: number;
  /** RGB color */
  rgb: [number, number, number];
}

/** A batch of changes at a specific timestamp */
export interface EventBatch {
  /** Milliseconds since recording started */
  t: number;
  /** 'cells' = individual cell changes, 'clear' = grid was cleared, 'snapshot' = full grid  */
  type: "cells" | "clear" | "snapshot";
  /** For 'cells': array of [col, row, r, g, b] */
  cells?: number[][];
  /** For 'snapshot': base64-encoded grid data */
  data?: string;
}

export interface RecordingData {
  /** Grid column count at capture time */
  cols: number;
  /** Grid row count at capture time */
  rows: number;
  /** Capture FPS (delta scan rate) */
  captureFps: number;
  /** All event batches */
  events: EventBatch[];
  /** Total duration in ms */
  duration: number;
}

// ── Legacy types for backward compatibility ─────────────

export interface RecordedFrame {
  ts: number;
  data: Uint8ClampedArray;
}

/** Serialisable format for export / import */
export interface RecordingFile {
  /** Format identifier */
  format: "tenix-recording";
  /** Format version: 1 = legacy frame-based, 2 = event-based */
  version: 1 | 2;
  cols: number;
  rows: number;
  captureFps: number;
  duration: number;
  /** V1 only: number of frames */
  frameCount?: number;
  /** V1 only: base64-encoded concatenation of all frame data buffers */
  frameData?: string;
  /** V1 only: Array of timestamps (ms) for each frame */
  timestamps?: number[];
  /** V2 only: event batches */
  events?: EventBatch[];
}

export type RecordingState = "idle" | "recording" | "playing" | "paused";

// ── SessionRecorder class ────────────────────────────────

export class SessionRecorder {
  private _state: RecordingState = "idle";

  // Recording state
  private _events: EventBatch[] = [];
  private _cols = 0;
  private _rows = 0;
  private _recCols = 0;
  private _recRows = 0;
  private _captureFps = 15; // Lower FPS since we're just scanning for deltas
  private _captureInterval: ReturnType<typeof setInterval> | null = null;
  private _startTime = 0;
  private _shadowGrid: Uint8ClampedArray | null = null;

  // Playback state
  private _playbackStart = 0;
  private _playbackPauseOffset = 0;
  private _rafId = 0;
  private _playbackEventIdx = 0;
  private _looping = false;
  private _playbackGrid: Uint8ClampedArray | null = null;

  // Legacy playback (for v1 imports)
  private _legacyFrames: RecordedFrame[] = [];

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
    return this._events.length || this._legacyFrames.length;
  }

  get duration(): number {
    if (this._events.length > 0) {
      return this._events[this._events.length - 1].t;
    }
    if (this._legacyFrames.length > 0) {
      return this._legacyFrames[this._legacyFrames.length - 1].ts;
    }
    return 0;
  }

  get hasRecording(): boolean {
    return this._events.length > 0 || this._legacyFrames.length > 0;
  }

  get playbackFrame(): number {
    return this._playbackEventIdx;
  }

  get looping(): boolean {
    return this._looping;
  }

  /** Set looping on/off — can be called even during playback */
  setLooping(v: boolean): void {
    this._looping = v;
  }

  // ── Recording ────────────────────────────────────────

  startRecording(): void {
    if (this._state === "recording") return;
    this.stopPlayback();

    this._events = [];
    this._legacyFrames = [];
    this._recCols = this._cols;
    this._recRows = this._rows;
    this._startTime = performance.now();
    this._state = "recording";
    this._onStateChange?.("recording");

    // Take initial snapshot of the grid
    const gridData = this._getGridData?.();
    if (gridData) {
      this._shadowGrid = new Uint8ClampedArray(gridData);
      // Store the initial state as a compressed snapshot event
      this._events.push({
        t: 0,
        type: "snapshot",
        data: uint8ToBase64(gridData),
      });
    }

    // Periodically scan for deltas
    const interval = 1000 / this._captureFps;
    this._captureInterval = setInterval(() => {
      this._captureDelta();
    }, interval);
  }

  stopRecording(): void {
    if (this._state !== "recording") return;

    if (this._captureInterval) {
      clearInterval(this._captureInterval);
      this._captureInterval = null;
    }

    // Capture final delta
    this._captureDelta();
    this._shadowGrid = null;

    this._state = "idle";
    this._onStateChange?.("idle");
  }

  /** Scan the grid for changes since last capture and emit delta events */
  private _captureDelta(): void {
    if (!this._getGridData || !this._shadowGrid) return;
    const data = this._getGridData();
    if (!data) return;

    const ts = performance.now() - this._startTime;
    const cols = this._recCols;
    const rows = this._recRows;
    const total = cols * rows;
    const changes: number[][] = [];

    // Check if the grid was completely cleared (all zero)
    let allZero = true;
    let shadowAllZero = true;
    for (let i = 0; i < data.length; i += 3) {
      if (data[i] !== 0 || data[i + 1] !== 0 || data[i + 2] !== 0) {
        allZero = false;
        break;
      }
    }
    if (!allZero) shadowAllZero = false;
    else {
      for (let i = 0; i < this._shadowGrid.length; i += 3) {
        if (this._shadowGrid[i] !== 0 || this._shadowGrid[i + 1] !== 0 || this._shadowGrid[i + 2] !== 0) {
          shadowAllZero = false;
          break;
        }
      }
    }

    // If grid went from non-empty to all-zero, emit a 'clear' event
    if (allZero && !shadowAllZero) {
      this._events.push({ t: Math.round(ts), type: "clear" });
      this._shadowGrid.set(data);
      return;
    }

    // Compare each cell to detect changes
    for (let idx = 0; idx < total; idx++) {
      const i = idx * 3;
      if (
        data[i] !== this._shadowGrid[i] ||
        data[i + 1] !== this._shadowGrid[i + 1] ||
        data[i + 2] !== this._shadowGrid[i + 2]
      ) {
        const col = idx % cols;
        const row = Math.floor(idx / cols);
        changes.push([col, row, data[i], data[i + 1], data[i + 2]]);
      }
    }

    if (changes.length > 0) {
      // If more than 50% of cells changed, store as a snapshot instead
      if (changes.length > total * 0.5) {
        this._events.push({
          t: Math.round(ts),
          type: "snapshot",
          data: uint8ToBase64(data),
        });
      } else {
        this._events.push({
          t: Math.round(ts),
          type: "cells",
          cells: changes,
        });
      }
      this._shadowGrid.set(data);
    }
  }

  // ── Playback ─────────────────────────────────────────

  startPlayback(loop = false): void {
    const hasEvents = this._events.length > 0;
    const hasLegacy = this._legacyFrames.length > 0;
    if (!hasEvents && !hasLegacy) return;
    if (this._state === "playing") return;

    this._looping = loop;

    if (this._state === "paused") {
      // Resume from pause
      this._playbackStart = performance.now() - this._playbackPauseOffset;
      this._state = "playing";
      this._onStateChange?.("playing");
      this._rafId = requestAnimationFrame(
        hasLegacy && !hasEvents ? this._legacyPlaybackLoop : this._playbackLoop,
      );
      return;
    }

    // Fresh start
    this._playbackStart = performance.now();
    this._playbackPauseOffset = 0;
    this._playbackEventIdx = 0;
    this._state = "playing";
    this._onStateChange?.("playing");

    if (hasLegacy && !hasEvents) {
      // Legacy v1 playback
      this._rafId = requestAnimationFrame(this._legacyPlaybackLoop);
    } else {
      // Initialize playback grid
      this._playbackGrid = new Uint8ClampedArray(this._cols * this._rows * 3);
      this._rafId = requestAnimationFrame(this._playbackLoop);
    }
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
    this._playbackEventIdx = 0;
    this._playbackPauseOffset = 0;
    this._playbackGrid = null;
    this._state = "idle";
    this._onStateChange?.("idle");
  }

  /** Event-based playback loop */
  private _playbackLoop = (): void => {
    if (this._state !== "playing") return;
    if (!this._setGridData || !this._redraw || !this._playbackGrid) return;

    const elapsed = performance.now() - this._playbackStart;
    const totalDuration = this._events[this._events.length - 1].t;

    // Handle end of playback
    if (!this._looping && elapsed >= totalDuration) {
      // Apply all remaining events
      this._applyEventsUpTo(totalDuration);
      this._setGridData(this._playbackGrid);
      this._redraw();
      this._state = "idle";
      this._onStateChange?.("idle");
      return;
    }

    const effectiveElapsed =
      this._looping && totalDuration > 0 ? elapsed % totalDuration : elapsed;

    // On loop reset, restart from scratch
    if (this._looping && effectiveElapsed < (this._events[this._playbackEventIdx]?.t ?? 0)) {
      this._playbackEventIdx = 0;
      this._playbackGrid.fill(0);
    }

    this._applyEventsUpTo(effectiveElapsed);
    this._setGridData(this._playbackGrid);
    this._redraw();

    this._onPlaybackFrame?.(this._playbackEventIdx, this._events.length);
    this._rafId = requestAnimationFrame(this._playbackLoop);
  };

  /** Apply all events up to the given timestamp */
  private _applyEventsUpTo(timeMs: number): void {
    if (!this._playbackGrid) return;
    const cols = this._recCols || this._cols;

    while (
      this._playbackEventIdx < this._events.length &&
      this._events[this._playbackEventIdx].t <= timeMs
    ) {
      const evt = this._events[this._playbackEventIdx];

      switch (evt.type) {
        case "clear":
          this._playbackGrid.fill(0);
          break;

        case "snapshot":
          if (evt.data) {
            const decoded = base64ToUint8(evt.data);
            if (decoded.length === this._playbackGrid.length) {
              this._playbackGrid.set(decoded);
            } else {
              // Handle size mismatch — copy what we can
              const copyLen = Math.min(decoded.length, this._playbackGrid.length);
              for (let i = 0; i < copyLen; i++) {
                this._playbackGrid[i] = decoded[i];
              }
            }
          }
          break;

        case "cells":
          if (evt.cells) {
            for (const cell of evt.cells) {
              const [c, r, rv, gv, bv] = cell;
              if (c >= 0 && c < (this._recCols || this._cols) && r >= 0 && r < (this._recRows || this._rows)) {
                const idx = (r * cols + c) * 3;
                if (idx + 2 < this._playbackGrid.length) {
                  this._playbackGrid[idx] = rv;
                  this._playbackGrid[idx + 1] = gv;
                  this._playbackGrid[idx + 2] = bv;
                }
              }
            }
          }
          break;
      }

      this._playbackEventIdx++;
    }
  }

  /** Legacy v1 frame-based playback loop (for imported v1 recordings) */
  private _legacyPlaybackLoop = (): void => {
    if (this._state !== "playing") return;

    const elapsed = performance.now() - this._playbackStart;
    const totalDuration = this._legacyFrames[this._legacyFrames.length - 1].ts;

    if (!this._looping && elapsed >= totalDuration) {
      this._renderLegacyFrame(this._legacyFrames.length - 1);
      this._state = "idle";
      this._onStateChange?.("idle");
      return;
    }

    const effectiveElapsed =
      this._looping && totalDuration > 0 ? elapsed % totalDuration : elapsed;

    let frameIdx = this._looping ? 0 : this._playbackEventIdx;
    while (
      frameIdx < this._legacyFrames.length - 1 &&
      this._legacyFrames[frameIdx + 1].ts <= effectiveElapsed
    ) {
      frameIdx++;
    }

    this._renderLegacyFrame(frameIdx);
    if (frameIdx !== this._playbackEventIdx) {
      this._playbackEventIdx = frameIdx;
      this._onPlaybackFrame?.(frameIdx, this._legacyFrames.length);
    }

    this._rafId = requestAnimationFrame(this._legacyPlaybackLoop);
  };

  private _renderLegacyFrame(idx: number): void {
    if (idx < 0 || idx >= this._legacyFrames.length) return;
    const frame = this._legacyFrames[idx];
    if (!this._setGridData || !this._redraw) return;

    const gridLen = this._cols * this._rows * 3;
    if (frame.data.length === gridLen) {
      this._setGridData(frame.data);
    } else {
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

  /** Export the recording to a JSON-serialisable object (v2 format) */
  exportToFile(): RecordingFile | null {
    if (this._events.length === 0 && this._legacyFrames.length === 0) return null;

    // If we have legacy frames only, export in v1 format for compatibility
    if (this._legacyFrames.length > 0 && this._events.length === 0) {
      return this._exportLegacy();
    }

    return {
      format: "tenix-recording",
      version: 2,
      cols: this._recCols,
      rows: this._recRows,
      captureFps: this._captureFps,
      duration: Math.round(this.duration),
      events: this._events,
    };
  }

  /** Legacy v1 export for backward compatibility */
  private _exportLegacy(): RecordingFile | null {
    if (this._legacyFrames.length === 0) return null;
    const frameSize = this._recCols * this._recRows * 3;
    const totalBytes = this._legacyFrames.length * frameSize;
    const combined = new Uint8Array(totalBytes);
    const timestamps: number[] = [];

    for (let i = 0; i < this._legacyFrames.length; i++) {
      combined.set(this._legacyFrames[i].data, i * frameSize);
      timestamps.push(Math.round(this._legacyFrames[i].ts));
    }

    return {
      format: "tenix-recording",
      version: 1,
      cols: this._recCols,
      rows: this._recRows,
      captureFps: this._captureFps,
      duration: Math.round(this.duration),
      frameCount: this._legacyFrames.length,
      frameData: uint8ToBase64(new Uint8ClampedArray(combined.buffer)),
      timestamps,
    };
  }

  /** Import a recording from a previously exported file */
  importFromFile(file: RecordingFile): boolean {
    if (file.format !== "tenix-recording") return false;

    this.stopPlayback();
    this.stopRecording();

    if (file.version === 2 && file.events) {
      // V2: event-based
      this._events = file.events;
      this._legacyFrames = [];
    } else if (file.version === 1 && file.frameData && file.timestamps && file.frameCount) {
      // V1: legacy frame-based — import into legacy frames array
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

      this._legacyFrames = frames;
      this._events = [];
    } else {
      return false;
    }

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
    this._events = [];
    this._legacyFrames = [];
    this._shadowGrid = null;
    this._playbackGrid = null;
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
