import { PhysicsWorld } from "./world";

/**
 * A pre-rendered ("baked") physics animation: a fixed-length sequence of grid
 * frames produced by stepping a world deterministically. Because it's just RGB
 * frames, a baked clip plugs straight into the existing animation playback and
 * the export pipeline (Phase D) — no live simulation needed at display time.
 */
export interface BakedClip {
  cols: number;
  rows: number;
  fps: number;
  frameCount: number;
  /** One Uint8ClampedArray of length cols*rows*3 per frame. */
  frames: Uint8ClampedArray[];
}

/**
 * Run `world` for `frameCount` frames and capture each rasterized grid.
 *
 * The world advances by its fixed timestep; `fps` controls how many fixed steps
 * map to one captured frame (so playback at `fps` matches simulated time). This
 * is deterministic: same world state + seed ⇒ identical clip.
 */
export function bakeSimulation(
  world: PhysicsWorld,
  cols: number,
  rows: number,
  frameCount: number,
  fps = 30,
): BakedClip {
  const fixedDt = world.config.fixedDt;
  const substeps = Math.max(1, Math.round(1 / fps / fixedDt));
  const frames: Uint8ClampedArray[] = [];
  for (let f = 0; f < frameCount; f++) {
    for (let s = 0; s < substeps; s++) world.step(fixedDt);
    const buf = new Uint8ClampedArray(cols * rows * 3);
    world.rasterizeTo(buf, cols, rows);
    frames.push(buf);
  }
  return { cols, rows, fps, frameCount, frames };
}
