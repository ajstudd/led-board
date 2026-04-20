import { AnimationConfig, PatternConfig } from "../types";
import { EffectPreset, EffectsEngine } from "./effects";
import { LayerManager } from "./layerManager";

// Type of clip specifies what kind of logic we will apply
export type TimelineClipType = 'animation' | 'pattern' | 'effect' | 'text';

// Provide a union type for the config depending on type
export type TimelineClipConfig = AnimationConfig | PatternConfig | EffectPreset;

export interface TimelineClip {
    id: string;
    type: TimelineClipType;
    config: TimelineClipConfig;
    startTime: number;  // ms from timeline start
    duration: number;   // default duration in ms
    layerId?: string;   // specific layer to affect (optional for effects that are global)
}

export interface TimelineTrack {
    id: string;
    name: string;
    clips: TimelineClip[];
    muted: boolean;
}

export class TimelineManager {
    tracks: TimelineTrack[] = [];
    duration: number = 30000; // Total timeline duration defaults to 30 seconds
    currentTime: number = 0;
    playing: boolean = false;

    private _lastTime: number = 0;
    private _rafId: number = 0;
    private _onRedraw: () => void;
    private _onTimeUpdate?: (timeMs: number) => void;
    
    // For storing stateless backup of layers during playback to prevent additive bleeding
    private _layerSnapshots = new Map<string, Uint8ClampedArray>();

    constructor(onRedraw: () => void, onTimeUpdate?: (timeMs: number) => void) {
        this._onRedraw = onRedraw;
        this._onTimeUpdate = onTimeUpdate;
    }

    public addTrack(name: string): TimelineTrack {
        const id = "track_" + Date.now() + "_" + Math.floor(Math.random() * 1000);
        const t: TimelineTrack = { id, name, clips: [], muted: false };
        this.tracks.push(t);
        return t;
    }

    public removeTrack(trackId: string): void {
        this.tracks = this.tracks.filter(t => t.id !== trackId);
    }

    public addClip(trackId: string, clipData: Omit<TimelineClip, "id">): TimelineClip | null {
        const tr = this.tracks.find(t => t.id === trackId);
        if (!tr) return null;
        const clip: TimelineClip = { ...clipData, id: "clip_" + Date.now() + "_" + Math.floor(Math.random() * 1000) };
        tr.clips.push(clip);
        return clip;
    }

    public removeClip(trackId: string, clipId: string) {
        const tr = this.tracks.find(t => t.id === trackId);
        if (!tr) return;
        tr.clips = tr.clips.filter(c => c.id !== clipId);
    }

    public moveClip(trackId: string, clipId: string, newStartTime: number) {
        const tr = this.tracks.find(t => t.id === trackId);
        if (!tr) return;
        const c = tr.clips.find(c => c.id === clipId);
        if (c) c.startTime = Math.max(0, newStartTime);
    }

    public resizeClip(trackId: string, clipId: string, newDuration: number) {
        const tr = this.tracks.find(t => t.id === trackId);
        if (!tr) return;
        const c = tr.clips.find(c => c.id === clipId);
        if (c) c.duration = Math.max(100, newDuration);
    }

    // ── Engine / Iteration ─────────────────────────────────

    play(layerManager: LayerManager, effectsEngine: EffectsEngine) {
        if (this.playing) return;
        this.playing = true;
        this._lastTime = performance.now();
        
        // Take a pristine snapshot of every layer to fall back upon so pattern / animation doesn't permanently ruin state
        this._snapshotLayers(layerManager);
        
        this._loop(layerManager, effectsEngine);
    }

    pause() {
        if (!this.playing) return;
        this.playing = false;
        cancelAnimationFrame(this._rafId);
    }

    stop(layerManager: LayerManager, effectsEngine: EffectsEngine) {
        this.pause();
        this.currentTime = 0;
        this._onTimeUpdate?.(this.currentTime);
        this._restoreLayers(layerManager);
        effectsEngine.setEnabled(false); // Clean any running effect blocks
        this._onRedraw();
    }

    seek(timeMs: number, layerManager: LayerManager, effectsEngine: EffectsEngine) {
        this.currentTime = Math.max(0, Math.min(timeMs, this.duration));
        this._onTimeUpdate?.(this.currentTime);
        
        // If we are seeking while stopped/paused, tick once to project the exact frame
        this._snapshotLayers(layerManager); // Guarantee we aren't compounding frame data
        this.tick(layerManager, effectsEngine);
        this._onRedraw();
    }

    private _loop = (layerManager: LayerManager, effectsEngine: EffectsEngine) => {
        if (!this.playing) return;

        const now = performance.now();
        const delta = now - this._lastTime;
        this._lastTime = now;

        this.currentTime += delta;

        if (this.currentTime >= this.duration) {
            this.stop(layerManager, effectsEngine);
            return;
        }

        this._onTimeUpdate?.(this.currentTime);
        this.tick(layerManager, effectsEngine);
        this._onRedraw();

        this._rafId = requestAnimationFrame(() => this._loop(layerManager, effectsEngine));
    };

    /**
     * Reconstruct the live composite state based purely on currentTime without relying on the physical loops of Animations
     */
    tick(layerManager: LayerManager, effectsEngine: EffectsEngine) {
        // ALWAYS rollback to standard state so clips overwrite smoothly
        this._restoreLayers(layerManager);
        
        // Default visual effects are disabled unless a global clip states it
        effectsEngine.setEnabled(false);

        const currentActiveClips = this.tracks
            .filter(t => !t.muted)
            .flatMap(t => t.clips)
            .filter(c => this.currentTime >= c.startTime && this.currentTime <= c.startTime + c.duration);

        for (const clip of currentActiveClips) {
            const localMs = this.currentTime - clip.startTime;
            
            // 1. Target correct layer
            const targetLayer = layerManager.layers.find(l => l.id === clip.layerId);
            
            if (clip.type === 'animation' || clip.type === 'text') {
                const ac = clip.config as AnimationConfig;
                if (!targetLayer) continue;
                // local time -> local frame relative to fps
                const frameNum = Math.floor(localMs / (1000 / ac.fps));
                ac.tick(targetLayer.grid.cols, targetLayer.grid.rows, targetLayer.grid.data, frameNum);
            } 
            else if (clip.type === 'pattern') {
                const pc = clip.config as PatternConfig;
                if (!targetLayer) continue;
                // Provide continuous output onto clean layer frame (if static, writes static array, if shader, animates based on some parameter... wait pattern.fn isn't animated natively, it's just drawn)
                pc.fn(targetLayer.grid.cols, targetLayer.grid.rows, targetLayer.grid.data);
            }
            else if (clip.type === 'effect') {
                const ec = clip.config as EffectPreset;
                effectsEngine.setEnabled(true);
                effectsEngine.setPreset(ec);
            }
        }
    }

    private _snapshotLayers(layerManager: LayerManager) {
        for (const layer of layerManager.layers) {
            if (!this._layerSnapshots.has(layer.id)) {
                 this._layerSnapshots.set(layer.id, layer.grid.cloneData());
            }
        }
    }

    private _restoreLayers(layerManager: LayerManager) {
        for (const layer of layerManager.layers) {
            const snap = this._layerSnapshots.get(layer.id);
            if (snap) {
                layer.grid.loadData(snap);
            }
        }
    }
}
