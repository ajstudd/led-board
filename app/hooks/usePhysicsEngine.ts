"use client";

import { useCallback, useEffect, useRef } from "react";
import type { LayerManager, Layer } from "../lib/layerManager";
import { PhysicsWorld } from "../lib/physics/world";
import { applyPreset, PresetName } from "../lib/physics/presets";
import { Vec2 } from "../lib/physics/math";

interface UsePhysicsEngineOptions {
  layerManagerRef: React.RefObject<LayerManager | null>;
  onRedraw: () => void;
}

/**
 * Drives per-layer physics. A single rAF loop steps every layer whose physics is
 * enabled, rasterizes the result back into that layer's grid, and triggers a
 * redraw. The loop self-stops when no layer has physics on.
 *
 * Imperative ops act on the active layer. Enabling physics snapshots the current
 * drawing (restored on disable) and "pixelizes" it into particles; presets and
 * reset always restart from that clean snapshot so effects are reproducible.
 */
export function usePhysicsEngine({ layerManagerRef, onRedraw }: UsePhysicsEngineOptions) {
  const rafRef = useRef(0);
  const runningRef = useRef(false);
  const lastTimeRef = useRef(0);

  // Keep the latest redraw without re-creating the loop each render.
  const onRedrawRef = useRef(onRedraw);
  useEffect(() => {
    onRedrawRef.current = onRedraw;
  });

  // The rAF loop lives in a ref so it can reschedule itself without a
  // self-referencing useCallback. Assigned in an effect (never during render).
  const tickRef = useRef<(now: number) => void>(() => {});
  useEffect(() => {
    tickRef.current = (now: number) => {
      const mgr = layerManagerRef.current;
      if (!mgr) {
        runningRef.current = false;
        return;
      }
      const dt = Math.min((now - lastTimeRef.current) / 1000, 0.1);
      lastTimeRef.current = now;

      let active = false;
      for (const layer of mgr.layers) {
        const ph = layer.physics;
        if (!ph.enabled || !ph.world) continue;
        active = true;
        ph.world.update(dt);
        ph.world.rasterizeTo(layer.grid.data, layer.grid.cols, layer.grid.rows);
      }

      if (active) {
        onRedrawRef.current();
        rafRef.current = requestAnimationFrame((t) => tickRef.current(t));
      } else {
        runningRef.current = false;
      }
    };
  }, [layerManagerRef]);

  const ensureRunning = useCallback(() => {
    if (runningRef.current) return;
    runningRef.current = true;
    lastTimeRef.current = performance.now();
    rafRef.current = requestAnimationFrame((t) => tickRef.current(t));
  }, []);

  /** Build/refresh a layer's world from a buffer of pixels. */
  const primeWorld = useCallback((layer: Layer, fromData: Uint8ClampedArray) => {
    const ph = layer.physics;
    const world = ph.world ?? new PhysicsWorld({ seed: 1 });
    world.clear();
    world.config.gravity = new Vec2(0, ph.gravityY);
    world.config.defaultRestitution = ph.restitution;
    layer.grid.loadData(fromData);
    world.pixelize(layer.grid.data, layer.grid.cols, layer.grid.rows);
    ph.world = world;
  }, []);

  const enable = useCallback(
    (layer?: Layer | null) => {
      const target = layer ?? layerManagerRef.current?.getActiveLayer();
      if (!target) return;
      const ph = target.physics;
      if (ph.enabled) return;
      // physics owns the grid output — stop any competing animation
      target.animation.manager.stop();
      target.animation.currentAnim = null;
      // capture the drawing so we can restore it on disable
      ph.snapshot = target.grid.cloneData();
      primeWorld(target, ph.snapshot);
      ph.enabled = true;
      ensureRunning();
      onRedraw();
    },
    [layerManagerRef, primeWorld, ensureRunning, onRedraw],
  );

  const disable = useCallback(
    (layer?: Layer | null) => {
      const target = layer ?? layerManagerRef.current?.getActiveLayer();
      if (!target) return;
      const ph = target.physics;
      ph.enabled = false;
      ph.world?.clear();
      if (ph.snapshot) target.grid.loadData(ph.snapshot); // restore drawing
      onRedraw();
    },
    [layerManagerRef, onRedraw],
  );

  /** Apply a named preset, restarting from the clean drawing snapshot. */
  const applyPresetToActive = useCallback(
    (name: PresetName) => {
      const target = layerManagerRef.current?.getActiveLayer();
      if (!target) return;
      if (!target.physics.enabled) enable(target);
      const ph = target.physics;
      if (!ph.world || !ph.snapshot) return;
      primeWorld(target, ph.snapshot);
      applyPreset(ph.world, name);
      ph.preset = name;
      ensureRunning();
    },
    [layerManagerRef, enable, primeWorld, ensureRunning],
  );

  const setConfig = useCallback(
    (cfg: { gravityY?: number; restitution?: number }) => {
      const target = layerManagerRef.current?.getActiveLayer();
      if (!target) return;
      const ph = target.physics;
      if (cfg.gravityY !== undefined) {
        ph.gravityY = cfg.gravityY;
        if (ph.world) ph.world.config.gravity.y = cfg.gravityY;
      }
      if (cfg.restitution !== undefined) {
        ph.restitution = cfg.restitution;
        if (ph.world) {
          ph.world.config.defaultRestitution = cfg.restitution;
          for (const p of ph.world.particles) p.restitution = cfg.restitution;
        }
      }
      if (ph.enabled) ph.world?.wakeAll();
      ensureRunning();
    },
    [layerManagerRef, ensureRunning],
  );

  /** Restart from the clean drawing with no preset (pixels fall under gravity). */
  const reset = useCallback(() => {
    const target = layerManagerRef.current?.getActiveLayer();
    if (!target) return;
    const ph = target.physics;
    if (!ph.world || !ph.snapshot) return;
    primeWorld(target, ph.snapshot);
    ph.preset = null;
    ensureRunning();
  }, [layerManagerRef, primeWorld, ensureRunning]);

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  return { enable, disable, applyPresetToActive, setConfig, reset };
}
