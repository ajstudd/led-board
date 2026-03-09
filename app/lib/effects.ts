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

  // 2. Wave — S-shaped water wave spreading horizontally
  {
    name: "Wave",
    maxAge: 40,
    maxRadius: 24,
    intensity: (dx, dy, _dist, age, maxAge, maxRadius) => {
      const progress = age / maxAge;
      const fade = 1 - Math.pow(progress, 0.5);
      let maxI = 0;
      // 3 S-wave fronts spreading left and right
      for (let w = 0; w < 3; w++) {
        const delay = w * 5;
        const effAge = age - delay;
        if (effAge < 0) continue;
        const wp = effAge / (maxAge - delay);
        if (wp > 1) continue;
        const spread = wp * maxRadius;
        const absDx = Math.abs(dx);
        if (absDx > spread + 1) continue;
        // S-wave: vertical offset follows sine curve
        const amplitude = 1.5 + wp * 2.5;
        const waveY = amplitude * Math.sin(dx * 0.6 - effAge * 0.25);
        const distFromCurve = Math.abs(dy - waveY);
        const thickness = 1.2 + wp * 0.8 - w * 0.2;
        if (distFromCurve > thickness) continue;
        // Fade near the spreading tips
        const tipFade = absDx > spread - 2 ? 1 - (absDx - spread + 2) / 3 : 1;
        const edgeFade = 1 - distFromCurve / thickness;
        const waveFade = 1 - w * 0.3;
        maxI = Math.max(maxI, edgeFade * fade * waveFade * Math.max(tipFade, 0));
      }
      return maxI;
    },
    hueShift: (dist, age) => dist * 6 + age * 4,
  },

  // 3. Raindrop — central splash + filled spreading disk with ripple texture
  {
    name: "Raindrop",
    maxAge: 40,
    maxRadius: 16,
    intensity: (_dx, _dy, dist, age, maxAge, maxRadius) => {
      const progress = age / maxAge;
      const fade = 1 - Math.pow(progress, 0.5);
      // Central splash (first 30% of life) — bright center impact
      let splashI = 0;
      if (progress < 0.3) {
        const sp = progress / 0.3;
        const splashRadius = 1.5 + sp * 1.0;
        if (dist < splashRadius) {
          splashI = (1 - dist / splashRadius) * (1 - sp * 0.5);
        }
      }
      // Spreading filled disk with internal ripple texture
      const diskRadius = Math.min(progress * 2.5, 1) * maxRadius;
      if (dist > diskRadius) return splashI * fade;
      // Bright edge ring
      const edgeDist = Math.abs(dist - diskRadius);
      const edgeWidth = 1.5;
      const edgeBright = edgeDist < edgeWidth ? (1 - edgeDist / edgeWidth) * 0.7 : 0;
      // Interior ripple texture (concentric waves inside the disk)
      const innerRatio = dist / Math.max(diskRadius, 0.01);
      const ripple = (Math.sin(dist * 2.5 - age * 0.5) + 1) / 2;
      const interiorI = (1 - innerRatio * 0.6) * 0.25 * (0.4 + 0.6 * ripple);
      return Math.max(splashI, edgeBright + interiorI) * fade;
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

  // 7. Laser — DJ-concert-style rotating laser beams with glow halos
  {
    name: "Laser",
    maxAge: 45,
    maxRadius: 32,
    intensity: (dx, dy, dist, age, maxAge, maxRadius) => {
      if (dist < 0.5) return 1 - age / maxAge;
      const progress = age / maxAge;
      const beamLength = Math.min(progress * 2, 1.0) * maxRadius; // fast extend
      if (dist > beamLength) return 0;
      const angle = Math.atan2(dy, dx);
      // Slow rotation — beams sweep ~15° over lifetime
      const rotation = age * 0.008;

      const numBeams = 7;
      let maxIntensity = 0;
      for (let i = 0; i < numBeams; i++) {
        const baseAngle = -Math.PI + ((i * 2.399) % (2 * Math.PI));
        const beamAngle = baseAngle + rotation;
        let angleDiff = Math.abs(angle - beamAngle);
        if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;

        // Staggered beam lengths for depth
        const thisLength = beamLength * (0.7 + (i % 3) * 0.15);
        if (dist > thisLength) continue;

        // Core beam — sharp but wider than before
        const beamWidth = 0.16 + dist * 0.01;
        // Glow halo — softer, wider falloff
        const haloWidth = beamWidth * 3.5;

        let intensity = 0;
        if (angleDiff < beamWidth) {
          const coreFade = 1 - angleDiff / beamWidth;
          intensity = Math.pow(coreFade, 2); // smoother edge than pow(3)
        } else if (angleDiff < haloWidth) {
          // Soft glow halo around beam
          const haloFade = 1 - (angleDiff - beamWidth) / (haloWidth - beamWidth);
          intensity = Math.pow(haloFade, 3) * 0.35;
        }
        if (intensity <= 0) continue;

        const tipDist = Math.abs(dist - thisLength);
        const tipGlow = tipDist < 3 ? (1 - tipDist / 3) * 0.8 : 0;
        const bodyGlow = 0.25 + 0.75 * (1 - dist / thisLength);
        const flicker = 0.85 + 0.15 * Math.sin(dist * 3.0 - age * 1.8 + i * 2.3);
        const fade = 1 - Math.pow(progress, 0.6);

        maxIntensity = Math.max(maxIntensity, intensity * (bodyGlow + tipGlow) * fade * flicker);
      }
      return maxIntensity;
    },
    hueShift: (dist, age) => dist * 18 + age * 8,
  },

  // 8. Bubble — floating bubbles with iridescent sheen & smooth pop
  {
    name: "Bubble",
    maxAge: 60,
    maxRadius: 22,
    intensity: (dx, dy, _dist, age, maxAge, _maxRadius) => {
      const progress = age / maxAge;
      const fade = 1 - Math.pow(progress, 0.35);
      const numBubbles = 8;
      let maxIntensity = 0;

      for (let i = 0; i < numBubbles; i++) {
        const bAngle = i * 2.399 + 0.5;
        // Wobbling float: sinusoidal offset on drift direction
        const wobbleAngle = bAngle + 0.3 * Math.sin(age * 0.15 + i * 1.8);
        const bCos = Math.cos(wobbleAngle);
        const bSin = Math.sin(wobbleAngle);
        const driftSpeed = 0.5 + (i % 4) * 0.12;
        const drift = age * driftSpeed * (1 - progress * 0.25);
        const bx = bCos * drift;
        const by = bSin * drift;

        const bdx = dx - bx;
        const bdy = dy - by;
        const bDist = Math.sqrt(bdx * bdx + bdy * bdy);

        // Smooth pop: expand briefly then fade (no abrupt shrink)
        const growPhase = Math.min(progress * 3, 1);
        const popStart = 0.8;
        const popPhase = progress > popStart ? (progress - popStart) / (1 - popStart) : 0;
        const sizeVar = 1.0 + i * 0.25;
        const bubbleRadius = sizeVar * growPhase * (1 + popPhase * 0.5); // expands on pop
        const popFade = 1 - Math.pow(popPhase, 0.5); // fades out smoothly
        if (bubbleRadius < 0.3 || popFade < 0.01) continue;

        const ringWidth = 0.5 + bubbleRadius * 0.18;
        const ringDist = Math.abs(bDist - bubbleRadius);
        if (bDist > bubbleRadius + ringWidth) continue;

        let intensity: number;
        if (ringDist < ringWidth) {
          intensity = (1 - ringDist / ringWidth) * 0.95;
        } else {
          // Iridescent inner fill — subtle rainbow gradient
          const innerRatio = bDist / bubbleRadius;
          const iridescentWave = (Math.sin(innerRatio * 8 + age * 0.3 + i * 2) + 1) / 2;
          intensity = (1 - innerRatio) * 0.3 * (0.5 + 0.5 * iridescentWave);
        }

        // Double specular highlights — top-left & bottom-right
        const spec1X = bdx + bubbleRadius * 0.3;
        const spec1Y = bdy + bubbleRadius * 0.3;
        const spec1Dist = Math.sqrt(spec1X * spec1X + spec1Y * spec1Y);
        const specR = bubbleRadius * 0.3;
        if (spec1Dist < specR) {
          intensity += (1 - spec1Dist / specR) * 0.7;
        }
        const spec2X = bdx - bubbleRadius * 0.2;
        const spec2Y = bdy - bubbleRadius * 0.25;
        const spec2Dist = Math.sqrt(spec2X * spec2X + spec2Y * spec2Y);
        if (spec2Dist < specR * 0.7) {
          intensity += (1 - spec2Dist / (specR * 0.7)) * 0.3;
        }

        const wobble = 0.85 + 0.15 * Math.sin(age * 0.4 + i * 2.1 + bDist * 1.0);
        maxIntensity = Math.max(
          maxIntensity,
          Math.min(1, intensity * fade * popFade * wobble),
        );
      }
      return maxIntensity;
    },
    hueShift: (dist, age) => dist * 30 + age * 5,
  },

  // 9. Firework — rocket trail → huge explosion pop
  {
    name: "Firework",
    maxAge: 50,
    maxRadius: 30,
    intensity: (dx, dy, _dist, age, maxAge, maxRadius) => {
      const progress = age / maxAge;
      const launchEnd = 0.12; // 12% of life = fast rocket
      const travelDist = maxRadius * 0.8;

      // Phase 1: rocket going up
      if (progress < launchEnd) {
        const lp = progress / launchEnd;
        const headY = -lp * travelDist;
        const hdx = dx;
        const hdy = dy - headY;
        const hDist = Math.sqrt(hdx * hdx + hdy * hdy);
        // Bright 3px rocket head
        if (hDist < 3.0) return 1.0 - hDist / 3.0;
        // Thick exhaust trail below
        const trailLen = lp * travelDist * 0.8;
        if (Math.abs(hdx) < 2.0 && hdy > 0 && hdy < trailLen) {
          const fade = 1 - hdy / trailLen;
          const width = 1 - Math.abs(hdx) / 2.0;
          const flicker = 0.5 + 0.5 * Math.sin(hdy * 5 + age * 4);
          return fade * width * flicker * 0.65;
        }
        return 0;
      }

      // Phase 2: explosion
      const ep = (progress - launchEnd) / (1 - launchEnd);
      const fade = 1 - Math.pow(ep, 0.3);
      const peakY = -travelDist;
      const cdy = dy - peakY;
      const cDist = Math.sqrt(dx * dx + cdy * cdy);
      let maxI = 0;

      // Big bright flash at pop center
      if (ep < 0.25) {
        const flashR = 5.0 + ep * 15;
        if (cDist < flashR) {
          maxI = (1 - cDist / flashR) * (1 - ep / 0.25);
        }
      }

      // 12 large sparks with heavy gravity arcs
      for (let i = 0; i < 12; i++) {
        const angle = i * (Math.PI * 2 / 12) + 0.2;
        const speed = 0.7 + (i % 3) * 0.2;
        const t = ep * maxRadius * 0.6;
        const sx = Math.cos(angle) * speed * t;
        const sy = Math.sin(angle) * speed * t + t * t * 0.25; // strong gravity
        const sdx = dx - sx;
        const sdy = cdy - sy;
        const sDist = Math.sqrt(sdx * sdx + sdy * sdy);

        // Big bright spark head (4px radius)
        if (sDist < 4.0) {
          const si = (1 - sDist / 4.0) * fade;
          maxI = Math.max(maxI, si);
        }
        // Wide glow halo (8px)
        if (sDist >= 4.0 && sDist < 8.0) {
          const gi = (1 - sDist / 8.0) * fade * 0.3;
          maxI = Math.max(maxI, gi);
        }

        // Streak trail: check points along the spark's past path
        for (let s = 1; s <= 4; s++) {
          const pastEp = Math.max(0, ep - s * 0.04);
          const pt = pastEp * maxRadius * 0.6;
          const px = Math.cos(angle) * speed * pt;
          const py = Math.sin(angle) * speed * pt + pt * pt * 0.25;
          const pdx = dx - px;
          const pdy = cdy - py;
          const pDist = Math.sqrt(pdx * pdx + pdy * pdy);
          if (pDist < 2.5) {
            const ti = (1 - pDist / 2.5) * fade * (0.5 - s * 0.1);
            maxI = Math.max(maxI, ti);
          }
        }
      }
      return maxI;
    },
    hueShift: (dist, age) => dist * 20 + age * 12,
  },

  // 10. Vortex — inward-flowing whirlpool with bright outer rim
  {
    name: "Vortex",
    maxAge: 55,
    maxRadius: 18,
    intensity: (dx, dy, dist, age, maxAge, maxRadius) => {
      const progress = age / maxAge;
      const outerRadius = maxRadius * Math.min(progress * 2, 1);
      if (dist > outerRadius + 1) return 0;
      const fade = 1 - Math.pow(progress, 0.5);

      // Bright core that accumulates over time
      if (dist < 1.5) {
        const coreGrow = Math.min(progress / 0.3, 1);
        const pulse = 0.7 + 0.3 * Math.sin(age * 0.5);
        return (1 - dist / 1.5) * fade * coreGrow * pulse;
      }

      const angle = Math.atan2(dy, dx);
      // Reverse rotation (opposite of Helix) — feels like inward pull
      const rotation = -age * 0.3;
      // Logarithmic spiral arms (tighten inward, unlike Helix linear spiral)
      const spiralAngle = angle + rotation + Math.log(dist + 1) * 2.0;
      const numArms = 4;
      const armValue = (Math.cos(spiralAngle * numArms) + 1) / 2;
      const armI = Math.pow(armValue, 2.5);

      // Bright outer rim (accretion ring)
      const rimDist = Math.abs(dist - outerRadius);
      const rimWidth = 1.5;
      const rimI = rimDist < rimWidth ? (1 - rimDist / rimWidth) * 0.5 : 0;

      // Radial: brighter toward outer edge (material swirling in)
      const radialFade = 0.3 + 0.7 * (dist / Math.max(outerRadius, 1));
      return Math.min(1, (armI * 0.6 * radialFade + rimI) * fade);
    },
    hueShift: (dist, age) => -dist * 10 + age * 8,
  },

  // 11. Plasma — organic flowing blob from overlapping sine fields
  {
    name: "Plasma",
    maxAge: 45,
    maxRadius: 16,
    intensity: (dx, dy, dist, age, maxAge, maxRadius) => {
      const progress = age / maxAge;
      const radius = Math.min(progress * 3, 1) * maxRadius;
      if (dist > radius) return 0;
      const fade = 1 - Math.pow(progress, 0.5);
      const t = age * 0.15;

      // 3 overlapping sine fields create organic plasma shapes
      const f1 = Math.sin(dx * 0.8 + t) + Math.sin(dy * 0.6 - t * 0.7);
      const f2 = Math.sin(dist * 0.9 - t * 1.3) + Math.sin((dx + dy) * 0.5 + t * 0.8);
      const f3 = Math.sin(dx * 0.3 - dy * 0.7 + t * 0.5) + Math.sin(dist * 0.4 + t);

      // Combine fields: range [-6, 6] → normalize to [0, 1]
      const combined = (f1 + f2 + f3 + 6) / 12;
      // Sharpen into blob shapes
      const shaped = Math.pow(combined, 1.5);

      const distFade = 1 - Math.pow(dist / radius, 2);
      return shaped * fade * Math.max(distFade, 0);
    },
    hueShift: (dist, age) => dist * 10 + age * 15,
  },

  // 12. Shockwave — thick double-ring with chromatic trail
  {
    name: "Shockwave",
    maxAge: 35,
    maxRadius: 22,
    intensity: (_dx, _dy, dist, age, maxAge, maxRadius) => {
      const progress = age / maxAge;
      const fade = 1 - Math.pow(progress, 0.4);

      // Bright center flash (first few frames)
      let centerFlash = 0;
      if (age < 4 && dist < 2) {
        centerFlash = (1 - dist / 2) * (1 - age / 4) * 0.8;
      }

      // Primary ring — thick expanding ring
      const primaryRadius = progress * maxRadius;
      const primaryWidth = 2.5 + progress * 2.5; // very thick
      const primaryRingDist = Math.abs(dist - primaryRadius);
      let primaryI = 0;
      if (primaryRingDist < primaryWidth) {
        const edge = 1 - primaryRingDist / primaryWidth;
        // Bright leading edge (outer), softer inner trail
        const isOuter = dist > primaryRadius;
        if (isOuter) {
          primaryI = Math.pow(edge, 1.5) * 1.0;
        } else {
          primaryI = Math.pow(edge, 0.8) * 0.5; // slow-fading inner trail
        }
        primaryI *= fade;
      }

      // Secondary ring — fainter, follows with delay
      const secDelay = 4;
      const secAge = age - secDelay;
      let secI = 0;
      if (secAge > 0) {
        const secProgress = secAge / (maxAge - secDelay);
        if (secProgress <= 1) {
          const secRadius = secProgress * maxRadius * 0.85;
          const secWidth = 1.5 + secProgress * 1.5;
          const secRingDist = Math.abs(dist - secRadius);
          if (secRingDist < secWidth) {
            secI = (1 - secRingDist / secWidth) * fade * 0.4;
          }
        }
      }

      return Math.min(1, Math.max(centerFlash, primaryI + secI));
    },
    hueShift: (dist, age) => dist * 12 + age * 8,
  },

  // 13. Butterfly — fluttering wings dispersing outward
  {
    name: "Butterfly",
    maxAge: 60,
    maxRadius: 20,
    intensity: (dx, dy, dist, age, maxAge, maxRadius) => {
      const progress = age / maxAge;
      const fade = 1 - Math.pow(progress, 0.4);
      let maxI = 0;

      for (let i = 0; i < 6; i++) {
        // Each butterfly drifts in a unique direction
        const driftAngle = i * 2.399 + 0.7;
        const wobble = 0.4 * Math.sin(age * 0.2 + i * 1.5); // lateral wobble
        const driftSpeed = 0.3 + (i % 3) * 0.1;
        const drift = age * driftSpeed * (1 - progress * 0.2);
        const bx = Math.cos(driftAngle + wobble) * drift;
        const by = Math.sin(driftAngle + wobble) * drift - drift * 0.05; // slight upward bias
        const bdx = dx - bx;
        const bdy = dy - by;
        const bDist = Math.sqrt(bdx * bdx + bdy * bdy);

        // Wing size varies per butterfly
        const wingSpan = 1.2 + (i % 3) * 0.6;
        const bodyLen = wingSpan * 0.6;

        // Flutter: wings beat sinusoidally
        const flutter = Math.abs(Math.sin(age * 0.35 + i * 2.1));
        const wingWidth = wingSpan * (0.3 + 0.7 * flutter);

        // Body is a thin vertical line
        if (Math.abs(bdx) < 0.5 && Math.abs(bdy) < bodyLen) {
          const bodyI = (1 - Math.abs(bdy) / bodyLen) * 0.8 * fade;
          maxI = Math.max(maxI, bodyI);
          continue;
        }

        // Wings: two lobes (upper-left / upper-right or rotated)
        const wingAngle = driftAngle + Math.PI / 2; // perpendicular to drift
        const cosA = Math.cos(wingAngle);
        const sinA = Math.sin(wingAngle);
        // Rotate into butterfly-local space
        const lx = bdx * cosA + bdy * sinA; // along wingspan
        const ly = -bdx * sinA + bdy * cosA; // along body

        const absLx = Math.abs(lx);
        if (absLx > wingWidth || absLx < 0.2) continue;
        if (Math.abs(ly) > bodyLen * 0.8) continue;

        // Wing shape: rounded triangular lobe
        const wingRatio = absLx / wingWidth;
        const maxLy = bodyLen * 0.7 * (1 - wingRatio * 0.6);
        if (Math.abs(ly) > maxLy) continue;

        const edgeFade = 1 - wingRatio;
        const heightFade = 1 - Math.abs(ly) / maxLy;
        const wingI = edgeFade * heightFade * flutter * 0.9 * fade;
        maxI = Math.max(maxI, wingI);
      }
      return maxI;
    },
    hueShift: (dist, age) => dist * 25 + age * 10,
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
