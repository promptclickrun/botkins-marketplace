# Engine: the scene contract and the controller

The starter engine is in `starter/src/engine/`. It uses raw WebGL2 and has no dependencies. This file is the contract between scenes and the deck controller.

## Files

| File | Job |
|---|---|
| `math.js` | `clamp`, `mix`, `unmix`, `smoothstep`, `logMix`, `bump`, `ease.*`, seeded `hash(n, seed)`, `prng(seed)`, `hexToLinear` |
| `glsl.js` | Shared GLSL prepended to every shader: `hashu/hashi/hash12/hash22`, `vnoise`, `fbm`, `rot2`, `luma`, `scrim`, `framePos()`, `centered()`, `textScrim(box, pad, soft)` |
| `gl.js` | Context, program compile with readable errors, `setUniforms`, float render targets, `drawFull` |
| `scene.js` | `defineScene`, `makeState` (the pure state builder), position helpers |
| `post.js` | Bloom → ACES fit → grade → sRGB → vignette → grain → dither |
| `text.js` | Glyph atlas, layout, per-glyph draw, `reveal.*` presets, `staggered` |
| `transitions.js` | `defineTransition`, the A/B wrapper that makes p=0 exactly A and p=1 exactly B |
| `audio.js` | WebAudio synth on one root note; sounds `swell`, `tick`, `hit`, `chime`, `whoosh` |
| `deck.js` | Clock, navigation, transitions, cues, warm-up, quality, parking, headless hooks, outline |
| `ui.js` | DOM chrome: keys, overview, notes, help, speaker window, HUD, aria-live captions |

## Scene definition

```js
defineScene({
  id: 'crowd',                 // used in #deep-links, seek(), overview. Stable, url-safe.
  title: 'The crowd',          // overview + speaker view
  alt: 'One dot; the view pulls back to 17,000 dots.',   // outline export, screen readers
  notes: 'Pause on the single dot.',                       // speaker notes
  transitionOut: 'dissolve' | { name: 'wipe', dur: 1.1, opts: { angle: 0.3 } },
  grade: { exposure: 1.1, bloom: 0.8 },                    // per-scene post overrides
  hooks: { portal: (s) => ({ x, y, r }) },                 // data for transitions
  beats: [
    { say: 'It starts with one person', dur: 1.2, delay: 0, hold: 0.3, cue: 'tick' },
    { say: 'One in eight already does this', source: '…', dur: 2.4, cue: { sound: 'swell', at: 0 } },
  ],
  setup(ctx) { return { /* buffers, textures: built once, stored as ctx.data */ }; },
  render(ctx, s) { /* draw linear HDR colour into the bound target */ },
  text(ctx, s) { /* ctx.text.draw(...) after post */ },
});
```

`render` and `text` are called with the same `s`. They may call the same layout helper; `ctx.drawing` is `false` in `render` and `true` in `text`, so one helper can both measure (for a scrim) and draw.

## The state `s`

`s` is built by `makeState(scene, {beat, t}, env)`. It is the **only** input that may change the picture.

| Field | Meaning |
|---|---|
| `s.p[i]` | Progress of beat *i*, 0..1, eased only by you. Earlier beats are 1; later beats are 0. |
| `s.bt[i]` | Seconds into beat *i* (clamped to the beat's length; the current beat keeps counting during its hold). |
| `s.k(i, t0, t1, ease)` | Eased 0..1 over seconds `t0..t1` of beat *i*. Use it for sub-timelines in a beat. |
| `s.kp(i, a, b, ease)` | Eased 0..1 over the fraction `a..b` of `p[i]`. |
| `s.t` | Seconds since the scene started. Keeps running in holds; use it for idle drift. |
| `s.beat`, `s.n` | Current beat index, beat count. |
| `s.enter` | 0→1 while the scene arrives in a transition (1 otherwise). |
| `s.exit` | 0→1 while the scene leaves (0 otherwise). |
| `s.dir` | +1 forward, −1 while a beat is retracting after Back. |
| `s.mouse` | Damped pointer, −1..1 each axis. For parallax only. |
| `s.q` | Quality 0.5..1 from the governor. Use it to reduce loop counts. |
| `s.motion` | 1 normally, 0 in reduced-motion mode. Multiply drift by it. |
| `s.cue(key, value, threshold, sound, opts)` | Plays `sound` when `value` crosses `threshold` upward, **only live and forward**. |
| `s.hash(n, seed)` | Seeded hash → [0,1). |

Because `s` comes from `(scene, beat, t)` only, these work at no extra cost: Back (retract the beat), jump to any scene, warm-up, autoplay, overview thumbnails and deterministic screenshots.

**Forbidden in `render`/`text`**: `Date.now()`, `performance.now()`, `Math.random()`, state carried from frame to frame (velocity, accumulated positions), reading the DOM. If you need "physics", write it as a closed-form function of `t` (springs: `1 - exp(-k t) cos(w t)`), or precompute in `setup` with a seeded `prng`.

## The ctx object

| Member | Use |
|---|---|
| `ctx.gl`, `ctx.G` | WebGL2 context; `G.emptyVAO` for attribute-less draws |
| `ctx.program(key, fs)` | Cached full-screen program (frag body only; `vUv` in, `o` out) |
| `ctx.programVS(key, vs, fs)` | Cached program with your own vertex shader (instancing) |
| `ctx.draw(prog, uniforms)` | Full-screen triangle; adds `uRes`, `uFrame` |
| `ctx.use(prog, uniforms)` | Bind program + uniforms for your own draw call |
| `ctx.target(name, scale)` | A private HDR target at `scale` × internal resolution (parked when far away) |
| `ctx.bind(target)` | Bind your target, or the scene's HDR target if none |
| `ctx.blend('add' \| 'over' \| null)` | Additive, premultiplied over, or off |
| `ctx.text` | Layout and glyph drawing (see text.md) |
| `ctx.frame` | The 16:9 safe frame in target pixels `{x, y, w, h}` |
| `ctx.data` | What `setup` returned |

Uniform values: number → float, `[a,b]`/`[a,b,c]`/`[a,b,c,d]` → vecN, `{i: n}` → int, `{f: [...]}` → float array, `{tex: target}` → sampler. Load with `?debug` to log uniform type errors.

### Coordinates

- **Frame units**: the 16:9 safe frame is `16/9` wide and `1` tall. Text uses top-left origin (y down). In GLSL `framePos()` gives the same; `centered()` gives origin at the centre, y up, x in ±0.889.
- The canvas can have any aspect. Anything outside the safe frame is bleed: fill it with background, never with content.

## Controller

`createDeck({ canvas, scenes, audio })` returns `window.deck`:

| Call | Does |
|---|---|
| `next()` | Mid-beat: run this beat at 4× and queue the advance. After the beat ends: go to the next beat, or start the transition. During a transition: speed it up (up to 6×) and queue one advance. |
| `prev()` | Retract the current beat quickly (≈0.35 s) and go to the end of the previous one. At beat 0: replay the transition **reversed and 40% shorter**. During a transition: reverse it. |
| `jump(idOrIndex, beat)` | Cut to a scene (number keys, overview, deep link). |
| `first()`, `last()` | Home, End. |
| `seek(id, beat, t)` | **Headless.** Stop the clock, render exactly that moment, `gl.finish()`. `t = Infinity` means the end of the beat. |
| `seekTransition(from, to, p)` | **Headless.** Render a transition frame. |
| `ready` | Promise; resolves after fonts, setup and warm-up. |
| `state()` | `{scene, index, beat, beats, say, source, notes, next, transitioning, quality, black, autoplay}` |
| `outline()` | Plain HTML outline of the talk |
| `lint()` | Warnings: headlines > 10 words, beats > 2.5 s |
| `setBlack()`, `setAutoplay()`, `setPointer(x,y)`, `on(fn)` | Chrome hooks |

URL options: `#sceneId` or `#sceneId/2`, `?quick` (warm up only the first scene), `?autoplay`, `?still` (reduced motion), `?shoot` (frozen clock, drawing buffer kept, for screenshots), `?debug`.

### Frame pipeline

```
scene.render  → slot.hdr (RGBA16F, linear)
post.run      → slot.ldr (RGBA8, display)      bloom, ACES, grade, sRGB, vignette, grain, dither
scene.text    → slot.ldr                       glyph quads, premultiplied
present / transition(A=slot0.ldr, B=slot1.ldr) → canvas
```

During a transition both scenes render each frame: A continues past its last beat (`exit` = p) and B renders its beat 0 at t=0 with `enter` = p. Its clock is negative until the transition ends, so B is still before its first beat. That is why "end on the first frame of the next scene" works: B's first frame is what the transition shows.

### Robustness built in

- **Warm-up**: before the deck is shown, every beat (middle and end) and every transition at p=0.5 is rendered once behind the progress bar. This compiles all programs and uploads all glyphs. `?quick` skips it.
- **Parking**: private targets of scenes more than one step away are shrunk to 1×1 and regrow on demand.
- **Pixel cap**: the drawing buffer is capped at 2560×1600 and DPR 2.
- **Quality governor**: after ~20 slow frames (>25 ms) the internal resolution drops by 15% (floor 50%). After ~4 s of fast frames it climbs back. Headless `seek` forces quality 1.
- **Context loss**: shows a message and reloads when the context returns.
- **NaN guard**: the composite pass turns NaN/Inf into black instead of a bright block. Still fix the cause.
- **Shader errors** show the failing line in the console and fail the smoke test.

## Adding a scene: the minimal template

```js
import { defineScene } from '../engine/scene.js';
import { BRAND, headline, boxOf, E } from './common.js';

const FS = /* glsl */ `
uniform float uT, uA; uniform vec4 uBox; uniform vec3 uBg, uWarm;
void main() {
  vec2 c = centered();
  vec3 col = uBg + uWarm * exp(-length(c) * 3.0) * uA * (0.9 + 0.1 * sin(uT));
  col *= 1.0 - 0.6 * textScrim(uBox, 0.04, 0.2);
  o = vec4(col, 1.0);
}`;
const H = 'Say one thing';
export default defineScene({
  id: 'one-thing', title: 'One thing', alt: 'A warm glow behind a short line.',
  beats: [{ say: H, dur: 1.2, cue: 'hit' }],
  render(ctx, s) {
    const L = headline(ctx, s, H, 0);
    ctx.draw(ctx.program('bg', FS), { uT: s.t * s.motion, uA: s.kp(0), uBox: boxOf(L), uBg: BRAND.bg, uWarm: BRAND.warm });
  },
  text(ctx, s) { headline(ctx, s, H, 0); },
});
```

Then add it to `SCENES` in `src/main.js`, build, shoot, look.
