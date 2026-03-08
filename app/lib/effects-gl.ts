/**
 * GLEffectsRenderer — GPU-accelerated effects computation via WebGL.
 *
 * Replaces the CPU-bound per-cell intensity loop in EffectsEngine._tick()
 * with a GLSL fragment shader that computes all cells in parallel on the GPU.
 *
 * Architecture:
 * - Offscreen WebGL canvas sized to grid dimensions (cols × rows)
 * - Fullscreen-quad fragment shader with all 8 preset intensity functions
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
uniform vec3 u_color[${MAX_BATCH}];
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

// ── Preset 1: Wave ──────────────────────────────────────────
float intensityWave(float dx, float dy, float dist, float age, float maxAge, float maxRadius) {
  float progress = age / maxAge;
  float currentSpread = progress * maxRadius;
  float absDx = abs(dx);
  float absDy = abs(dy);
  if (absDx > currentSpread) return 0.0;
  float waveHeight = 1.5 + progress * 1.0;
  if (absDy > waveHeight) return 0.0;
  float frontDist = abs(absDx - currentSpread);
  if (frontDist > 3.0) return 0.0;
  float fade = 1.0 - pow(progress, 0.6);
  float yFade = 1.0 - absDy / waveHeight;
  float frontFade = 1.0 - frontDist / 3.0;
  float wave = (sin(absDx * 0.8 - age * 0.4) + 1.0) / 2.0;
  return frontFade * yFade * fade * (0.4 + 0.6 * wave);
}

// ── Preset 2: Raindrop ──────────────────────────────────────
float intensityRaindrop(float dx, float dy, float dist, float age, float maxAge, float maxRadius) {
  float progress = age / maxAge;
  float fade = 1.0 - pow(progress, 0.5);
  float mx = 0.0;
  for (int ring = 0; ring < 3; ring++) {
    float delay = float(ring) * 4.0;
    float effAge = age - delay;
    if (effAge < 0.0) continue;
    float rp = effAge / (maxAge - delay);
    if (rp > 1.0) continue;
    float cr = rp * maxRadius * (1.0 - float(ring) * 0.15);
    float rw = 0.8 + rp * 0.8;
    float rd = abs(dist - cr);
    if (rd > rw) continue;
    float rf = 1.0 - float(ring) * 0.25;
    mx = max(mx, (1.0 - rd / rw) * fade * rf);
  }
  return mx;
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

// ── Preset 6: Laser ─────────────────────────────────────────
float intensityLaser(float dx, float dy, float dist, float age, float maxAge, float maxRadius) {
  if (dist < 0.5) return 1.0 - age / maxAge;
  float progress = age / maxAge;
  float beamLength = progress * maxRadius;
  if (dist > beamLength) return 0.0;
  float angle = atan(dy, dx);
  float mx = 0.0;
  for (int i = 0; i < 5; i++) {
    float ba = -PI + mod(float(i) * 2.399, TAU);
    float ad = abs(angle - ba);
    if (ad > PI) ad = TAU - ad;
    float bw = 0.12 + dist * 0.008;
    if (ad > bw) continue;
    float cf = 1.0 - ad / bw;
    float core = cf * cf * cf;
    float tipDist = abs(dist - beamLength);
    float tipGlow = tipDist < 2.0 ? 1.0 - tipDist / 2.0 : 0.0;
    float bodyGlow = 0.3 + 0.7 * (1.0 - dist / beamLength);
    float flicker = 0.8 + 0.2 * sin(dist * 3.5 - age * 2.0 + float(i) * 1.7);
    float fade = 1.0 - pow(progress, 0.5);
    mx = max(mx, core * (bodyGlow + tipGlow * 0.7) * fade * flicker);
  }
  return mx;
}

// ── Preset 7: Bubble ────────────────────────────────────────
float intensityBubble(float dx, float dy, float dist, float age, float maxAge, float maxRadius) {
  float progress = age / maxAge;
  float fade = 1.0 - pow(progress, 0.4);
  float mx = 0.0;
  for (int i = 0; i < 6; i++) {
    float bAngle = float(i) * 2.399 + 0.5;
    float bCos = cos(bAngle);
    float bSin = sin(bAngle);
    float driftSpeed = 0.6 + mod(float(i), 3.0) * 0.15;
    float drift = age * driftSpeed * (1.0 - progress * 0.3);
    float bx = bCos * drift;
    float by = bSin * drift;
    float bdx = dx - bx;
    float bdy = dy - by;
    float bDist = sqrt(bdx * bdx + bdy * bdy);
    float growPhase = min(progress * 3.0, 1.0);
    float popPhase = progress > 0.75 ? (progress - 0.75) / 0.25 : 0.0;
    float bubbleR = (1.2 + float(i) * 0.2) * growPhase * (1.0 - popPhase * 0.6);
    if (bubbleR < 0.3) continue;
    float rw = 0.45 + bubbleR * 0.15;
    float rd = abs(bDist - bubbleR);
    if (bDist > bubbleR + rw) continue;
    float inten;
    if (rd < rw) {
      inten = (1.0 - rd / rw) * 0.9;
    } else {
      inten = (1.0 - bDist / bubbleR) * 0.25;
    }
    float specX = bdx + bubbleR * 0.35;
    float specY = bdy + bubbleR * 0.35;
    float specDist = sqrt(specX * specX + specY * specY);
    if (specDist < bubbleR * 0.35) {
      inten += (1.0 - specDist / (bubbleR * 0.35)) * 0.6;
    }
    float wobble = 0.85 + 0.15 * sin(age * 0.5 + float(i) * 2.1 + bDist * 1.2);
    mx = max(mx, min(1.0, inten * fade * wobble * (1.0 - popPhase * 0.5)));
  }
  return mx;
}

// ── Compute hue-shift value per preset ──────────────────────
// Returns (hasShift, shiftAmount)
vec2 hueShiftForPreset(int preset, float dist, float age) {
  if (preset == 0) return vec2(1.0, dist * 8.0);
  if (preset == 2) return vec2(1.0, age * 5.0);
  if (preset == 3) return vec2(1.0, dist * 15.0);
  if (preset == 4) return vec2(1.0, dist * 12.0 + age * 8.0);
  if (preset == 5) return vec2(1.0, age * 12.0);
  if (preset == 6) return vec2(1.0, dist * 20.0 + age * 10.0);
  if (preset == 7) return vec2(1.0, dist * 25.0 + age * 6.0);
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
    if (hs.x > 0.5) {
      float h = u_hsl[i].x;
      float s = u_hsl[i].y;
      float l = u_hsl[i].z;
      rgb = hslToRgb(mod(h + hs.y, 360.0), s, l);
    } else {
      rgb = u_color[i];
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
        gl.uniform3f(
          this.uColor[i],
          e.color[0] / 255,
          e.color[1] / 255,
          e.color[2] / 255,
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
