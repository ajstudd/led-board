import {
  RGB,
  ToolKind,
  SerializedBoardState,
  SerializedLayerState,
} from "../types";

export type ActionPlaybackState = "idle" | "recording" | "playing" | "paused";
export type RecordingMode = "action" | "frame";

export type ActionEvent =
  | { t: number; type: "draw"; col: number; row: number; color: RGB }
  | { t: number; type: "erase"; col: number; row: number }
  | { t: number; type: "fill"; col: number; row: number; color: RGB }
  | { t: number; type: "pattern"; name: string }
  | { t: number; type: "animation"; layerId: string; name: string | null; action: "play" | "pause" | "stop"; fps?: number }
  | { t: number; type: "effect"; layerId: string; enabled: boolean; presetName: string; distanceMultiplier: number; speedMultiplier: number }
  | { t: number; type: "effectTrigger"; layerId: string; col: number; row: number; color: RGB }
  | { t: number; type: "physics"; layerId: string; op: "enable" | "disable" | "preset" | "config" | "reset"; preset?: string | null; gravityY?: number; restitution?: number }
  | { t: number; type: "clear" }
  | { t: number; type: "text"; text: string; color: RGB; scale: number; wrap: boolean; animId: string | null }
  | { t: number; type: "palette"; paletteId: string | null }
  | { t: number; type: "tool"; tool: ToolKind }
  | { t: number; type: "color"; color: RGB }
  | { t: number; type: "layer"; action: "sync"; layers: SerializedLayerState[]; activeLayerId: string | null }
  | { t: number; type: "layer"; action: "add"; layer: SerializedLayerState; activeLayerId: string | null }
  | { t: number; type: "layer"; action: "delete"; layerId: string }
  | { t: number; type: "layer"; action: "select"; layerId: string }
  | { t: number; type: "layer"; action: "reorder"; orderedLayerIds: string[] }
  | {
      t: number;
      type: "layer";
      action: "update";
      layerId: string;
      changes: Partial<Pick<SerializedLayerState, "name" | "visible" | "opacity" | "blendMode">>;
    };

export interface ActionRecordingFileV3 {
  format: "tenix-recording";
  version: 3;
  cols: number;
  rows: number;
  cellSize: number;
  duration: number;
  rngSeed: number;
  initialState: SerializedBoardState;
  actions: ActionEvent[];
}

export type RecordedActionInput =
  ActionEvent extends infer T
    ? T extends { t: number }
      ? Omit<T, "t">
      : never
    : never;

export class ActionRecorder {
  private _state: ActionPlaybackState = "idle";
  private _file: ActionRecordingFileV3 | null = null;
  private _recordingStart = 0;

  private _playbackStart = 0;
  private _playbackPauseOffset = 0;
  private _playbackActionIndex = 0;
  private _playbackActionCursor = 0;
  private _rafId = 0;
  private _looping = false;

  private _getInitialState: (() => SerializedBoardState) | null = null;
  private _getSeed: (() => number) | null = null;
  private _restoreState:
    | ((state: SerializedBoardState, seed: number) => void)
    | null = null;
  private _applyAction: ((action: ActionEvent) => void) | null = null;
  private _onStateChange: ((state: ActionPlaybackState) => void) | null = null;
  private _onPlaybackAction:
    | ((index: number, total: number) => void)
    | null = null;

  configure(opts: {
    getInitialState: () => SerializedBoardState;
    getSeed: () => number;
    restoreState: (state: SerializedBoardState, seed: number) => void;
    applyAction: (action: ActionEvent) => void;
    onStateChange?: (state: ActionPlaybackState) => void;
    onPlaybackAction?: (index: number, total: number) => void;
  }): void {
    this._getInitialState = opts.getInitialState;
    this._getSeed = opts.getSeed;
    this._restoreState = opts.restoreState;
    this._applyAction = opts.applyAction;
    this._onStateChange = opts.onStateChange ?? null;
    this._onPlaybackAction = opts.onPlaybackAction ?? null;
  }

  get state(): ActionPlaybackState {
    return this._state;
  }

  get actionCount(): number {
    return this._file?.actions.length ?? 0;
  }

  get duration(): number {
    return this._file?.duration ?? 0;
  }

  get hasRecording(): boolean {
    return !!this._file && this._file.actions.length > 0;
  }

  get playbackActionIndex(): number {
    return this._playbackActionIndex;
  }

  get looping(): boolean {
    return this._looping;
  }

  setLooping(value: boolean): void {
    this._looping = value;
  }

  startRecording(): void {
    if (!this._getInitialState || !this._getSeed) return;
    if (this._state === "recording") return;

    this.stopPlayback();
    const initialState = this._getInitialState();
    const seed = this._getSeed();

    this._file = {
      format: "tenix-recording",
      version: 3,
      cols: initialState.cols,
      rows: initialState.rows,
      cellSize: initialState.cellSize,
      duration: 0,
      rngSeed: seed,
      initialState,
      actions: [],
    };

    this._recordingStart = performance.now();
    this._state = "recording";
    this._onStateChange?.("recording");
  }

  stopRecording(): void {
    if (this._state !== "recording" || !this._file) return;
    this._file.duration = Math.max(
      this._file.duration,
      Math.round(performance.now() - this._recordingStart),
    );
    this._state = "idle";
    this._onStateChange?.("idle");
  }

  record(action: RecordedActionInput): void {
    if (this._state !== "recording" || !this._file) return;
    const t = Math.round(performance.now() - this._recordingStart);
    this._file.actions.push({ ...action, t } as ActionEvent);
    this._file.duration = t;
  }

  exportToFile(): ActionRecordingFileV3 | null {
    if (!this._file) return null;
    return {
      ...this._file,
      actions: this._file.actions.map((action) => ({ ...action })),
    };
  }

  importFromFile(file: ActionRecordingFileV3): boolean {
    if (file.format !== "tenix-recording" || file.version !== 3) return false;
    this.stopPlayback();
    this._state = "idle";
    this._file = {
      ...file,
      actions: file.actions.map((action) => ({ ...action })),
    };
    this._onStateChange?.("idle");
    return true;
  }

  startPlayback(loop = false): void {
    if (!this._file || !this._restoreState || !this._applyAction) return;
    if (this._state === "playing") return;

    this._looping = loop;

    if (this._state === "paused") {
      this._playbackStart = performance.now() - this._playbackPauseOffset;
      this._state = "playing";
      this._onStateChange?.("playing");
      this._rafId = requestAnimationFrame(this._playbackLoop);
      return;
    }

    this._restoreState(this._file.initialState, this._file.rngSeed);
    this._playbackActionIndex = 0;
    this._playbackActionCursor = 0;
    this._playbackPauseOffset = 0;
    this._playbackStart = performance.now();
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
    this._playbackActionIndex = 0;
    this._playbackActionCursor = 0;
    this._playbackPauseOffset = 0;
    this._state = "idle";
    this._onStateChange?.("idle");
  }

  clear(): void {
    this.stopPlayback();
    this._file = null;
    this._state = "idle";
    this._onStateChange?.("idle");
  }

  downloadRecording(filename?: string): void {
    const file = this.exportToFile();
    if (!file) return;

    const blob = new Blob([JSON.stringify(file)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename ?? `tenix-recording-${Date.now()}.tenix-rec`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }

  async loadFromFileInput(file: File): Promise<boolean> {
    try {
      const parsed = JSON.parse(await file.text()) as ActionRecordingFileV3;
      return this.importFromFile(parsed);
    } catch {
      return false;
    }
  }

  private _playbackLoop = (): void => {
    if (!this._file || this._state !== "playing" || !this._applyAction || !this._restoreState) {
      return;
    }

    const elapsed = performance.now() - this._playbackStart;
    const total = this._file.duration;

    while (
      this._playbackActionCursor < this._file.actions.length &&
      this._file.actions[this._playbackActionCursor].t <= elapsed
    ) {
      const action = this._file.actions[this._playbackActionCursor];
      this._applyAction(action);
      this._playbackActionIndex = this._playbackActionCursor;
      this._onPlaybackAction?.(this._playbackActionCursor, this._file.actions.length);
      this._playbackActionCursor++;
    }

    if (elapsed >= total) {
      if (this._looping) {
        this._restoreState(this._file.initialState, this._file.rngSeed);
        this._playbackActionIndex = 0;
        this._playbackActionCursor = 0;
        this._playbackPauseOffset = 0;
        this._playbackStart = performance.now();
        this._rafId = requestAnimationFrame(this._playbackLoop);
        return;
      }

      this._state = "idle";
      this._onStateChange?.("idle");
      return;
    }

    this._rafId = requestAnimationFrame(this._playbackLoop);
  };
}

export const actionRecorder = new ActionRecorder();
