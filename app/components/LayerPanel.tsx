"use client";

import { LayerManager } from "../lib/layerManager";

interface LayerPanelProps {
    layerManager: LayerManager | null;
    onLayerChange: () => void;
}

function StatusPill({
    label,
    tone,
}: {
    label: string;
    tone: "green" | "amber" | "fuchsia";
}) {
    const toneClass = tone === "green"
        ? "bg-emerald-500/16 text-emerald-200 border-emerald-400/25"
        : tone === "amber"
            ? "bg-amber-500/16 text-amber-200 border-amber-400/25"
            : "bg-fuchsia-500/16 text-fuchsia-200 border-fuchsia-400/25";

    return (
        <span className={`rounded-full border px-1.5 py-0.5 text-[9px] ${toneClass}`}>
            {label}
        </span>
    );
}

export default function LayerPanel({ layerManager, onLayerChange }: LayerPanelProps) {
    if (!layerManager) return null;

    const { layers, activeLayerId } = layerManager;

    const handleAdd = () => {
        layerManager.addLayer();
        onLayerChange();
    };

    const handleDelete = (id: string) => {
        layerManager.deleteLayer(id);
        onLayerChange();
    };

    const handleDuplicate = (id: string) => {
        layerManager.duplicateLayer(id);
        onLayerChange();
    };

    const handleSelect = (id: string) => {
        if (layerManager.selectLayer(id)) {
            onLayerChange();
        }
    };

    const handleToggleVisible = (id: string) => {
        const layer = layers.find((entry) => entry.id === id);
        if (!layer) return;
        layer.visible = !layer.visible;
        onLayerChange();
    };

    const handleOpacityChange = (id: string, opacity: number) => {
        const layer = layers.find((entry) => entry.id === id);
        if (!layer) return;
        layer.opacity = opacity;
        onLayerChange();
    };

    const handleBlendModeChange = (id: string, mode: "normal" | "add" | "multiply") => {
        const layer = layers.find((entry) => entry.id === id);
        if (!layer) return;
        layer.blendMode = mode;
        onLayerChange();
    };

    return (
        <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-[0.22em] text-white/35">
                    Layer Stack
                </span>
                <button
                    onClick={handleAdd}
                    className="rounded-md border border-emerald-400/20 bg-emerald-500/10 px-2 py-1 text-[10px] text-emerald-200 transition hover:bg-emerald-500/20"
                    title="Add layer"
                >
                    Add Layer
                </button>
            </div>

            <div className="custom-scrollbar flex max-h-80 flex-col gap-2 overflow-y-auto pr-0.5">
                {layers.map((layer, index) => {
                    const isActive = activeLayerId === layer.id;
                    const canBringForward = index > 0;
                    const canSendBack = index < layers.length - 1;

                    return (
                        <div
                            key={layer.id}
                            className={`rounded-xl border transition ${isActive
                                ? "border-emerald-400/28 bg-emerald-500/[0.08] shadow-[0_0_0_1px_rgba(16,185,129,0.08)]"
                                : "border-white/8 bg-white/[0.035] hover:border-white/15 hover:bg-white/[0.06]"
                                }`}
                        >
                            <div
                                onClick={() => handleSelect(layer.id)}
                                className="flex cursor-pointer items-start gap-2 p-2 text-left"
                            >
                                <button
                                    type="button"
                                    className={`mt-0.5 shrink-0 rounded-md border p-1 ${layer.visible
                                        ? "border-white/15 text-white/85"
                                        : "border-white/8 text-white/28"
                                        }`}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleToggleVisible(layer.id);
                                    }}
                                    title={layer.visible ? "Hide layer" : "Show layer"}
                                >
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        {layer.visible ? (
                                            <>
                                                <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                                                <circle cx="12" cy="12" r="3" />
                                            </>
                                        ) : (
                                            <>
                                                <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
                                                <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
                                                <line x1="2" y1="2" x2="22" y2="22" />
                                            </>
                                        )}
                                    </svg>
                                </button>

                                <div className="min-w-0 flex-1">
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0">
                                            <div className="truncate text-[11px] text-white/88">{layer.name}</div>
                                            <div className="mt-0.5 text-[9px] uppercase tracking-[0.18em] text-white/28">
                                                {isActive ? "Selected" : "Layer"}
                                            </div>
                                        </div>
                                        <div className="flex flex-wrap justify-end gap-1">
                                            {layer.animation.manager.state === "playing" && (
                                                <StatusPill label="Anim" tone="green" />
                                            )}
                                            {layer.animation.manager.state === "paused" && (
                                                <StatusPill label="Pause" tone="amber" />
                                            )}
                                            {layer.effects.engine.enabled && (
                                                <StatusPill label="FX" tone="fuchsia" />
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="px-2 pb-2">
                                <div className="flex flex-wrap gap-1.5">
                                    <button
                                        onClick={() => handleDuplicate(layer.id)}
                                        className="rounded-md bg-white/8 px-2 py-1 text-[10px] text-white/72 transition hover:bg-white/14"
                                    >
                                        Duplicate
                                    </button>
                                    <button
                                        onClick={() => {
                                            layerManager.moveLayerUp(layer.id);
                                            onLayerChange();
                                        }}
                                        disabled={!canBringForward}
                                        className={`rounded-md px-2 py-1 text-[10px] transition ${canBringForward
                                            ? "bg-white/8 text-white/72 hover:bg-white/14"
                                            : "cursor-not-allowed bg-white/5 text-white/20"
                                            }`}
                                    >
                                        Bring Forward
                                    </button>
                                    <button
                                        onClick={() => {
                                            layerManager.moveLayerDown(layer.id);
                                            onLayerChange();
                                        }}
                                        disabled={!canSendBack}
                                        className={`rounded-md px-2 py-1 text-[10px] transition ${canSendBack
                                            ? "bg-white/8 text-white/72 hover:bg-white/14"
                                            : "cursor-not-allowed bg-white/5 text-white/20"
                                            }`}
                                    >
                                        Send Back
                                    </button>
                                    {layers.length > 1 && (
                                        <button
                                            onClick={() => handleDelete(layer.id)}
                                            className="rounded-md bg-red-500/12 px-2 py-1 text-[10px] text-red-200 transition hover:bg-red-500/22"
                                        >
                                            Delete
                                        </button>
                                    )}
                                </div>

                                {isActive && (
                                    <div className="mt-2 grid gap-2">
                                        <div className="grid grid-cols-[auto,minmax(0,1fr),auto] items-center gap-2">
                                            <span className="text-[9px] text-white/40">Opacity</span>
                                            <input
                                                type="range"
                                                min={0}
                                                max={1}
                                                step={0.01}
                                                value={layer.opacity}
                                                onChange={(e) => handleOpacityChange(layer.id, parseFloat(e.target.value))}
                                                className="h-1 w-full min-w-0 accent-emerald-500"
                                            />
                                            <span className="text-[9px] tabular-nums text-white/60">{(layer.opacity * 100).toFixed(0)}%</span>
                                        </div>

                                        <div className="grid grid-cols-[auto,minmax(0,1fr)] items-center gap-2">
                                            <span className="text-[9px] text-white/40">Blend</span>
                                            <select
                                                value={layer.blendMode}
                                                onChange={(e) => handleBlendModeChange(layer.id, e.target.value as "normal" | "add" | "multiply")}
                                                className="w-full min-w-0 rounded-md border border-white/10 bg-black/20 px-2 py-1 text-[10px] text-white outline-none"
                                            >
                                                <option value="normal">Normal</option>
                                                <option value="add">Add</option>
                                                <option value="multiply">Multiply</option>
                                            </select>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
