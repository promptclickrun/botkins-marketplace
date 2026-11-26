# Rendering: colour, post and cost

## The colour pipeline

```
scene shaders ── linear HDR (RGBA16F) ──► bloom ──► exposure ──► ACES fit ──► grade ──► sRGB ──► vignette ──► grain ──► dither ──► RGBA8
                                                                                                                         │
                                                                                         text glyphs (display space) ◄──┘
```

Rules:
1. **Shade in linear light.** Brand colours are sRGB hex; convert them once with `hexToLinear('#ff9a3c')` before you pass them to a shader. Mixing and adding light in sRGB gives muddy edges and wrong glows.
2. **Use values above 1 for light.** A light source or hot core is 2–6. Bloom picks up everything above the threshold (default 0.9) with a soft knee. Surfaces and backgrounds stay at 0.02–0.6.
3. **Do not tone-map, clamp or gamma-correct in a scene.** The post pass does it once.
4. **Text is drawn after post**, in display space, so it is not bloomed, grained or tone-mapped. It stays crisp and exactly the brand colour.
5. Without `EXT_color_buffer_float` the targets are RGBA8; HDR is clipped at 1 and bloom gets weaker. The deck still works.

## Post stack (engine/post.js)

| Step | Default | Notes |
|---|---|---|
| Bloom | `bloom 0.6`, `threshold 0.9` | Bright-pass with soft knee, 5-level downsample, then tent upsample. Clamps single pixels to 64 so one hot pixel cannot fill the screen. |
| Exposure | `1.0` | Per-scene `grade.exposure`. Change this before you change colours. |
| Tone map | ACES fit (Narkowicz) | `x(2.51x+.03) / (x(2.43x+.59)+.14)`. Bright hues go toward white, as on film. |
| Grade | `shadows [.96,1,1.06]`, `highlights [1.04,1,.96]`, `contrast 1.04`, `saturation 1.05` | Cool shadows, warm highlights. Keep it subtle. |
| sRGB | exact piecewise curve | Not `pow(1/2.2)`. |
| Vignette | `0.35` | Aspect-corrected; it starts at 35% of the radius. |
| Grain | `0.035` | Luma-weighted (strongest in mid-tones). Seeded from the scene clock at 24 fps, so screenshots repeat. |
| Dither | ±1/255 triangular | Removes banding in dark gradients. Always on. |
| NaN guard | on | NaN/Inf → black. |

Override per scene: `grade: { exposure: 1.2, bloom: 0.9, vignette: 0.5 }`.

## Shader snippets

All of these are in the shared prelude (`engine/glsl.js`), so every scene shader can use them.

```glsl
// Stateless hashes: same id, same value, everywhere. Use for crowds and noise.
float hashi(int i, int seed);       // instance id -> [0,1)
float hash12(vec2 p);               // grid cell -> [0,1)
float vnoise(vec2 p);               // smooth value noise
float fbm(vec2 p);                  // 5 octaves, rotated between octaves
mat2  rot2(float a);
vec2  centered();                   // frame coords, origin at centre, y up, height 1
float textScrim(vec4 box, float pad, float soft);   // 1 behind a text box, soft falloff
```

Common light shapes:

```glsl
float glow  = exp(-d * 4.0);                       // wide soft glow
float core  = exp(-d * 14.0) * 3.0;                // hot core (HDR) that blooms
float ring  = exp(-pow((d - r) / 0.006, 2.0));     // thin ring at radius r
float line  = exp(-abs(c.y - y0) * 260.0);         // thin horizontal light
float rim   = pow(1.0 - max(dot(n, v), 0.0), 3.0); // fresnel rim on a sphere
```

**No seams from `atan`.** `atan(y, x)` jumps at ±π. Do not feed raw angles to noise. Use one of these:

```glsl
vec2 dir = vec2(cos(a), sin(a));    float n = vnoise(dir * 5.0);        // noise on a circle
float swirl = fbm(rot2(t + d * 14.0) * q * 9.0);                       // twist without angles
```

**Fake depth cheaply**: two or three noise layers at different scales and speeds, parallax from `s.mouse` scaled by layer depth, haze (`mix(col, fogColor, 1-exp(-depth*k))`).

## Cost control

Budget for a 2019 laptop iGPU at 1080p: about **8 ms per frame for both scenes during a transition**.

| Cost | Rule |
|---|---|
| Full-screen fbm | ≤ 2 fbm calls (5 octaves each) per pixel per scene. Bake heavy noise into a half-size `ctx.target('noise', 0.5)` if you need more. |
| Loops | Bound them; scale with `s.q`: `int n = int(mix(4.0, 12.0, uQ));` |
| Instances | 10k–50k quads are fine. Over 100k: use points (`gl.POINTS`, `gl_PointSize`), or fewer, larger dots. |
| Overdraw | Additive particles overlapping 20+ deep get expensive. Keep particle radius small when zoomed out. |
| Targets | Private targets at 0.5 scale for blur/glow layers. They are parked when the scene is far away. |
| Branches | Uniform branches are fine; per-pixel branches are fine if neighbours agree. |
| `discard` | Fine for discs; avoid in full-screen passes. |
| Precision | `highp` everywhere (the prelude sets it). Hash with integers, not `fract(sin(x)*43758)`, which breaks on some GPUs. |

The quality governor lowers the internal resolution (to 50% minimum) when frames are slow. Scenes should **look fine at 50%**: no 1-px lines that disappear. Make thin lines at least ~1.5 px at quality 0.5, or set a minimum width in pixels (see `03-crowd.js`: `minR`).

## Checking your work

You cannot see shader bugs in code. Shoot and look (SKILL.md §6). Typical problems and fixes:

| You see | Cause | Fix |
|---|---|---|
| Black frame | Shader compile error, wrong target bound, alpha 0 with blending | Read the console (the tools fail on errors); check `ctx.bind` |
| Bright square | NaN from `pow(negative)`, `normalize(0)`, `/0` | `max(x, 0.0)`, `+1e-4`; the guard shows black, not white |
| Line from centre to the left | `atan` seam | See above |
| Banding in dark gradients | No dither, or a gradient in sRGB space | Shade in linear; dither is in post |
| Grey, flat image | Everything is mid-grey with no light source | Add one HDR light (2–4), darken the rest |
| Blown-out white | Emissive too high, or bloom on large areas | Lower the values or `grade.exposure`; bloom is for small bright things |
| Text hard to read | Busy background behind the type | `textScrim` in the background shader, or move the text |
