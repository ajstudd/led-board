import { Particle } from "./types";

/**
 * SpatialHashGrid — uniform-grid broad phase for collision detection.
 *
 * Particles in Tenix are near-uniform in size (radius ≈ 0.5 cells), which makes
 * a hash grid the ideal broad phase: O(1) insertion and neighbour queries that
 * map naturally onto the pixel grid. It produces candidate pairs; the narrow
 * phase does the exact tests.
 *
 * Determinism note: query order follows insertion order within each bucket and a
 * fixed neighbour-cell traversal, so generated pairs are stable across runs.
 */
export class SpatialHashGrid {
  private cellSize: number;
  private cells = new Map<number, Particle[]>();

  constructor(cellSize = 2) {
    this.cellSize = cellSize;
  }

  private key(cx: number, cy: number): number {
    // Cantor-ish pairing on signed cell coords; bucket collisions are harmless
    // (the narrow phase rejects false candidates).
    return (cx * 73856093) ^ (cy * 19349663);
  }

  clear(): void {
    this.cells.clear();
  }

  rebuild(particles: Particle[]): void {
    this.cells.clear();
    const cs = this.cellSize;
    for (const p of particles) {
      const cx = Math.floor(p.position.x / cs);
      const cy = Math.floor(p.position.y / cs);
      const k = this.key(cx, cy);
      const bucket = this.cells.get(k);
      if (bucket) bucket.push(p);
      else this.cells.set(k, [p]);
    }
  }

  /**
   * Generate unique candidate pairs (a.id < b.id) across the 3×3 neighbourhood.
   * Stable ordering keeps the simulation deterministic.
   */
  pairs(): Array<[Particle, Particle]> {
    const out: Array<[Particle, Particle]> = [];
    const cs = this.cellSize;
    const seen = new Set<number>();

    for (const bucket of this.cells.values()) {
      for (const a of bucket) {
        const cx = Math.floor(a.position.x / cs);
        const cy = Math.floor(a.position.y / cs);
        for (let dx = -1; dx <= 1; dx++) {
          for (let dy = -1; dy <= 1; dy++) {
            const nb = this.cells.get(this.key(cx + dx, cy + dy));
            if (!nb) continue;
            for (const b of nb) {
              if (a.id >= b.id) continue;
              // de-dup pairs that show up via multiple neighbour cells
              const pairKey = a.id * 100003 + b.id;
              if (seen.has(pairKey)) continue;
              seen.add(pairKey);
              out.push([a, b]);
            }
          }
        }
      }
    }
    return out;
  }
}
