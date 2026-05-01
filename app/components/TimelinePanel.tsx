import React, { useState, useRef, useMemo } from "react";
import { TimelineTrack, TimelineClip, TimelineClipType, TimelineClipConfig } from "../lib/timelineManager";
import { Layer } from "../lib/layerManager";
import { AnimationConfig, PatternConfig } from "../types";
import { TEXT_ANIMATIONS } from "../lib/textAnimations";
import { ANIMATIONS } from "../lib/animations";
import { PATTERNS } from "../lib/patterns";
import { EFFECT_PRESETS, EffectPreset } from "../lib/effects";

interface TimelinePanelProps {
    currentTime: number;
    duration: number;
    isPlaying: boolean;
    tracks: TimelineTrack[];
    layers: Layer[];
    
    onPlay: () => void;
    onPause: () => void;
    onStop: () => void;
    onSeek: (timeMs: number) => void;
    
    onAddTrack: (name: string) => void;
    onAddClip: (trackId: string, clipData: Omit<TimelineClip, "id">) => void;
    onMoveClip: (trackId: string, clipId: string, newStartTime: number) => void;
    onResizeClip: (trackId: string, clipId: string, newDuration: number) => void;
    onDeleteClip: (trackId: string, clipId: string) => void;
    
    onClose: () => void;
}

export default function TimelinePanel({
    currentTime,
    duration,
    isPlaying,
    tracks,
    layers,
    onPlay,
    onPause,
    onStop,
    onSeek,
    onAddTrack,
    onAddClip,
    onMoveClip,
    onResizeClip,
    onDeleteClip,
    onClose
}: TimelinePanelProps) {
    const scale = 0.05; // pixels per ms. 1000ms = 50px

    const containerRef = useRef<HTMLDivElement>(null);

    const formatTime = (ms: number) => {
        const total = Math.floor(ms / 1000);
        const m = Math.floor(total / 60);
        const s = total % 60;
        const frames = Math.floor((ms % 1000) / (1000/30));
        return `${m}:${s.toString().padStart(2, "0")}:${frames.toString().padStart(2, "0")}`;
    };

    const handleScrub = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        // The ruler starts 150px from left (because of track headers)
        const x = e.clientX - rect.left - 150;
        const time = Math.max(0, x / scale);
        onSeek(time);
    };

    // ── Drag & Drop State ───────────────────────
    const [draggingId, setDraggingId] = useState<string | null>(null);

    const startDrag = (e: React.MouseEvent, clipId: string, mode: "move" | "resize", initialMs: number) => {
        e.stopPropagation();
        setDraggingId(clipId);

        const onMouseMove = (moveEvent: MouseEvent) => {
            const dx = moveEvent.clientX - e.clientX;
            const deltaMs = dx / scale;
            if (mode === "move") {
                // Find track
                for (const t of tracks) {
                    if (t.clips.some(c => c.id === clipId)) {
                        onMoveClip(t.id, clipId, initialMs + deltaMs);
                        break;
                    }
                }
            } else if (mode === "resize") {
                for (const t of tracks) {
                    if (t.clips.some(c => c.id === clipId)) {
                        onResizeClip(t.id, clipId, initialMs + deltaMs); // initialMs here signifies initial Duration
                        break;
                    }
                }
            }
        };

        const onMouseUp = () => {
            setDraggingId(null);
            document.removeEventListener("mousemove", onMouseMove);
            document.removeEventListener("mouseup", onMouseUp);
        };

        document.addEventListener("mousemove", onMouseMove);
        document.addEventListener("mouseup", onMouseUp);
    };

    // ── Pre-defined library ──────────────────────
    const allPresets = useMemo(() => {
        return {
            text: TEXT_ANIMATIONS.map(a => ({ name: a.name, val: a, type: 'text' as TimelineClipType })),
            anim: ANIMATIONS.map(a => ({ name: a.name, val: a, type: 'animation' as TimelineClipType })),
            pattern: PATTERNS.map(p => ({
                name: p.name,
                val: { name: p.name, fn: p.apply } as PatternConfig,
                type: 'pattern' as TimelineClipType
            })),
            effect: EFFECT_PRESETS.map(e => ({ name: e.name, val: e, type: 'effect' as TimelineClipType })),
        };
    }, []);

    const [selectedLibraryItem, setSelectedLibraryItem] = useState<{type: TimelineClipType, name: string}>({ type: 'animation', name: ANIMATIONS[0].name });
    const [selectedLayerId, setSelectedLayerId] = useState<string>(layers[0]?.id || "");

    const handleAddClipBtn = (trackId: string) => {
        let config: TimelineClipConfig | null = null;
        if (selectedLibraryItem.type === 'text') config = allPresets.text.find(a => a.name === selectedLibraryItem.name)?.val as AnimationConfig;
        if (selectedLibraryItem.type === 'animation') config = allPresets.anim.find(a => a.name === selectedLibraryItem.name)?.val as AnimationConfig;
        if (selectedLibraryItem.type === 'pattern') config = allPresets.pattern.find(p => p.name === selectedLibraryItem.name)?.val ?? null;
        if (selectedLibraryItem.type === 'effect') config = allPresets.effect.find(e => e.name === selectedLibraryItem.name)?.val as EffectPreset;

        if (config) {
            onAddClip(trackId, {
                type: selectedLibraryItem.type,
                config,
                startTime: currentTime,
                duration: 2000,
                layerId: selectedLayerId || undefined
            });
        }
    };

    return (
        <div className="absolute inset-x-0 bottom-0 h-64 bg-slate-900 border-t border-slate-700 flex flex-col z-50 overflow-hidden shadow-[0_-10px_40px_rgba(0,0,0,0.5)]">
            
            {/* Toolbar */}
            <div className="flex items-center justify-between px-4 py-2 bg-slate-800 border-b border-slate-700">
                <div className="flex items-center gap-4">
                    <span className="font-semibold text-white/90 text-sm tracking-wide">TIMELINE</span>
                    
                    <div className="flex bg-slate-900 rounded-md p-0.5 border border-slate-700">
                        {isPlaying ? (
                            <button onClick={onPause} className="p-1 px-3 hover:bg-slate-700 rounded text-amber-400">⏸</button>
                        ) : (
                            <button onClick={onPlay} className="p-1 px-3 hover:bg-slate-700 rounded text-emerald-400">▶</button>
                        )}
                        <button onClick={onStop} className="p-1 px-3 hover:bg-slate-700 rounded text-rose-400">⏹</button>
                    </div>

                    <div className="text-xs font-mono text-slate-400 bg-black/40 px-3 py-1 rounded">
                        {formatTime(currentTime)} / {formatTime(duration)}
                    </div>

                    <div className="h-4 w-px bg-slate-700 mx-1"></div>
                    
                    <button onClick={() => onAddTrack("New Track")} className="text-xs bg-slate-700 hover:bg-slate-600 px-3 py-1 rounded text-white">+ Track</button>
                    
                    <div className="flex items-center gap-2 ml-4">
                        <select 
                            className="bg-slate-900 text-xs text-white border border-slate-700 rounded px-2 py-1"
                            value={`${selectedLibraryItem.type}:${selectedLibraryItem.name}`}
                            onChange={(e) => {
                                const [t, n] = e.target.value.split(":");
                                setSelectedLibraryItem({ type: t as TimelineClipType, name: n });
                            }}
                        >
                            <optgroup label="Animations">
                                {allPresets.anim.map(a => <option key={`animation:${a.name}`} value={`animation:${a.name}`}>{a.name}</option>)}
                            </optgroup>
                            <optgroup label="Text FX">
                                {allPresets.text.map(a => <option key={`text:${a.name}`} value={`text:${a.name}`}>{a.name}</option>)}
                            </optgroup>
                            <optgroup label="Patterns">
                                {allPresets.pattern.map(p => <option key={`pattern:${p.name}`} value={`pattern:${p.name}`}>{p.name}</option>)}
                            </optgroup>
                            <optgroup label="Effects">
                                {allPresets.effect.map(e => <option key={`effect:${e.name}`} value={`effect:${e.name}`}>{e.name}</option>)}
                            </optgroup>
                        </select>
                        <span className="text-slate-500 text-xs">on Layer</span>
                        <select 
                            className="bg-slate-900 text-xs text-white border border-slate-700 rounded px-2 py-1"
                            value={selectedLayerId}
                            onChange={(e) => setSelectedLayerId(e.target.value)}
                        >
                            <option value="">(Global / No Layer)</option>
                            {layers.map(l => (
                                <option key={l.id} value={l.id}>{l.name}</option>
                            ))}
                        </select>
                    </div>
                </div>
                
                <button onClick={onClose} className="text-slate-400 hover:text-white p-1">✕</button>
            </div>

            {/* Tracks Area */}
            <div className="flex-1 flex overflow-auto relative" ref={containerRef}>
                {/* Track Headers (Left sidebar) */}
                <div className="w-[150px] flex-shrink-0 bg-slate-800 border-r border-slate-700 z-10 sticky left-0">
                    <div className="h-6 bg-slate-800/50 border-b border-slate-700"></div> {/* Ruler corner */}
                    
                    {tracks.map(t => (
                        <div key={t.id} className="h-14 border-b border-slate-700 flex flex-col justify-center px-3 group relative bg-slate-800">
                            <span className="text-xs text-slate-300 font-medium truncate">{t.name}</span>
                            <div className="text-[10px] text-slate-500 flex gap-2 mt-1">
                                <button className="hover:text-white">Mute</button>
                            </div>
                            <button 
                                onClick={() => handleAddClipBtn(t.id)}
                                className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 bg-slate-700 hover:bg-slate-600 text-white text-xs px-2 py-0.5 rounded transition"
                                title="Add Selected Clip to Track"
                            >
                                + Clip
                            </button>
                        </div>
                    ))}
                </div>

                {/* Timeline Grid (Right side scrollable) */}
                <div className="flex-1 relative min-w-max">
                    {/* Ruler */}
                    <div 
                        className="h-6 border-b border-slate-700 sticky top-0 bg-slate-900/90 backdrop-blur z-20 cursor-text overflow-hidden"
                        onMouseDown={handleScrub}
                    >
                        {Array.from({ length: Math.ceil(duration / 1000) + 1 }).map((_, i) => (
                            <div key={i} className="absolute top-0 bottom-0 border-l border-slate-700/50" style={{ left: i * 1000 * scale }}>
                                <span className="text-[9px] text-slate-500 ml-1">{i}s</span>
                            </div>
                        ))}
                    </div>

                    {/* Tracks */}
                    {tracks.map(t => (
                        <div key={t.id} className="h-14 border-b border-slate-700 relative group">
                            {t.clips.map(c => {
                                const isDragging = draggingId === c.id;
                                const isEffect = c.type === 'effect';
                                const bgClass = isEffect ? 'bg-fuchsia-600/40 border-fuchsia-500' : 
                                                c.type === 'pattern' ? 'bg-amber-600/40 border-amber-500' :
                                                c.type === 'text' ? 'bg-cyan-600/40 border-cyan-500' :
                                                'bg-indigo-600/40 border-indigo-500';

                                return (
                                    <div 
                                        key={c.id} 
                                        className={`absolute top-2 bottom-2 border rounded-sm flex items-center px-2 cursor-grab active:cursor-grabbing hover:brightness-110 ${bgClass} ${isDragging ? 'opacity-80 z-20 shadow-lg' : 'z-10'}`}
                                        style={{ 
                                            left: c.startTime * scale, 
                                            width: Math.max(10, c.duration * scale) 
                                        }}
                                        onMouseDown={(e) => startDrag(e, c.id, "move", c.startTime)}
                                    >
                                        <span className="text-[10px] font-medium text-white/90 truncate pointer-events-none select-none">
                                            {c.config.name}
                                        </span>
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); onDeleteClip(t.id, c.id); }}
                                            className="absolute right-1 text-white/40 hover:text-white pointer-events-auto"
                                        >✕</button>
                                        
                                        {/* Resize Handle */}
                                        <div 
                                            className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-white/20"
                                            onMouseDown={(e) => startDrag(e, c.id, "resize", c.duration)}
                                        />
                                    </div>
                                )
                            })}
                        </div>
                    ))}

                    {/* Playhead */}
                    <div 
                        className="absolute top-0 bottom-0 w-px bg-red-500 z-30 pointer-events-none"
                        style={{ left: currentTime * scale }}
                    >
                        <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2.5 h-2.5 bg-red-500 rotate-45 transform origin-bottom border border-red-900 shadow-md"></div>
                    </div>
                </div>
            </div>
        </div>
    );
}
