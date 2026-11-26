// Crowd: 17,424 instanced dots, each a pure function of its cell id and beat progress.
// No buffers, no simulation, so any moment can be scrubbed, reversed or screenshotted.
// Beat 1: one person. Beat 2: zoom out in log space to the whole crowd; one in eight lights up.
import { defineScene } from '../engine/scene.js';
import { BRAND, headline, boxOf, E } from './common.js';
import { logMix } from '../engine/math.js';

const COLS = 176;
const ROWS = 99;
const COUNT = COLS * ROWS;
const CENTER = Math.floor(ROWS / 2) * COLS + Math.floor(COLS / 2);

const VS = /* glsl */ `
uniform vec2 uRes;
uniform vec4 uFrame;
uniform float uHalf, uT, uPick, uWave;
uniform vec2 uMouse;
out vec2 vLocal;
out float vPick;
out float vOne;
void main() {
  int id = gl_InstanceID;
  vec2 cell = vec2(float(id % ${COLS}), float(id / ${COLS})) - vec2(${Math.floor(COLS / 2)}.0, ${Math.floor(ROWS / 2)}.0);
  float one = id == ${CENTER} ? 1.0 : 0.0;
  // Stable jitter and an idle orbit per id, so the hold keeps breathing.
  vec2 j = (vec2(hashi(id, 1), hashi(id, 2)) - 0.5) * 0.5 * (1.0 - one);
  float ph = hashi(id, 3) * TAU;
  vec2 drift = vec2(cos(uT * 0.7 + ph), sin(uT * 0.55 + ph * 1.7)) * 0.08;
  vec2 world = cell + j + drift;
  // One in eight, by hash. The highlight ripples outward from the centre.
  float d = length(cell);
  float wave = sat((uWave * 110.0 - d) / 8.0);
  float pick = step(hashi(id, 9), 0.125) * uPick * wave;
  vPick = max(pick, one);
  vOne = one;
  float r = 0.3 * (0.85 + 0.3 * hashi(id, 4)) * (1.0 + one * 0.25);
  // Keep tiny dots at least ~1.2 px wide so the crowd does not shimmer away.
  float minR = 1.2 / uFrame.w * uHalf * 2.0;
  r = max(r, minR);
  int v = gl_VertexID;
  vec2 corner = vec2(v == 1 || v == 3 || v == 4 ? 1.0 : 0.0, v == 2 || v == 4 || v == 5 ? 1.0 : 0.0);
  vLocal = corner * 2.0 - 1.0;
  vec2 w = world + vLocal * r;
  // World -> centred frame units (frame height = 2 * uHalf world units), with parallax.
  vec2 p = w / (2.0 * uHalf) + uMouse * 0.008;
  vec2 px = uFrame.xy + vec2(p.x + 0.8888889, 0.5 - p.y) * uFrame.w;
  gl_Position = vec4(px.x / uRes.x * 2.0 - 1.0, 1.0 - px.y / uRes.y * 2.0, 0.0, 1.0);
}`;

const FS = /* glsl */ `
in vec2 vLocal;
in float vPick;
in float vOne;
uniform vec3 uWarm, uCool, uHot;
uniform float uBright, uFar;
void main() {
  float d = length(vLocal);
  if (d > 1.0) discard;
  float disc = smoothstep(1.0, 0.7, d);
  float core = pow(1.0 - d, 2.0);
  // While zoomed in, the others recede so the one person reads first.
  vec3 base = uCool * mix(0.05, 0.9, uFar);
  vec3 lit = mix(uWarm * 2.4, uHot * 4.0, core);
  vec3 c = mix(base, lit, vPick) * (disc * 0.75 + core * 0.9);
  o = vec4(c * uBright, 1.0);
}`;

const BG = /* glsl */ `
uniform vec4 uBox;
uniform vec3 uBg, uCool;
uniform float uT;
void main() {
  vec2 c = centered();
  vec3 col = uBg + uCool * 0.06 * exp(-length(c) * 2.5) + uCool * 0.025 * fbm(c * 2.0 - uT * 0.02);
  o = vec4(col, 1.0);
}`;

// A dark band behind the text drawn on top of the dots (still inside the picture).
const SCRIM = /* glsl */ `
uniform vec4 uBox;
uniform float uAmt;
void main() {
  float m = textScrim(uBox, 0.03, 0.2) * uAmt;
  o = vec4(0.0, 0.0, 0.0, m);
}`;

const T1 = 'It starts with one person';
const T2 = 'One in eight already does this';
const SRC = '17,424 DOTS · ONE PER RESPONDENT (ILLUSTRATIVE)';

export default defineScene({
  id: 'crowd',
  title: 'The crowd',
  alt: 'A single glowing dot. The view pulls back to reveal seventeen thousand dots; one in eight glows orange.',
  notes: 'Pause on the single dot. The zoom-out is the argument: this is not rare.',
  transitionOut: { name: 'dissolve' },
  beats: [
    { say: T1, dur: 1.2, hold: 0.3, cue: { sound: 'tick', at: 0.2 } },
    { say: T2, source: SRC, dur: 2.4, cue: { sound: 'swell', at: 0.0 } },
  ],
  render(ctx, s) {
    const zoom = s.kp(1, 0, 0.7, E.inOutCubic);
    // Log space: 1.6 -> 46 world units of half-height. Equal time per doubling feels like constant speed.
    const half = logMix(1.6, 46, zoom);
    const L = lay(ctx);
    ctx.draw(ctx.program('bg', BG), { uBg: BRAND.bg, uCool: BRAND.cool, uT: s.t * s.motion });
    const prog = ctx.programVS('crowd', VS, FS);
    ctx.use(prog, {
      uHalf: half,
      uT: s.t * s.motion,
      uPick: s.kp(1, 0.55, 0.75, E.linear) > 0 ? 1 : 0,
      uWave: s.kp(1, 0.55, 1, E.inOutCubic),
      uMouse: s.mouse,
      uWarm: BRAND.warm,
      uCool: BRAND.cool,
      uHot: BRAND.hot,
      uFar: zoom,
      uBright: 0.25 + 0.75 * s.kp(0, 0, 0.5, E.outCubic),
    });
    ctx.blend('add');
    ctx.gl.bindVertexArray(ctx.G.emptyVAO);
    ctx.gl.drawArraysInstanced(ctx.gl.TRIANGLES, 0, 6, COUNT);
    ctx.blend('over');
    const box = s.p[1] > 0.5 ? boxOf(L.b, L.src) : boxOf(L.a);
    ctx.draw(ctx.program('scrim', SCRIM), { uBox: box, uAmt: 0.8 });
    ctx.blend(null);
  },
  text(ctx, s) {
    const L = lay(ctx);
    const out = 1 - s.kp(1, 0, 0.2, E.linear);
    headline(ctx, s, T1, 0, { layout: L.a, alpha: out });
    if (s.p[1] > 0.6) {
      const a = s.kp(1, 0.6, 0.95, E.linear);
      ctx.text.draw(T2, {
        layout: L.b,
        color: BRAND.ink,
        mask: { y0: L.b.box.y0 - 0.02, y1: L.b.box.y1 + 0.01 },
        glyph: (r) => {
          const t = Math.min(1, Math.max(0, (a - (r.i / r.n) * 0.5) / 0.5));
          return { dy: (1 - E.outCubic(t)) * 0.08 };
        },
      });
      ctx.text.draw(SRC, { layout: L.src, color: BRAND.muted, alpha: s.kp(1, 0.8, 1) });
    }
  },
});

function lay(ctx) {
  return {
    a: ctx.text.layout(T1, { font: 'display', size: 0.06, y: 0.78 }),
    b: ctx.text.layout(T2, { font: 'display', size: 0.07, y: 0.46, maxWidth: 0.9 }),
    src: ctx.text.layout(SRC, { font: 'body', size: 0.026, tracking: 0.04, y: 0.56 }),
  };
}
