import { useState, useRef, useEffect, useCallback } from "react";
import { EffectsEngine, EffectPreset, EFFECT_PRESETS, EffectsOverlay } from "../lib/effects";

const STORAGE_KEY_EFFECTS = "tenix-effects";
const STORAGE_KEY_EFFECT_PRESET = "tenix-effect-preset";
const STORAGE_KEY_EFFECT_DISTANCE = "tenix-effect-distance";
const STORAGE_KEY_EFFECT_SPEED = "tenix-effect-speed";

export function useEffectsEngine(onRedraw: () => void) {
  const effectsRef = useRef<EffectsEngine | null>(null);
  const effectsOverlayRef = useRef<EffectsOverlay | null>(null);

  const [effectsEnabled, setEffectsEnabled] = useState(false);
  const [activeEffectPreset, setActiveEffectPreset] = useState<EffectPreset>(EFFECT_PRESETS[0]);
  const [effectsDistance, setEffectsDistance] = useState(1);
  const [effectsSpeed, setEffectsSpeed] = useState(1);

  // Initialize engine
  useEffect(() => {
    const engine = new EffectsEngine(onRedraw);
    effectsRef.current = engine;
    effectsOverlayRef.current = engine.overlay;

    // Load saved states
    try {
      const savedEnabled = localStorage.getItem(STORAGE_KEY_EFFECTS);
      if (savedEnabled === "true") {
        engine.setEnabled(true);
        queueMicrotask(() => setEffectsEnabled(true));
      }
      const savedPresetId = localStorage.getItem(STORAGE_KEY_EFFECT_PRESET);
      if (savedPresetId) {
        const match = EFFECT_PRESETS.find((p) => p.name === savedPresetId);
        if (match) {
          engine.setPreset(match);
          queueMicrotask(() => setActiveEffectPreset(match));
        }
      }
      const savedDist = localStorage.getItem(STORAGE_KEY_EFFECT_DISTANCE);
      if (savedDist) {
        const v = parseFloat(savedDist);
        if (!isNaN(v)) {
          engine.setDistanceMultiplier(v);
          queueMicrotask(() => setEffectsDistance(v));
        }
      }
      const savedSpeed = localStorage.getItem(STORAGE_KEY_EFFECT_SPEED);
      if (savedSpeed) {
        const v = parseFloat(savedSpeed);
        if (!isNaN(v)) {
          engine.setSpeedMultiplier(v);
          queueMicrotask(() => setEffectsSpeed(v));
        }
      }
    } catch { /* ignore */ }

    return () => {
      engine.destroy();
    };
  }, [onRedraw]);

  const handleToggleEffects = useCallback(() => {
    setEffectsEnabled((prev) => {
      const next = !prev;
      effectsRef.current?.setEnabled(next);
      try { localStorage.setItem(STORAGE_KEY_EFFECTS, next ? "true" : "false"); } catch { }
      onRedraw();
      return next;
    });
  }, [onRedraw]);

  const handleSelectEffectPreset = useCallback((preset: EffectPreset) => {
    setActiveEffectPreset(preset);
    effectsRef.current?.setPreset(preset);
    try { localStorage.setItem(STORAGE_KEY_EFFECT_PRESET, preset.name); } catch { }
  }, []);

  const handleEffectsDistanceChange = useCallback((v: number) => {
    setEffectsDistance(v);
    effectsRef.current?.setDistanceMultiplier(v);
    try { localStorage.setItem(STORAGE_KEY_EFFECT_DISTANCE, v.toString()); } catch { }
  }, []);

  const handleEffectsSpeedChange = useCallback((v: number) => {
    setEffectsSpeed(v);
    effectsRef.current?.setSpeedMultiplier(v);
    try { localStorage.setItem(STORAGE_KEY_EFFECT_SPEED, v.toString()); } catch { }
  }, []);

  return {
    effectsRef,
    effectsOverlayRef,
    effectsEnabled,
    activeEffectPreset,
    effectsDistance,
    effectsSpeed,
    setEffectsEnabled,
    setActiveEffectPreset,
    setEffectsDistance,
    setEffectsSpeed,
    handleToggleEffects,
    handleSelectEffectPreset,
    handleEffectsDistanceChange,
    handleEffectsSpeedChange,
  };
}
