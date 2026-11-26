// Data bars: the number is in the geometry. 100 bars; 26 of them light up for 26%.
// A tabular counter climbs with them, and each step of ten ticks one note higher.
import { defineScene } from '../engine/scene.js';
import { BRAND, sourceLine, boxOf, E } from './common.js';
import { staggered } from '../engine/text.js';

const N = 100;
const VALUE = 26;

const BG = /* glsl */ `
uniform float uT;
uniform vec4 uBox;
uniform vec3 uBg, uCool;
void main() {
  vec2 c = centered();
  vec3 col = uBg + uCool * 0.03 * fbm(c * 3.0 + uT * 0.02);
  // Floor glow under the bars.
  col += uCool * 0.25 * exp(-abs(c.y + 0.24) * 14.0) * smoothstep(0.85, 0.2, abs(c.x));
  col *= 1.0 - 0.35 * textScrim(uBox, 0.02, 0.22);
  o = vec4(col, 1.0);
}`;

// One quad per bar, built from gl_VertexID / gl_InstanceID: no buffers.
const VS = /* glsl */ `
uniform vec2 uRes;
uniform vec4 uFrame;
uniform float uGrow, uLit, uT, uCount;
uniform vec2 uMouse;
out vec2 vLocal;
out float vOn;
out float vH;
void main() {
  int i = gl_InstanceID;
  float fi = float(i);
  // Staggered growth from the centre outwards so the eye lands in the middle first.
  float order = abs(fi - 49.5) / 49.5;
  float g = sat((uGrow - order * 0.45) / 0.55);
  g = 1.0 - pow(1.0 - g, 3.0);
  float h = mix(0.05, 0.25, hashi(i, 7)) * g;
  // Idle drift so the hold never freezes.
  h *= 1.0 + 0.04 * sin(uT * 0.9 + fi * 0.37);
  float on = sat((uLit * uCount - fi) * 1.5);
  h += on * 0.04;
  vOn = on;
  vH = h;
  float w = 1.4 / 100.0;
  // 6 vertices: (0,0) (1,0) (0,1) / (1,0) (1,1) (0,1)
  int v = gl_VertexID;
  vec2 corner = vec2(v == 1 || v == 3 || v == 4 ? 1.0 : 0.0, v == 2 || v == 4 || v == 5 ? 1.0 : 0.0);
  vLocal = corner;
  float x = (fi - 49.5) * w + uMouse.x * 0.01 * (corner.y);
  vec2 p = vec2(x + (corner.x - 0.5) * w * 0.72, -0.24 + corner.y * h);
  // centred frame units -> clip space
  vec2 px = uFrame.xy + vec2(p.x + 0.8888889, 0.5 - p.y) * uFrame.w;
  gl_Position = vec4(px.x / uRes.x * 2.0 - 1.0, 1.0 - px.y / uRes.y * 2.0, 0.0, 1.0);
}`;

const FS = /* glsl */ `
in vec2 vLocal;
in float vOn;
in float vH;
uniform vec3 uWarm, uCool, uHot;
void main() {
  float edge = smoothstep(0.0, 0.18, vLocal.x) * smoothstep(1.0, 0.82, vLocal.x);
  vec3 off = uCool * (0.10 + 0.18 * vLocal.y);
  vec3 on = mix(uWarm * 1.2, uHot * 3.0, pow(vLocal.y, 6.0));
  vec3 col = mix(off, on, vOn) * edge;
  o = vec4(col, 1.0);
}`;

export default defineScene({
  id: 'bars',
  title: 'The number',
  alt: 'One hundred bars rise. Twenty-six of them light up orange while a counter climbs to 26 percent.',
  notes: 'Let the bars finish growing before you speak. Then: one in four. Click to light them.',
  transitionOut: { name: 'push' },
  beats: [
    { say: 'We asked one hundred teams', dur: 1.5, cue: { sound: 'hit', at: 0.05 } },
    { say: '26% ship every week', source: 'Illustrative data for the starter deck', dur: 1.6, hold: 0.2 },
  ],
  render(ctx, s) {
    const lit = s.kp(1, 0, 1, E.inOutCubic);
    // Cue on every bar crossing; ticks climb the scale as the count rises.
    for (let k = 1; k <= VALUE; k++) s.cue('bar' + k, lit * VALUE, k, 'tick', { deg: Math.floor(k / 3) });
    s.cue('land', lit, 1, 'chime');
    const L = layouts(ctx, s);
    ctx.draw(ctx.program('bg', BG), { uT: s.t * s.motion, uBox: boxOf(L.a, L.b), uBg: BRAND.bg, uCool: BRAND.cool });
    const prog = ctx.programVS('bars', VS, FS);
    ctx.use(prog, {
      uGrow: s.kp(0, 0, 1, E.linear),
      uLit: lit,
      uCount: VALUE,
      uT: s.t * s.motion,
      uMouse: s.mouse,
      uWarm: BRAND.warm,
      uCool: BRAND.cool,
      uHot: BRAND.hot,
    });
    ctx.blend('add');
    ctx.gl.bindVertexArray(ctx.G.emptyVAO);
    ctx.gl.drawArraysInstanced(ctx.gl.TRIANGLES, 0, 6, N);
    ctx.blend(null);
  },
  text(ctx, s) {
    const L = layouts(ctx, s);
    const a = 1 - s.kp(1, 0, 0.35);
    ctx.text.draw('We asked one hundred teams', {
      layout: L.a,
      alpha: a,
      color: BRAND.ink,
      mask: { y0: L.a.box.y0 - 0.02, y1: L.a.box.y1 + 0.01 },
      glyph: (r) => {
        const t = staggered(s.p[0], r.i, r.n, 0.5);
        return { dy: (1 - t) * 0.09 };
      },
    });
    // Counter: tabular digits so the width never jumps.
    const lit = s.kp(1, 0, 1, E.inOutCubic);
    const n = Math.round(lit * VALUE);
    if (s.p[1] > 0) {
      const appear = s.kp(1, 0, 0.25, E.outCubic);
      const str = `${n}%`;
      const C = ctx.text.layout(str, { font: 'display', size: 0.19, y: 0.2, tabular: true });
      ctx.text.draw(str, { layout: C, color: BRAND.accent, alpha: appear, glyph: () => ({ scale: 0.9 + 0.1 * appear }) });
      ctx.text.draw('ship every week', { layout: L.b, color: BRAND.ink, alpha: s.kp(1, 0.4, 0.9) });
      sourceLine(ctx, s, 'ILLUSTRATIVE DATA · STARTER DECK', 1, { y: 0.93 });
    }
  },
});

function layouts(ctx) {
  return {
    a: ctx.text.layout('We asked one hundred teams', { font: 'display', size: 0.075, y: 0.22, maxWidth: 0.9 }),
    b: ctx.text.layout('ship every week', { font: 'body', size: 0.048, y: 0.335 }),
  };
}
