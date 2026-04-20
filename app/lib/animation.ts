import { AnimationConfig } from "../types";

export type AnimationState = "stopped" | "playing" | "paused";

/**
 * AnimationManager — drives a requestAnimationFrame-based loop
 * with adjustable FPS (1–60).
 *
 * Usage:
 *   const mgr = new AnimationManager(redraw);
 *   mgr.load(someAnimation, cols, rows, data);
 *   mgr.play();
 *   mgr.pause();
 *   mgr.stop();
 */
export class AnimationManager {
  private _state: AnimationState = "stopped";
  private _fps = 15;
  private _frame = 0;
  private _rafId = 0;
  private _lastTime = 0;

  private _animation: AnimationConfig | null = null;
  private _cols = 0;
  private _rows = 0;
  private _data: Uint8ClampedArray | null = null;
  private _redraw: () => void;
  private _onStateChange?: (state: AnimationState) => void;
  private _onFrameChange?: (frame: number) => void;

  constructor(
    redraw: () => void,
    onStateChange?: (state: AnimationState) => void,
    onFrameChange?: (frame: number) => void
  ) {
    this._redraw = redraw;
    this._onStateChange = onStateChange;
    this._onFrameChange = onFrameChange;
  }

  // ── Public getters ────────────────────────────────────

  get state(): AnimationState {
    return this._state;
  }

  get fps(): number {
    return this._fps;
  }

  get frame(): number {
    return this._frame;
  }

  get currentAnimation(): AnimationConfig | null {
    return this._animation;
  }

  // ── Configure ─────────────────────────────────────────

  /** Load an animation and bind it to grid data */
  load(
    animation: AnimationConfig,
    cols: number,
    rows: number,
    data: Uint8ClampedArray,
  ): void {
    this.stop();
    this._animation = animation;
    this._cols = cols;
    this._rows = rows;
    this._data = data;
    this._fps = animation.fps;
    this._frame = 0;
  }

  /** Update the grid reference (e.g. after resize) */
  updateGrid(cols: number, rows: number, data: Uint8ClampedArray): void {
    this._cols = cols;
    this._rows = rows;
    this._data = data;
  }

  /** Set frames-per-second (clamped 1–60) */
  setFps(fps: number): void {
    this._fps = Math.max(1, Math.min(60, fps));
  }

  // ── Playback controls ─────────────────────────────────

  play(): void {
    if (!this._animation || !this._data) return;
    if (this._state === "playing") return;

    this._state = "playing";
    this._lastTime = performance.now();
    this._onStateChange?.("playing");
    this._loop(this._lastTime);
  }

  pause(): void {
    if (this._state !== "playing") return;
    cancelAnimationFrame(this._rafId);
    this._state = "paused";
    this._onStateChange?.("paused");
  }

  stop(): void {
    cancelAnimationFrame(this._rafId);
    this._state = "stopped";
    this._frame = 0;
    this._onStateChange?.("stopped");
  }

  /** Clean up (call on unmount) */
  destroy(): void {
    cancelAnimationFrame(this._rafId);
    this._animation = null;
    this._data = null;
  }

  // ── Internal loop ─────────────────────────────────────

  private _loop = (now: number): void => {
    if (this._state !== "playing") return;

    const interval = 1000 / this._fps;
    const delta = now - this._lastTime;

    if (delta >= interval) {
      this._lastTime = now - (delta % interval);
      this._tick();
    }

    this._rafId = requestAnimationFrame(this._loop);
  };

  private _tick(): void {
    if (!this._animation || !this._data) return;
    this._animation.tick(this._cols, this._rows, this._data, this._frame);
    this._onFrameChange?.(this._frame);
    this._frame++;
    this._redraw();
  }
}
