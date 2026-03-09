/**
 * GLEffectsRenderer — GPU-accelerated effects computation via WebGL.
 *
 * Replaces the CPU-bound per-cell intensity loop in EffectsEngine._tick()
 * with a GLSL fragment shader that computes all cells in parallel on the GPU.
 *
 * Architecture:
 * - Offscreen WebGL canvas sized to grid dimensions (cols × rows)
 * - Fullscreen-quad fragment shader with all 12 preset intensity functions
 * - Batched rendering: up to 16 effects per draw call, additive blending
 * - readPixels() outputs directly into the overlay Uint8ClampedArray
 *
 * Fallback: GLEffectsRenderer.create() returns null if WebGL is unavailable.
 */

// ── Public interface for effect data consumed by the renderer ──

export interface GLEffectInput {
  readonly col: number;
  readonly row: number;
  readonly age: number;
  readonly effectiveMaxAge: number;
  readonly effectiveMaxRadius: number;
  readonly color: readonly [number, number, number];
  readonly hsl: readonly [number, number, number];
  readonly presetIndex: number;
  readonly isMulti: boolean;
}

// ── Shader source code ────────────────────────────────────────

const VERTEX_SRC = `
attribute vec2 a_pos;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

const MAX_BATCH = 16;

const FRAGMENT_SRC = `
precision highp float;

uniform vec2 u_gridSize;
uniform int u_numEffects;
uniform vec2 u_pos[${MAX_BATCH}];
uniform vec4 u_params[${MAX_BATCH}];
uniform vec4 u_color[${MAX_BATCH}];
uniform vec3 u_hsl[${MAX_BATCH}];

// ── HSL → RGB (port of utils.ts hslToRgb) ──────────────────
vec3 hslToRgb(float h, float s, float l) {
  float s1 = s * 0.01;
  float l1 = l * 0.01;
  float a = s1 * (l1 < 0.5 ? l1 : 1.0 - l1);
  float h30 = h / 30.0;

  float k, t, u;

  k = mod(h30, 12.0);
  t = k - 3.0; t = max(t, -1.0); u = 9.0 - k; t = min(t, u); t = min(t, 1.0);
  float r = l1 - a * t;

  k = mod(8.0 + h30, 12.0);
  t = k - 3.0; t = max(t, -1.0); u = 9.0 - k; t = min(t, u); t = min(t, 1.0);
  float g = l1 - a * t;

  k = mod(4.0 + h30, 12.0);
  t = k - 3.0; t = max(t, -1.0); u = 9.0 - k; t = min(t, u); t = min(t, 1.0);
  float b = l1 - a * t;

  return vec3(r, g, b);
}

// ── Constants ───────────────────────────────────────────────
const float PI  = 3.14159265359;
const float TAU = 6.28318530718;

// ── Preset 0: Ripple ────────────────────────────────────────
float intensityRipple(float dx, float dy, float dist, float age, float maxAge, float maxRadius) {
  float progress = age / maxAge;
  float currentRadius = progress * maxRadius;
  float ringWidth = 1.2 + progress * 1.8;
  float ringDist = abs(dist - currentRadius);
  if (ringDist > ringWidth) return 0.0;
  float fade = 1.0 - pow(progress, 0.7);
  return (1.0 - ringDist / ringWidth) * fade;
}

// ── Preset 1: Wave — S-shaped water wave spreading horizontally ─
float intensityWave(float dx, float dy, float dist, float age, float maxAge, float maxRadius) {
  float progress = age / maxAge;
  float fade = 1.0 - pow(progress, 0.5);
  float mx = 0.0;
  for (int w = 0; w < 3; w++) {
    float delay = float(w) * 5.0;
    float effAge = age - delay;
    if (effAge < 0.0) continue;
    float wp = effAge / (maxAge - delay);
    if (wp > 1.0) continue;
    float spread = wp * maxRadius;
    float absDx = abs(dx);
    if (absDx > spread + 1.0) continue;
    float amplitude = 1.5 + wp * 2.5;
    float waveY = amplitude * sin(dx * 0.6 - effAge * 0.25);
    float dfc = abs(dy - waveY);
    float thickness = 1.2 + wp * 0.8 - float(w) * 0.2;
    if (dfc > thickness) continue;
    float tipFade = absDx > spread - 2.0 ? 1.0 - (absDx - spread + 2.0) / 3.0 : 1.0;
    float ef = 1.0 - dfc / thickness;
    float wf = 1.0 - float(w) * 0.3;
    mx = max(mx, ef * fade * wf * max(tipFade, 0.0));
  }
  return mx;
}

// ── Preset 2: Raindrop — splash + filled disk with ripple texture ─
float intensityRaindrop(float dx, float dy, float dist, float age, float maxAge, float maxRadius) {
  float progress = age / maxAge;
  float fade = 1.0 - pow(progress, 0.5);
  float splashI = 0.0;
  if (progress < 0.3) {
    float sp = progress / 0.3;
    float splashR = 1.5 + sp * 1.0;
    if (dist < splashR) {
      splashI = (1.0 - dist / splashR) * (1.0 - sp * 0.5);
    }
  }
  float diskRadius = min(progress * 2.5, 1.0) * maxRadius;
  if (dist > diskRadius) return splashI * fade;
  float edgeDist = abs(dist - diskRadius);
  float edgeBright = edgeDist < 1.5 ? (1.0 - edgeDist / 1.5) * 0.7 : 0.0;
  float innerRatio = dist / max(diskRadius, 0.01);
  float ripple = (sin(dist * 2.5 - age * 0.5) + 1.0) / 2.0;
  float interiorI = (1.0 - innerRatio * 0.6) * 0.25 * (0.4 + 0.6 * ripple);
  return max(splashI, edgeBright + interiorI) * fade;
}

// ── Preset 3: Star Burst ────────────────────────────────────
float intensityStarBurst(float dx, float dy, float dist, float age, float maxAge, float maxRadius) {
  if (dist < 0.5) return 1.0 - age / maxAge;
  float progress = age / maxAge;
  float currentRadius = progress * maxRadius;
  if (dist > currentRadius) return 0.0;
  float angle = atan(dy, dx);
  float rayAngle = TAU / 8.0;
  float mad = 999.0;
  for (int i = 0; i < 8; i++) {
    float target = -PI + float(i) * rayAngle;
    float diff = abs(angle - target);
    if (diff > PI) diff = TAU - diff;
    mad = min(mad, diff);
  }
  float rayWidth = 0.35 / (1.0 + dist * 0.15);
  if (mad > rayWidth) return 0.0;
  float fade = 1.0 - pow(progress, 0.7);
  float angleFade = 1.0 - mad / rayWidth;
  float distFade = 0.4 + 0.6 * (1.0 - dist / currentRadius);
  return angleFade * fade * distFade;
}

// ── Preset 4: Helix ─────────────────────────────────────────
float intensityHelix(float dx, float dy, float dist, float age, float maxAge, float maxRadius) {
  if (dist < 0.5) return 1.0 - age / maxAge;
  float progress = age / maxAge;
  float currentRadius = progress * maxRadius;
  if (dist > currentRadius) return 0.0;
  float angle = atan(dy, dx);
  float rotation = age * 0.25;
  float spiralAngle = angle - rotation + dist * 0.5;
  float arm = (cos(spiralAngle * 2.0) + 1.0) / 2.0;
  float fade = 1.0 - pow(progress, 0.6);
  float distFade = 0.3 + 0.7 * (1.0 - dist / currentRadius);
  float armI = arm * arm;
  return armI * fade * distFade;
}

// ── Preset 5: Sparkle ───────────────────────────────────────
float intensitySparkle(float dx, float dy, float dist, float age, float maxAge, float maxRadius) {
  float progress = age / maxAge;
  float currentRadius = 2.0 + progress * maxRadius;
  if (dist > currentRadius) return 0.0;
  float hash = sin(dx * 127.1 + dy * 311.7 + age * 43.3) * 43758.5453;
  float sparkle = fract(hash);
  if (sparkle < 0.85) return 0.0;
  float fade = 1.0 - pow(progress, 0.5);
  float twinkle = (sin(age * 1.2 + dist * 2.0) + 1.0) / 2.0;
  return twinkle * fade * (1.0 - (dist / currentRadius) * 0.5);
}

// ── Preset 6: Laser — rotating beams with glow halos ────────
float intensityLaser(float dx, float dy, float dist, float age, float maxAge, float maxRadius) {
  if (dist < 0.5) return 1.0 - age / maxAge;
  float progress = age / maxAge;
  float beamLength = min(progress * 2.0, 1.0) * maxRadius;
  if (dist > beamLength) return 0.0;
  float angle = atan(dy, dx);
  float rotation = age * 0.008;
  float mx = 0.0;
  for (int i = 0; i < 7; i++) {
    float baseAngle = -PI + mod(float(i) * 2.399, TAU);
    float ba = baseAngle + rotation;
    float ad = abs(angle - ba);
    if (ad > PI) ad = TAU - ad;
    float thisLen = beamLength * (0.7 + mod(float(i), 3.0) * 0.15);
    if (dist > thisLen) continue;
    float bw = 0.16 + dist * 0.01;
    float hw = bw * 3.5;
    float inten = 0.0;
    if (ad < bw) {
      float cf = 1.0 - ad / bw;
      inten = cf * cf;
    } else if (ad < hw) {
      float hf = 1.0 - (ad - bw) / (hw - bw);
      inten = hf * hf * hf * 0.35;
    }
    if (inten <= 0.0) continue;
    float tipDist = abs(dist - thisLen);
    float tipGlow = tipDist < 3.0 ? (1.0 - tipDist / 3.0) * 0.8 : 0.0;
    float bodyGlow = 0.25 + 0.75 * (1.0 - dist / thisLen);
    float flicker = 0.85 + 0.15 * sin(dist * 3.0 - age * 1.8 + float(i) * 2.3);
    float fade = 1.0 - pow(progress, 0.6);
    mx = max(mx, inten * (bodyGlow + tipGlow) * fade * flicker);
  }
  return mx;
}

// ── Preset 7: Bubble — iridescent, wobbling, smooth pop ─────
float intensityBubble(float dx, float dy, float dist, float age, float maxAge, float maxRadius) {
  float progress = age / maxAge;
  float fade = 1.0 - pow(progress, 0.35);
  float mx = 0.0;
  for (int i = 0; i < 8; i++) {
    float bAngle = float(i) * 2.399 + 0.5;
    float wobbleAngle = bAngle + 0.3 * sin(age * 0.15 + float(i) * 1.8);
    float bCos = cos(wobbleAngle);
    float bSin = sin(wobbleAngle);
    float driftSpeed = 0.5 + mod(float(i), 4.0) * 0.12;
    float drift = age * driftSpeed * (1.0 - progress * 0.25);
    float bx = bCos * drift;
    float by = bSin * drift;
    float bdx = dx - bx;
    float bdy = dy - by;
    float bDist = sqrt(bdx * bdx + bdy * bdy);
    float growPhase = min(progress * 3.0, 1.0);
    float popPhase = progress > 0.8 ? (progress - 0.8) / 0.2 : 0.0;
    float sizeVar = 1.0 + float(i) * 0.6;
    float bubbleR = sizeVar * growPhase * (1.0 + popPhase * 0.5) * 1.5;
    float popFade = 1.0 - pow(popPhase, 0.5);
    if (bubbleR < 0.3 || popFade < 0.01) continue;
    float rw = 0.5 + bubbleR * 0.18;
    float rd = abs(bDist - bubbleR);
    if (bDist > bubbleR + rw) continue;
    float inten;
    if (rd < rw) {
      inten = (1.0 - rd / rw) * 0.95;
    } else {
      float innerRatio = bDist / bubbleR;
      float iridWave = (sin(innerRatio * 8.0 + age * 0.3 + float(i) * 2.0) + 1.0) / 2.0;
      inten = (1.0 - innerRatio) * 0.3 * (0.5 + 0.5 * iridWave);
    }
    float spec1X = bdx + bubbleR * 0.3;
    float spec1Y = bdy + bubbleR * 0.3;
    float spec1D = sqrt(spec1X * spec1X + spec1Y * spec1Y);
    float specR = bubbleR * 0.3;
    if (spec1D < specR) inten += (1.0 - spec1D / specR) * 0.7;
    float spec2X = bdx - bubbleR * 0.2;
    float spec2Y = bdy - bubbleR * 0.25;
    float spec2D = sqrt(spec2X * spec2X + spec2Y * spec2Y);
    if (spec2D < specR * 0.7) inten += (1.0 - spec2D / (specR * 0.7)) * 0.3;
    float wobble = 0.85 + 0.15 * sin(age * 0.4 + float(i) * 2.1 + bDist * 1.0);
    mx = max(mx, min(1.0, inten * fade * popFade * wobble));
  }
  return mx;
}

// ── Preset 8: Firework — rocket trail → huge explosion pop ──
float intensityFirework(float dx, float dy, float dist, float age, float maxAge, float maxRadius) {
  float progress = age / maxAge;
  float launchEnd = 0.06;
  float travelDist = maxRadius * 0.8;
  // Phase 1: rocket going up
  if (progress < launchEnd) {
    float lp = progress / launchEnd;
    float headY = -lp * travelDist;
    float hdx = dx;
    float hdy = dy - headY;
    float hDist = sqrt(hdx * hdx + hdy * hdy);
    if (hDist < 3.0) return 1.0 - hDist / 3.0;
    float trailLen = lp * travelDist * 0.8;
    if (abs(hdx) < 2.0 && hdy > 0.0 && hdy < trailLen) {
      float fd = 1.0 - hdy / trailLen;
      float wd = 1.0 - abs(hdx) / 2.0;
      float fl = 0.5 + 0.5 * sin(hdy * 5.0 + age * 4.0);
      return fd * wd * fl * 0.65;
    }
    return 0.0;
  }
  // Phase 2: explosion
  float ep = (progress - launchEnd) / (1.0 - launchEnd);
  float fade = 1.0 - pow(ep, 0.3);
  float peakY = -travelDist;
  float cdy = dy - peakY;
  float cDist = sqrt(dx * dx + cdy * cdy);
  float mx = 0.0;
  // Big bright flash
  if (ep < 0.25) {
    float flashR = 5.0 + ep * 15.0;
    if (cDist < flashR) {
      mx = (1.0 - cDist / flashR) * (1.0 - ep / 0.25);
    }
  }
  // 12 large sparks with gravity arcs and streak trails
  for (int i = 0; i < 12; i++) {
    float angle = float(i) * TAU / 12.0 + 0.2;
    float speed = 0.7 + mod(float(i), 3.0) * 0.2;
    float t = ep * maxRadius * 0.6;
    float sx = cos(angle) * speed * t;
    float sy = sin(angle) * speed * t + t * t * 0.25;
    float sdx = dx - sx;
    float sdy = cdy - sy;
    float sDist = sqrt(sdx * sdx + sdy * sdy);
    if (sDist < 4.0) mx = max(mx, (1.0 - sDist / 4.0) * fade);
    else if (sDist < 8.0) mx = max(mx, (1.0 - sDist / 8.0) * fade * 0.3);
    // Streak trail (4 past positions)
    for (int s = 1; s <= 4; s++) {
      float pastEp = max(0.0, ep - float(s) * 0.04);
      float pt = pastEp * maxRadius * 0.6;
      float px = cos(angle) * speed * pt;
      float py = sin(angle) * speed * pt + pt * pt * 0.25;
      float pdx = dx - px;
      float pdy = cdy - py;
      float pDist = sqrt(pdx * pdx + pdy * pdy);
      if (pDist < 2.5) mx = max(mx, (1.0 - pDist / 2.5) * fade * (0.5 - float(s) * 0.1));
    }
  }
  return mx;
}

// ── Preset 9: Vortex — inward whirlpool with bright rim ──────
float intensityVortex(float dx, float dy, float dist, float age, float maxAge, float maxRadius) {
  float progress = age / maxAge;
  float outerRadius = maxRadius * min(progress * 2.0, 1.0);
  if (dist > outerRadius + 1.0) return 0.0;
  float fade = 1.0 - pow(progress, 0.5);
  if (dist < 1.5) {
    float coreGrow = min(progress / 0.3, 1.0);
    float pulse = 0.7 + 0.3 * sin(age * 0.5);
    return (1.0 - dist / 1.5) * fade * coreGrow * pulse;
  }
  float angle = atan(dy, dx);
  float rotation = -age * 0.3;
  float spiralAngle = angle + rotation + log(dist + 1.0) * 2.0;
  float armVal = (cos(spiralAngle * 4.0) + 1.0) / 2.0;
  float armI = pow(armVal, 2.5);
  float rimDist = abs(dist - outerRadius);
  float rimI = rimDist < 1.5 ? (1.0 - rimDist / 1.5) * 0.5 : 0.0;
  float radialFade = 0.3 + 0.7 * (dist / max(outerRadius, 1.0));
  return min(1.0, (armI * 0.6 * radialFade + rimI) * fade);
}

// ── Preset 10: Plasma — overlapping sine fields ─────────────
float intensityPlasma(float dx, float dy, float dist, float age, float maxAge, float maxRadius) {
  float progress = age / maxAge;
  float radius = min(progress * 3.0, 1.0) * maxRadius;
  if (dist > radius) return 0.0;
  float fade = 1.0 - pow(progress, 0.5);
  float t = age * 0.15;
  float f1 = sin(dx * 0.8 + t) + sin(dy * 0.6 - t * 0.7);
  float f2 = sin(dist * 0.9 - t * 1.3) + sin((dx + dy) * 0.5 + t * 0.8);
  float f3 = sin(dx * 0.3 - dy * 0.7 + t * 0.5) + sin(dist * 0.4 + t);
  float combined = (f1 + f2 + f3 + 6.0) / 12.0;
  float shaped = pow(combined, 1.5);
  float df = 1.0 - pow(dist / radius, 2.0);
  return shaped * fade * max(df, 0.0);
}

// ── Preset 11: Shockwave — thick double-ring ────────────────
float intensityShockwave(float dx, float dy, float dist, float age, float maxAge, float maxRadius) {
  float progress = age / maxAge;
  float fade = 1.0 - pow(progress, 0.4);
  float centerFlash = 0.0;
  if (age < 4.0 && dist < 2.0) {
    centerFlash = (1.0 - dist / 2.0) * (1.0 - age / 4.0) * 0.8;
  }
  float primaryRadius = progress * maxRadius;
  float pw = 2.5 + progress * 2.5;
  float prd = abs(dist - primaryRadius);
  float primaryI = 0.0;
  if (prd < pw) {
    float edge = 1.0 - prd / pw;
    if (dist > primaryRadius) {
      primaryI = pow(edge, 1.5);
    } else {
      primaryI = pow(edge, 0.8) * 0.5;
    }
    primaryI *= fade;
  }
  float secI = 0.0;
  float secAge = age - 4.0;
  if (secAge > 0.0) {
    float sp = secAge / (maxAge - 4.0);
    if (sp <= 1.0) {
      float sr = sp * maxRadius * 0.85;
      float sw = 1.5 + sp * 1.5;
      float srd = abs(dist - sr);
      if (srd < sw) {
        secI = (1.0 - srd / sw) * fade * 0.4;
      }
    }
  }
  return min(1.0, max(centerFlash, primaryI + secI));
}

// ── Preset 12: Butterfly — fluttering wings dispersing ─────
float intensityButterfly(float dx, float dy, float dist, float age, float maxAge, float maxRadius) {
  float progress = age / maxAge;
  float fade = 1.0 - pow(progress, 0.4);
  float mx = 0.0;
  for (int i = 0; i < 6; i++) {
    float driftAngle = float(i) * 2.399 + 0.7;
    float wobble = 0.4 * sin(age * 0.2 + float(i) * 1.5);
    float driftSpeed = 0.3 + mod(float(i), 3.0) * 0.1;
    float drift = age * driftSpeed * (1.0 - progress * 0.2);
    float bx = cos(driftAngle + wobble) * drift;
    float by = sin(driftAngle + wobble) * drift - drift * 0.05;
    float bdx = dx - bx;
    float bdy = dy - by;
    float wingSpan = 1.2 + mod(float(i), 3.0) * 0.6;
    float bodyLen = wingSpan * 0.6;
    float flutter = abs(sin(age * 0.35 + float(i) * 2.1));
    float wingWidth = wingSpan * (0.3 + 0.7 * flutter);
    // Body
    if (abs(bdx) < 0.5 && abs(bdy) < bodyLen) {
      mx = max(mx, (1.0 - abs(bdy) / bodyLen) * 0.8 * fade);
      continue;
    }
    // Wings in local space
    float wa = driftAngle + PI / 2.0;
    float ca = cos(wa);
    float sa = sin(wa);
    float lx = bdx * ca + bdy * sa;
    float ly = -bdx * sa + bdy * ca;
    float alx = abs(lx);
    if (alx > wingWidth || alx < 0.2) continue;
    if (abs(ly) > bodyLen * 0.8) continue;
    float wr = alx / wingWidth;
    float mly = bodyLen * 0.7 * (1.0 - wr * 0.6);
    if (abs(ly) > mly) continue;
    float ef = 1.0 - wr;
    float hf = 1.0 - abs(ly) / mly;
    mx = max(mx, ef * hf * flutter * 0.9 * fade);
  }
  return mx;
}

// ── Compute hue-shift value per preset ──────────────────────
vec2 hueShiftForPreset(int preset, float dist, float age) {
  if (preset == 0) return vec2(1.0, dist * 8.0);
  if (preset == 1) return vec2(1.0, dist * 6.0 + age * 4.0);
  if (preset == 2) return vec2(1.0, age * 5.0);
  if (preset == 3) return vec2(1.0, dist * 15.0);
  if (preset == 4) return vec2(1.0, dist * 12.0 + age * 8.0);
  if (preset == 5) return vec2(1.0, age * 12.0);
  if (preset == 6) return vec2(1.0, dist * 18.0 + age * 8.0);
  if (preset == 7) return vec2(1.0, dist * 30.0 + age * 5.0);
  if (preset == 8) return vec2(1.0, dist * 20.0 + age * 12.0);
  if (preset == 9) return vec2(1.0, -dist * 10.0 + age * 8.0);
  if (preset == 10) return vec2(1.0, dist * 10.0 + age * 15.0);
  if (preset == 11) return vec2(1.0, dist * 12.0 + age * 8.0);
  if (preset == 12) return vec2(1.0, dist * 25.0 + age * 10.0);
  return vec2(0.0, 0.0);
}

// ── Dispatch intensity by preset index ──────────────────────
float computeIntensity(int preset, float dx, float dy, float dist, float age, float maxAge, float maxRadius) {
  if (preset == 0) return intensityRipple(dx, dy, dist, age, maxAge, maxRadius);
  if (preset == 1) return intensityWave(dx, dy, dist, age, maxAge, maxRadius);
  if (preset == 2) return intensityRaindrop(dx, dy, dist, age, maxAge, maxRadius);
  if (preset == 3) return intensityStarBurst(dx, dy, dist, age, maxAge, maxRadius);
  if (preset == 4) return intensityHelix(dx, dy, dist, age, maxAge, maxRadius);
  if (preset == 5) return intensitySparkle(dx, dy, dist, age, maxAge, maxRadius);
  if (preset == 6) return intensityLaser(dx, dy, dist, age, maxAge, maxRadius);
  if (preset == 7) return intensityBubble(dx, dy, dist, age, maxAge, maxRadius);
  if (preset == 8) return intensityFirework(dx, dy, dist, age, maxAge, maxRadius);
  if (preset == 9) return intensityVortex(dx, dy, dist, age, maxAge, maxRadius);
  if (preset == 10) return intensityPlasma(dx, dy, dist, age, maxAge, maxRadius);
  if (preset == 11) return intensityShockwave(dx, dy, dist, age, maxAge, maxRadius);
  if (preset == 12) return intensityButterfly(dx, dy, dist, age, maxAge, maxRadius);
  return 0.0;
}

// ── Main ────────────────────────────────────────────────────
void main() {
  float col = floor(gl_FragCoord.x);
  float row = floor(gl_FragCoord.y);

  vec4 total = vec4(0.0);

  for (int i = 0; i < ${MAX_BATCH}; i++) {
    if (i >= u_numEffects) break;

    float ec = u_pos[i].x;
    float er = u_pos[i].y;
    float age      = u_params[i].x;
    float maxAge   = u_params[i].y;
    float maxRadius = u_params[i].z;
    int   preset   = int(u_params[i].w);

    float dx = col - ec;
    float dy = row - er;
    float dist = sqrt(dx * dx + dy * dy);

    // Early radius cull
    float curR = (age / maxAge) * maxRadius + 2.0;
    if (dist > curR + 3.0) continue;

    float inten = computeIntensity(preset, dx, dy, dist, age, maxAge, maxRadius);
    if (inten <= 0.01) continue;

    // Colour (with optional hue shift)
    vec3 rgb;
    vec2 hs = hueShiftForPreset(preset, dist, age);
    bool isMulti = u_color[i].a > 0.5;
    if (isMulti && hs.x > 0.5) {
      float h = u_hsl[i].x;
      float s = u_hsl[i].y;
      float l = u_hsl[i].z;
      rgb = hslToRgb(mod(h + hs.y, 360.0), s, l);
    } else {
      rgb = u_color[i].rgb;
    }

    total += vec4(rgb * inten, inten);
  }

  gl_FragColor = total;
}
`;

// ── GLEffectsRenderer class ─────────────────────────────────

export class GLEffectsRenderer {
  private gl: WebGLRenderingContext;
  private canvas: HTMLCanvasElement;
  private program: WebGLProgram;
  private vbo: WebGLBuffer;

  // Uniform locations
  private uGridSize: WebGLUniformLocation;
  private uNumEffects: WebGLUniformLocation;
  private uPos: WebGLUniformLocation[];
  private uParams: WebGLUniformLocation[];
  private uColor: WebGLUniformLocation[];
  private uHsl: WebGLUniformLocation[];

  private _cols = 0;
  private _rows = 0;
  private _readBuf: Uint8Array = new Uint8Array(0);

  /**
   * Factory — returns null if WebGL is not available.
   */
  static create(): GLEffectsRenderer | null {
    try {
      return new GLEffectsRenderer();
    } catch {
      return null;
    }
  }

  private constructor() {
    this.canvas = document.createElement("canvas");
    const gl = this.canvas.getContext("webgl", {
      alpha: true,
      premultipliedAlpha: false,
      antialias: false,
      preserveDrawingBuffer: false,
    });
    if (!gl) throw new Error("WebGL not available");
    this.gl = gl;

    // ── Compile shaders ──────────────────────────────────
    const vs = this.compileShader(gl.VERTEX_SHADER, VERTEX_SRC);
    const fs = this.compileShader(gl.FRAGMENT_SHADER, FRAGMENT_SRC);

    this.program = gl.createProgram()!;
    gl.attachShader(this.program, vs);
    gl.attachShader(this.program, fs);
    gl.linkProgram(this.program);
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
      const info = gl.getProgramInfoLog(this.program);
      gl.deleteProgram(this.program);
      throw new Error("Shader link failed: " + info);
    }
    gl.deleteShader(vs);
    gl.deleteShader(fs);

    // ── Fullscreen quad VBO ──────────────────────────────
    this.vbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );

    const aPos = gl.getAttribLocation(this.program, "a_pos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    // ── Resolve uniform locations ────────────────────────
    gl.useProgram(this.program);
    this.uGridSize = gl.getUniformLocation(this.program, "u_gridSize")!;
    this.uNumEffects = gl.getUniformLocation(this.program, "u_numEffects")!;

    this.uPos = [];
    this.uParams = [];
    this.uColor = [];
    this.uHsl = [];
    for (let i = 0; i < MAX_BATCH; i++) {
      this.uPos.push(gl.getUniformLocation(this.program, `u_pos[${i}]`)!);
      this.uParams.push(
        gl.getUniformLocation(this.program, `u_params[${i}]`)!,
      );
      this.uColor.push(gl.getUniformLocation(this.program, `u_color[${i}]`)!);
      this.uHsl.push(gl.getUniformLocation(this.program, `u_hsl[${i}]`)!);
    }
  }

  // ── Resize to match grid dimensions ────────────────────

  resize(cols: number, rows: number): void {
    if (cols === this._cols && rows === this._rows) return;
    this._cols = cols;
    this._rows = rows;
    this.canvas.width = cols;
    this.canvas.height = rows;
    this.gl.viewport(0, 0, cols, rows);
    this._readBuf = new Uint8Array(cols * rows * 4);
  }

  // ── Render effects into the overlay buffer ─────────────

  render(
    effects: readonly GLEffectInput[],
    outputBuffer: Uint8ClampedArray,
  ): void {
    if (effects.length === 0) {
      outputBuffer.fill(0);
      return;
    }

    const gl = this.gl;

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);

    gl.useProgram(this.program);
    gl.uniform2f(this.uGridSize, this._cols, this._rows);

    // Render in batches of MAX_BATCH
    for (let start = 0; start < effects.length; start += MAX_BATCH) {
      const count = Math.min(MAX_BATCH, effects.length - start);
      gl.uniform1i(this.uNumEffects, count);

      for (let i = 0; i < count; i++) {
        const e = effects[start + i];
        gl.uniform2f(this.uPos[i], e.col, e.row);
        gl.uniform4f(
          this.uParams[i],
          e.age,
          e.effectiveMaxAge,
          e.effectiveMaxRadius,
          e.presetIndex,
        );
        gl.uniform4f(
          this.uColor[i],
          e.color[0] / 255,
          e.color[1] / 255,
          e.color[2] / 255,
          e.isMulti ? 1.0 : 0.0,
        );
        gl.uniform3f(
          this.uHsl[i],
          e.hsl[0],
          e.hsl[1],
          Math.max(e.hsl[2], 30),
        );
      }

      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    // Read back pixels into output buffer
    gl.readPixels(
      0,
      0,
      this._cols,
      this._rows,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      this._readBuf,
    );
    outputBuffer.set(this._readBuf);
  }

  // ── Cleanup ────────────────────────────────────────────

  destroy(): void {
    const gl = this.gl;
    gl.deleteProgram(this.program);
    gl.deleteBuffer(this.vbo);
    const ext = gl.getExtension("WEBGL_lose_context");
    if (ext) ext.loseContext();
  }

  // ── Helpers ────────────────────────────────────────────

  private compileShader(type: number, src: string): WebGLShader {
    const gl = this.gl;
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const info = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error("Shader compile failed: " + info);
    }
    return shader;
  }
}
