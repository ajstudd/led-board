GLSL Fragment Shader Optimization for Effects Engine
Replace the CPU-bound per-cell intensity computation in EffectsEngine._tick() with GPU-accelerated GLSL fragment shaders. The GPU computes all ~20K cells in parallel per frame, collapsing 80 × 20K = 1.6M JS intensity calls into a handful of GPU draw calls.

Proposed Changes
WebGL Renderer
[NEW] 
effects-gl.ts
New GLEffectsRenderer class encapsulating all WebGL logic:

Architecture:

Creates a small WebGL canvas (cols × rows) — NOT the visible canvas
Renders effects via a fullscreen-quad fragment shader
Batches up to 16 effects per draw call (well within WebGL1 uniform limits)
Uses additive blending (gl.blendFunc(ONE, ONE)) for multi-pass accumulation
Reads back via gl.readPixels() into the existing Uint8ClampedArray overlay buffer
Shader design:

Vertex shader: passthrough fullscreen quad (2 triangles, clip-space positions)
Fragment shader contains all 8 preset intensity functions ported 1:1 from JS:
intensityRipple(), intensityWave(), intensityRaindrop(), intensityStarBurst(), intensityHelix(), intensitySparkle(), intensityLaser(), intensityBubble()
HSL→RGB conversion ported from 
utils.ts
 
hslToRgb()
Preset selection via 
int
 uniform → if/else chain (WebGL1 doesn't support switch)
Uniforms per batch (16 effects):

Uniform	Type	Purpose
u_gridSize	vec2	cols, rows
u_numEffects	
int
active count in this batch
u_pos[16]	vec2[]	effect trigger col/row
u_params[16]	vec4[]	age, maxAge, maxRadius, presetIndex
u_color[16]	vec3[]	RGB color (0–1)
u_hsl[16]	vec3[]	HSL for hue shifting
Total: ~100 uniforms — well within WebGL1's minimum of 128 vec4 fragment uniforms.

Fallback: GLEffectsRenderer.create() is a static factory that returns null if canvas.getContext('webgl') fails. No exceptions, no hard dependency.

Effects Engine Integration
[MODIFY] 
effects.ts
Minimal changes to route 
_tick()
 through the GL renderer when available:

Add private _gl: GLEffectsRenderer | null field
In 
updateGrid()
: create/resize the GL renderer
In 
_tick()
: if _gl exists, call _gl.render(effects, overlay) instead of the CPU loop; otherwise fall through to existing CPU code (unchanged)
In 
destroy()
: dispose GL resources
Export preset index mapping (EFFECT_PRESETS array index) so the GL renderer can identify presets by integer
No changes to public API. 
Canvas.tsx
, 
EffectsPanel.tsx
, and all other consumers remain untouched.

Verification Plan
Automated Tests
npm run build — TypeScript compilation and Next.js build must pass with zero errors
Manual Verification
Run npm run dev and open the app in Chrome
Enable effects via the Effects Panel toggle
Select each of the 8 presets and draw on the canvas — verify each effect looks visually correct (expanding rings for Ripple, star rays for Star Burst, etc.)
Adjust Distance and Speed sliders — verify they still affect effect behavior
Trigger many effects rapidly (fast drag) — verify no dropped frames or visual glitches
Open DevTools → Console — verify no WebGL errors or warnings
(Optional) To test fallback: in DevTools Console run document.createElement('canvas').getContext('webgl') to check WebGL is available, then test in a browser with WebGL disabled to confirm CPU fallback still works