import { RGB } from "../types";
import { hslToRgb } from "./utils";
import { GLEffectsRenderer } from "./effects-gl";

// ── Effect Preset Definition ──────────────────────────
export interface EffectPreset {
  name: string;
  /** Maximum lifetime in frames */
  maxAge: number;
  /** Maximum spread radius in cells */
  maxRadius: number;
  /**
   * Returns intensity (0–1) at a pixel offset (dx, dy) from the trigger
   * point, given the current age and effect parameters.
   * `dist` is pre-computed √(dx²+dy²).
   */
  intensity: (
    dx: number,
    dy: number,
    dist: number,
    age: number,
    maxAge: number,
    maxRadius: number,
  ) => number;
  /**
   * Optional: shift the hue (degrees) based on distance and age.
   * When provided, the trigger colour is converted to HSL, hue is shifted,
   * and the result is used for that pixel.
   */
  hueShift?: (dist: number, age: number) => number;
}

// ── Built-in Effect Presets ───────────────────────────

export const EFFECT_PRESETS: EffectPreset[] = [
  // 1. Ripple — a single expanding ring
  {
    name: "Ripple",
    maxAge: 35,
    maxRadius: 18,
    intensity: (_dx, _dy, dist, age, maxAge, maxRadius) => {
      const progress = age / maxAge;
      const currentRadius = progress * maxRadius;
      const ringWidth = 1.2 + progress * 1.8;
      const ringDist = Math.abs(dist - currentRadius);
      if (ringDist > ringWidth) return 0;
      const fade = 1 - Math.pow(progress, 0.7);
      return (1 - ringDist / ringWidth) * fade;
    },
    hueShift: (dist) => dist * 8,
  },

  // 2. Wave — horizontal wave spreading left and right
  {
    name: "Wave",
    maxAge: 30,
    maxRadius: 20,
    intensity: (dx, dy, _dist, age, maxAge, maxRadius) => {
      const progress = age / maxAge;
      const currentSpread = progress * maxRadius;
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);
      if (absDx > currentSpread) return 0;
      // Vertical falloff — wave is thin
      const waveHeight = 1.5 + progress * 1.0;
      if (absDy > waveHeight) return 0;
      // Wave front effect
      const frontDist = Math.abs(absDx - currentSpread);
      if (frontDist > 3) return 0;
      const fade = 1 - Math.pow(progress, 0.6);
      const yFade = 1 - absDy / waveHeight;
      const frontFade = 1 - frontDist / 3;
      // Sinusoidal ripple along the wave
      const wave = (Math.sin(absDx * 0.8 - age * 0.4) + 1) / 2;
      return frontFade * yFade * fade * (0.4 + 0.6 * wave);
    },
  },

  // 3. Raindrop — multiple concentric expanding rings
  {
    name: "Raindrop",
    maxAge: 40,
    maxRadius: 16,
    intensity: (_dx, _dy, dist, age, maxAge, maxRadius) => {
      const progress = age / maxAge;
      const fade = 1 - Math.pow(progress, 0.5);
      let maxIntensity = 0;
      // 3 concentric rings at different speeds
      for (let ring = 0; ring < 3; ring++) {
        const delay = ring * 4; // stagger start
        const effectiveAge = age - delay;
        if (effectiveAge < 0) continue;
        const ringProgress = effectiveAge / (maxAge - delay);
        if (ringProgress > 1) continue;
        const currentRadius = ringProgress * maxRadius * (1 - ring * 0.15);
        const ringWidth = 0.8 + ringProgress * 0.8;
        const ringDist = Math.abs(dist - currentRadius);
        if (ringDist > ringWidth) continue;
        const ringFade = 1 - ring * 0.25;
        const intensity = (1 - ringDist / ringWidth) * fade * ringFade;
        maxIntensity = Math.max(maxIntensity, intensity);
      }
      return maxIntensity;
    },
    hueShift: (_dist, age) => age * 5,
  },

  // 4. Star Burst — 8 rays emanating outward
  {
    name: "Star Burst",
    maxAge: 30,
    maxRadius: 16,
    intensity: (dx, dy, dist, age, maxAge, maxRadius) => {
      if (dist < 0.5) return 1 - age / maxAge; // center pixel always lit
      const progress = age / maxAge;
      const currentRadius = progress * maxRadius;
      if (dist > currentRadius) return 0;
      // 8 rays: angles at 0°, 45°, 90°, 135°, 180°, 225°, 270°, 315°
      const angle = Math.atan2(dy, dx);
      const numRays = 8;
      const rayAngle = (2 * Math.PI) / numRays;
      // Find distance to nearest ray
      let minAngleDist = Infinity;
      for (let i = 0; i < numRays; i++) {
        const target = -Math.PI + i * rayAngle;
        let diff = Math.abs(angle - target);
        if (diff > Math.PI) diff = 2 * Math.PI - diff;
        minAngleDist = Math.min(minAngleDist, diff);
      }
      // Ray width narrows with distance
      const rayWidth = 0.35 / (1 + dist * 0.15);
      if (minAngleDist > rayWidth) return 0;
      const fade = 1 - Math.pow(progress, 0.7);
      const angleFade = 1 - minAngleDist / rayWidth;
      const distFade = 0.4 + 0.6 * (1 - dist / currentRadius);
      return angleFade * fade * distFade;
    },
    hueShift: (dist) => dist * 15,
  },

  // 5. Helix — two rotating spiral arms
  {
    name: "Helix",
    maxAge: 45,
    maxRadius: 14,
    intensity: (dx, dy, dist, age, maxAge, maxRadius) => {
      if (dist < 0.5) return 1 - age / maxAge;
      const progress = age / maxAge;
      const currentRadius = progress * maxRadius;
      if (dist > currentRadius) return 0;
      const angle = Math.atan2(dy, dx);
      const rotation = age * 0.25;
      // Spiral: angle depends on distance
      const spiralAngle = angle - rotation + dist * 0.5;
      // Two arms (180° apart)
      const arm = (Math.cos(spiralAngle * 2) + 1) / 2;
      const fade = 1 - Math.pow(progress, 0.6);
      const distFade = 0.3 + 0.7 * (1 - dist / currentRadius);
      // Thin out the arms
      const armIntensity = Math.pow(arm, 2);
      return armIntensity * fade * distFade;
    },
    hueShift: (dist, age) => dist * 12 + age * 8,
  },

  // 6. Sparkle — random twinkling pixels near trigger point
  {
    name: "Sparkle",
    maxAge: 25,
    maxRadius: 10,
    intensity: (dx, dy, dist, age, maxAge, maxRadius) => {
      const progress = age / maxAge;
      const currentRadius = 2 + progress * maxRadius;
      if (dist > currentRadius) return 0;
      // Pseudo-random sparkle based on position and age
      const hash = Math.sin(dx * 127.1 + dy * 311.7 + age * 43.3) * 43758.5453;
      const sparkle = hash - Math.floor(hash); // 0..1
      if (sparkle < 0.85) return 0; // only 15% of pixels sparkle
      const fade = 1 - Math.pow(progress, 0.5);
      // Twinkle — varies with time
      const twinkle = (Math.sin(age * 1.2 + dist * 2) + 1) / 2;
      return twinkle * fade * (1 - (dist / currentRadius) * 0.5);
    },
    hueShift: (_dist, age) => age * 12,
  },

  // 7. Laser — DJ-concert-style laser beams shooting in random directions
  {
    name: "Laser",
    maxAge: 35,
    maxRadius: 28,
    intensity: (dx, dy, dist, age, maxAge, maxRadius) => {
      if (dist < 0.5) return 1 - age / maxAge;
      const progress = age / maxAge;
      // Beams extend rapidly, then fade
      const beamLength = progress * maxRadius;
      if (dist > beamLength) return 0;

      const angle = Math.atan2(dy, dx);

      // 5 laser beams at pseudo-random but deterministic angles
      // seeded per-effect via maxAge (stable across frames for one trigger)
      const numBeams = 5;
      let maxIntensity = 0;
      for (let i = 0; i < numBeams; i++) {
        // Spread beams around the circle with a golden-angle-like offset
        const beamAngle = -Math.PI + ((i * 2.399) % (2 * Math.PI)); // golden angle ≈ 137.5°
        let angleDiff = Math.abs(angle - beamAngle);
        if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;

        // Beam width: very narrow (laser-thin), tapers slightly with distance
        const beamWidth = 0.12 + dist * 0.008;
        if (angleDiff > beamWidth) continue;

        // Core brightness — bright center, sharp falloff
        const coreFade = 1 - angleDiff / beamWidth;
        const core = Math.pow(coreFade, 3); // sharp laser edge

        // Distance-based sweep: beam "shoots" outward
        const tipDist = Math.abs(dist - beamLength);
        const tipGlow = tipDist < 2 ? 1 - tipDist / 2 : 0;
        const bodyGlow = 0.3 + 0.7 * (1 - dist / beamLength);

        // Flicker — subtle high-frequency shimmer
        const flicker = 0.8 + 0.2 * Math.sin(dist * 3.5 - age * 2 + i * 1.7);

        const fade = 1 - Math.pow(progress, 0.5);
        const intensity = core * (bodyGlow + tipGlow * 0.7) * fade * flicker;
        maxIntensity = Math.max(maxIntensity, intensity);
      }
      return maxIntensity;
    },
    // Vivid hue cycling — each beam picks up a different colour shift
    hueShift: (dist, age) => dist * 20 + age * 10,
  },

  // 8. Bubble — expanding bubbles that float outward in random directions
  {
    name: "Bubble",
    maxAge: 50,
    maxRadius: 20,
    intensity: (dx, dy, dist, age, maxAge, maxRadius) => {
      const progress = age / maxAge;
      const fade = 1 - Math.pow(progress, 0.4);

      // Generate 6 bubbles drifting outward in different directions
      const numBubbles = 6;
      let maxIntensity = 0;

      for (let i = 0; i < numBubbles; i++) {
        // Each bubble has a deterministic direction (golden angle spread)
        const bAngle = i * 2.399 + 0.5;
        const bCos = Math.cos(bAngle);
        const bSin = Math.sin(bAngle);

        // Bubble drifts outward over time (with slight deceleration)
        const driftSpeed = 0.6 + (i % 3) * 0.15;
        const drift = age * driftSpeed * (1 - progress * 0.3);
        const bx = bCos * drift;
        const by = bSin * drift;

        // Distance from this pixel to the bubble center
        const bdx = dx - bx;
        const bdy = dy - by;
        const bDist = Math.sqrt(bdx * bdx + bdy * bdy);

        // Bubble radius grows then shrinks (pops)
        const growPhase = Math.min(progress * 3, 1); // quick inflate
        const popPhase = progress > 0.75 ? (progress - 0.75) / 0.25 : 0;
        const bubbleRadius = (1.2 + i * 0.2) * growPhase * (1 - popPhase * 0.6);
        if (bubbleRadius < 0.3) continue;

        // Hollow sphere look — bright ring, dim inside
        const ringWidth = 0.45 + bubbleRadius * 0.15;
        const ringDist = Math.abs(bDist - bubbleRadius);
        if (bDist > bubbleRadius + ringWidth) continue;

        let intensity: number;
        if (ringDist < ringWidth) {
          // On the ring edge — bright
          intensity = (1 - ringDist / ringWidth) * 0.9;
        } else {
          // Inside the bubble — subtle inner glow
          intensity = (1 - bDist / bubbleRadius) * 0.25;
        }

        // Specular highlight — small bright spot on upper-left of bubble
        const specX = bdx + bubbleRadius * 0.35;
        const specY = bdy + bubbleRadius * 0.35;
        const specDist = Math.sqrt(specX * specX + specY * specY);
        if (specDist < bubbleRadius * 0.35) {
          intensity += (1 - specDist / (bubbleRadius * 0.35)) * 0.6;
        }

        // Wobble — subtle oscillation for organic feel
        const wobble =
          0.85 + 0.15 * Math.sin(age * 0.5 + i * 2.1 + bDist * 1.2);

        maxIntensity = Math.max(
          maxIntensity,
          Math.min(1, intensity * fade * wobble * (1 - popPhase * 0.5)),
        );
      }
      return maxIntensity;
    },
    // Iridescent hue shift — soap-bubble rainbow sheen
    hueShift: (dist, age) => dist * 25 + age * 6,
  },
];

// ── Active Effect Instance ────────────────────────────

interface ActiveEffect {
  col: number;
  row: number;
  color: RGB;
  /** HSL representation of trigger colour (for hue shifting) */
  hsl: [number, number, number];
  age: number;
  preset: EffectPreset;
  /** Index into EFFECT_PRESETS (0–7) for GPU dispatch */
  presetIndex: number;
  /** Effective values after applying multipliers */
  effectiveMaxAge: number;
  effectiveMaxRadius: number;
}

// ── Utility: RGB → HSL ───────────────────────────────

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l * 100];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  switch (max) {
    case r:
      h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
      break;
    case g:
      h = ((b - r) / d + 2) / 6;
      break;
    case b:
      h = ((r - g) / d + 4) / 6;
      break;
  }
  return [h * 360, s * 100, l * 100];
}

// ── Effects Engine ────────────────────────────────────

export interface EffectsOverlay {
  buffer: Uint8ClampedArray | null;
  cols: number;
  rows: number;
}

export class EffectsEngine {
  private effects: ActiveEffect[] = [];
  private _enabled = false;
  private _preset: EffectPreset = EFFECT_PRESETS[0];
  private _cols = 0;
  private _rows = 0;
  private _overlay: EffectsOverlay = { buffer: null, cols: 0, rows: 0 };
  private _rafId = 0;
  private _lastTime = 0;
  private _redraw: () => void;
  private _maxEffects = 80;
  /** Multiplier for effect reach (0.2–10). Default 1. */
  private _distanceMultiplier = 1;
  /** Multiplier for effect speed (0.2–5). Default 1. Higher = faster. */
  private _speedMultiplier = 1;
  /** Throttle: min cells between triggers during a drag */
  private _lastTrigger: { col: number; row: number; time: number } | null =
    null;
  private _triggerCooldown = 30; // ms between triggers on same cell
  /** GPU-accelerated renderer (null if WebGL unavailable) */
  private _gl: GLEffectsRenderer | null = null;

  constructor(redraw: () => void) {
    this._redraw = redraw;
  }

  // ── Public getters / setters ────────────────────────

  get enabled(): boolean {
    return this._enabled;
  }

  setEnabled(v: boolean): void {
    this._enabled = v;
    if (!v) this.clearEffects();
  }

  get preset(): EffectPreset {
    return this._preset;
  }

  setPreset(p: EffectPreset): void {
    this._preset = p;
  }

  get overlay(): EffectsOverlay {
    return this._overlay;
  }

  get hasActiveEffects(): boolean {
    return this.effects.length > 0;
  }

  get distanceMultiplier(): number {
    return this._distanceMultiplier;
  }

  setDistanceMultiplier(v: number): void {
    this._distanceMultiplier = Math.max(0.2, Math.min(10, v));
  }

  get speedMultiplier(): number {
    return this._speedMultiplier;
  }

  setSpeedMultiplier(v: number): void {
    this._speedMultiplier = Math.max(0.2, Math.min(5, v));
  }

  // ── Grid management ─────────────────────────────────

  updateGrid(cols: number, rows: number): void {
    this._cols = cols;
    this._rows = rows;
    this._overlay = {
      buffer: new Uint8ClampedArray(cols * rows * 4),
      cols,
      rows,
    };

    // Initialise or resize the GPU renderer
    if (!this._gl) {
      this._gl = GLEffectsRenderer.create();
    }
    if (this._gl) {
      this._gl.resize(cols, rows);
    }
  }

  // ── Trigger an effect ───────────────────────────────

  trigger(col: number, row: number, color: RGB): void {
    if (!this._enabled) return;

    // Throttle triggers on same/nearby cells
    const now = performance.now();
    if (this._lastTrigger) {
      const { col: lc, row: lr, time: lt } = this._lastTrigger;
      if (col === lc && row === lr && now - lt < this._triggerCooldown) return;
    }
    this._lastTrigger = { col, row, time: now };

    // Cap concurrent effects
    if (this.effects.length >= this._maxEffects) {
      this.effects.shift();
    }

    const hsl = rgbToHsl(color[0], color[1], color[2]);
    // Ensure the colour has enough brightness to be visible
    if (hsl[2] < 10) hsl[2] = 30;

    const effectiveMaxAge = Math.max(
      5,
      Math.round(this._preset.maxAge / this._speedMultiplier),
    );
    const effectiveMaxRadius = Math.max(
      2,
      Math.round(this._preset.maxRadius * this._distanceMultiplier),
    );

    this.effects.push({
      col,
      row,
      color,
      hsl,
      age: 0,
      preset: this._preset,
      presetIndex: EFFECT_PRESETS.indexOf(this._preset),
      effectiveMaxAge,
      effectiveMaxRadius,
    });

    // Start animation loop if not running
    if (this._rafId === 0) {
      this._lastTime = performance.now();
      this._startLoop();
    }
  }

  // ── Clear all effects ───────────────────────────────

  clearEffects(): void {
    this.effects = [];
    this._overlay.buffer?.fill(0);
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = 0;
    }
    this._redraw();
  }

  // ── Cleanup ─────────────────────────────────────────

  destroy(): void {
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = 0;
    }
    if (this._gl) {
      this._gl.destroy();
      this._gl = null;
    }
  }

  // ── Internal animation loop ─────────────────────────

  private _startLoop(): void {
    const targetFps = 60;
    const interval = 1000 / targetFps;

    const loop = (now: number) => {
      const elapsed = now - this._lastTime;
      if (elapsed >= interval) {
        this._lastTime = now - (elapsed % interval);
        this._tick();
        this._redraw();
      }
      if (this.effects.length > 0) {
        this._rafId = requestAnimationFrame(loop);
      } else {
        this._rafId = 0;
        // Clear overlay and do final redraw
        this._overlay.buffer?.fill(0);
        this._redraw();
      }
    };
    this._rafId = requestAnimationFrame(loop);
  }

  private _tick(): void {
    const buf = this._overlay.buffer;
    if (!buf) return;

    const cols = this._cols;

    // Remove dead effects (in-place for less GC pressure)
    let writeIdx = 0;
    for (let i = 0; i < this.effects.length; i++) {
      if (this.effects[i].age < this.effects[i].effectiveMaxAge) {
        this.effects[writeIdx++] = this.effects[i];
      }
    }
    this.effects.length = writeIdx;

    // ── GPU path ──────────────────────────────────────────
    if (this._gl) {
      this._gl.render(this.effects, buf);
      for (let i = 0; i < this.effects.length; i++) {
        this.effects[i].age++;
      }
      return;
    }

    // ── CPU fallback path ─────────────────────────────────
    buf.fill(0);

    for (let ei = 0; ei < this.effects.length; ei++) {
      const effect = this.effects[ei];
      const ec = effect.col;
      const er = effect.row;
      const color = effect.color;
      const hsl = effect.hsl;
      const age = effect.age;
      const preset = effect.preset;
      const effectiveMaxAge = effect.effectiveMaxAge;
      const effectiveMaxRadius = effect.effectiveMaxRadius;
      const currentRadius = (age / effectiveMaxAge) * effectiveMaxRadius + 2;
      const hasHueShift = !!preset.hueShift;

      // Tight bounding box
      const minC = Math.max(0, (ec - currentRadius - 1) | 0);
      const maxC = Math.min(cols - 1, (ec + currentRadius + 2) | 0);
      const minR = Math.max(0, (er - currentRadius - 1) | 0);
      const maxR = Math.min(this._rows - 1, (er + currentRadius + 2) | 0);

      // Pre-extract non-shifted colour
      const cr = color[0];
      const cg = color[1];
      const cb = color[2];
      const hH = hsl[0];
      const hS = hsl[1];
      const hL = Math.max(hsl[2], 30);

      for (let r = minR; r <= maxR; r++) {
        const dy = r - er;
        const dy2 = dy * dy;
        const rowOff = r * cols;
        for (let c = minC; c <= maxC; c++) {
          const dx = c - ec;
          const dist = Math.sqrt(dx * dx + dy2);

          const intensity = preset.intensity(
            dx,
            dy,
            dist,
            age,
            effectiveMaxAge,
            effectiveMaxRadius,
          );
          if (intensity <= 0.01) continue;

          // Compute colour — optionally hue-shifted
          let pr: number, pg: number, pb: number;
          if (hasHueShift) {
            const shift = preset.hueShift!(dist, age);
            const shifted = hslToRgb((hH + shift) % 360, hS, hL);
            pr = shifted[0];
            pg = shifted[1];
            pb = shifted[2];
          } else {
            pr = cr;
            pg = cg;
            pb = cb;
          }

          const idx = (rowOff + c) << 2; // * 4
          // Additive blend — Uint8ClampedArray auto-clamps to [0, 255]
          buf[idx] = buf[idx] + pr * intensity;
          buf[idx + 1] = buf[idx + 1] + pg * intensity;
          buf[idx + 2] = buf[idx + 2] + pb * intensity;
          buf[idx + 3] = buf[idx + 3] + 255 * intensity;
        }
      }

      effect.age++;
    }
  }
}
