"use client";

import { LayerManager } from "../lib/layerManager";

interface LayerPanelProps {
    layerManager: LayerManager | null;
    onLayerChange: () => void;
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

    const handleToggleVisible = (id: string) => {
        const layer = layers.find(l => l.id === id);
        if (layer) {
            layer.visible = !layer.visible;
            onLayerChange();
        }
    };

    const handleOpacityChange = (id: string, opacity: number) => {
        const layer = layers.find(l => l.id === id);
        if (layer) {
            layer.opacity = opacity;
            onLayerChange();
        }
    };

    const handleBlendModeChange = (id: string, mode: "normal" | "add" | "multiply") => {
        const layer = layers.find(l => l.id === id);
        if (layer) {
            layer.blendMode = mode;
            onLayerChange();
        }
    };

    return (
        <div className="flex w-full max-w-full flex-col rounded-md border border-white/10 bg-slate-900 overflow-hidden">
            <div className="flex bg-white/5 px-2 py-1.5 items-center justify-between border-b border-white/10">
                <span className="text-[10px] uppercase font-bold tracking-wider text-white/50">Layers</span>
                <button 
                    onClick={handleAdd}
                    className="p-1 hover:bg-white/10 rounded" title="Add Layer"
                >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
                </button>
            </div>
            
            <div className="max-h-72 overflow-y-auto overflow-x-hidden custom-scrollbar">
                {layers.map((layer) => (
                    <div 
                        key={layer.id} 
                        className={`group flex min-w-0 flex-col gap-2 border-b border-white/5 p-2 transition-colors ${activeLayerId === layer.id ? 'bg-indigo-500/20' : 'hover:bg-white/5'}`}
                        onClick={() => {
                            if (activeLayerId !== layer.id) {
                                layerManager.activeLayerId = layer.id;
                                onLayerChange();
                            }
                        }}
                    >
                        <div className="flex min-w-0 items-center gap-2">
                            <button 
                                onClick={(e) => { e.stopPropagation(); handleToggleVisible(layer.id); }}
                                className={`shrink-0 p-1 rounded hover:bg-white/10 ${layer.visible ? 'text-white' : 'text-white/30'}`}
                            >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    {layer.visible ? (
                                        <><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></>
                                    ) : (
                                        <><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" y1="2" x2="22" y2="22"/></>
                                    )}
                                </svg>
                            </button>
                            <span className="min-w-0 flex-1 text-[11px] truncate">{layer.name}</span>
                            
                            <div className="flex shrink-0 items-center gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                                <button onClick={(e) => { e.stopPropagation(); handleDuplicate(layer.id); }} className="p-1 hover:bg-white/10 rounded text-white/50 hover:text-white" title="Duplicate">
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                                </button>
                                {layers.length > 1 && (
                                    <button onClick={(e) => { e.stopPropagation(); handleDelete(layer.id); }} className="p-1 hover:bg-red-500/20 rounded text-red-500/50 hover:text-red-400" title="Delete">
                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Layer Sub-controls (visible only if active) */}
                        {activeLayerId === layer.id && (
                            <div className="grid min-w-0 gap-2 pl-6" onClick={(e) => e.stopPropagation()}>
                                <div className="grid min-w-0 grid-cols-[auto,minmax(0,1fr),auto] items-center gap-2">
                                    <span className="text-[9px] text-white/40">Opacity</span>
                                    <input 
                                        type="range" min={0} max={1} step={0.01} value={layer.opacity}
                                        onChange={(e) => handleOpacityChange(layer.id, parseFloat(e.target.value))}
                                        className="min-w-0 w-full h-1 accent-indigo-500"
                                    />
                                    <span className="text-[9px] text-white/60 text-right tabular-nums">{(layer.opacity * 100).toFixed(0)}%</span>
                                </div>
                                <div className="grid min-w-0 grid-cols-[auto,minmax(0,1fr)] items-center gap-2">
                                    <span className="text-[9px] text-white/40">Blend</span>
                                    <select 
                                        value={layer.blendMode}
                                        onChange={(e) => handleBlendModeChange(layer.id, e.target.value as "normal" | "add" | "multiply")}
                                        className="min-w-0 w-full bg-black/20 border border-white/10 rounded px-1.5 py-1 text-[9px] text-white outline-none"
                                    >
                                        <option value="normal">Normal</option>
                                        <option value="add">Add</option>
                                        <option value="multiply">Multiply</option>
                                    </select>
                                </div>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
