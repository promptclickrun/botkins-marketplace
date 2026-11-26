// Portal: a timeline of three milestones leads to a glowing doorway. The scene exposes
// hooks.portal(s) so the outgoing 'portal' transition opens from exactly that circle:
// the last frame of this scene becomes the first frame of the next.
import { defineScene } from '../engine/scene.js';
import { BRAND, headline, boxOf, E } from './common.js';
import { staggered } from '../engine/text.js';

const POS = { x: 0.52, y: -0.02 }; // portal centre, centred frame units (y up)
const R = 0.15; // portal radius, frame-height units

const FS = /* glsl */ `
uniform float uT, uLine, uOpen, uExit;
uniform vec2 uMouse, uPos;
uniform float uR;
uniform vec4 uBox;
uniform vec3 uBg, uWarm, uCool, uHot;
uniform float uDots[3];
void main() {
  vec2 c = centered() + uMouse * 0.01;
  vec3 col = uBg;
  // Ground haze.
  col += uCool * 0.05 * fbm(c * 3.0 + vec2(uT * 0.03, 0.0));
  // Timeline: a line drawn left to right up to the portal.
  float x0 = -0.72, x1 = uPos.x - uR;
  float lx = mix(x0, x1, uLine);
  float onLine = step(x0, c.x) * step(c.x, lx);
  float line = exp(-abs(c.y - uPos.y) * 260.0) * onLine;
  col += uWarm * line * 1.4;
  // Milestone dots pop as the line reaches them.
  for (int i = 0; i < 3; i++) {
    float dx = mix(x0, x1, (float(i) + 0.5) / 3.2);
    float a = uDots[i];
    float d = length(c - vec2(dx, uPos.y));
    col += uHot * a * (smoothstep(0.018, 0.012, d) * 2.0 + exp(-d * 40.0) * 0.6);
  }
  // The portal: a ring and a swirling interior, brightening as it opens.
  vec2 q = c - uPos;
  float d = length(q);
  float ring = exp(-pow((d - uR) / 0.006, 2.0)) * 3.0 + exp(-abs(d - uR) * 30.0) * 0.6;
  // Twisted noise: rotate by an amount that grows with distance. No atan, so no seam.
  float swirl = fbm(rot2(uT * 0.4 + d * 14.0) * q * 9.0 + 3.0);
  float inside = smoothstep(uR, uR - 0.01, d);
  vec3 core = mix(uCool * 0.6, uHot * 2.2, swirl * swirl) * (0.4 + 0.6 * (1.0 - d / uR));
  col = mix(col, core * uOpen + uBg * (1.0 - uOpen), inside);
  col += mix(uCool, uHot, 0.6) * ring * uOpen;
  col += uWarm * exp(-max(d - uR, 0.0) * 9.0) * 0.25 * uOpen;
  col *= 1.0 - 0.4 * textScrim(uBox, 0.02, 0.22);
  o = vec4(col, 1.0);
}`;

const LABELS = ['2024 · idea', '2025 · pilot', '2026 · launch'];

export default defineScene({
  id: 'portal',
  title: 'The way through',
  alt: 'A line runs across three milestones to a glowing circular doorway. The next scene opens through it.',
  notes: 'Three dates, one line. Do not read the labels; point at the door. Click to go through.',
  transitionOut: { name: 'portal' },
  hooks: {
    // uv of the portal centre and its radius as a fraction of frame height, for the transition.
    portal: () => ({ ...POS, r: R }),
  },
  beats: [
    { say: 'Three years, one line', dur: 1.6, cue: { sound: 'hit', at: 0.1 } },
    { say: 'And a door at the end', dur: 1.0, hold: 0.3, cue: { sound: 'swell', at: 0.1, opts: { deg: 2 } } },
  ],
  render(ctx, s) {
    const line = s.kp(0, 0, 1, E.inOutCubic);
    const L = lay(ctx);
    const dots = [0, 1, 2].map((i) => s.kp(0, 0.15 + i * 0.25, 0.3 + i * 0.25, E.outBack));
    dots.forEach((d, i) => s.cue('dot' + i, d, 0.5, 'tick', { deg: i * 2 }));
    ctx.draw(ctx.program('bg', FS), {
      uT: s.t * s.motion,
      uLine: line,
      uOpen: 0.15 + 0.85 * s.kp(1, 0, 1, E.outCubic),
      uExit: s.exit,
      uMouse: s.mouse,
      uPos: [POS.x, POS.y],
      uR: R,
      uBox: boxOf(L.h1, L.h2),
      uBg: BRAND.bg,
      uWarm: BRAND.warm,
      uCool: BRAND.cool,
      uHot: BRAND.hot,
      uDots: { f: dots },
    });
  },
  text(ctx, s) {
    const L = lay(ctx);
    const x1 = POS.x - R;
    LABELS.forEach((lab, i) => {
      const x = -0.72 + (x1 + 0.72) * ((i + 0.5) / 3.2);
      const a = s.kp(0, 0.25 + i * 0.25, 0.45 + i * 0.25, E.outCubic);
      ctx.text.draw(lab, {
        font: 'mono',
        size: 0.024,
        x: (x + 16 / 18) / (16 / 9),
        y: 0.5 - POS.y + 0.055,
        color: BRAND.muted,
        alpha: a,
        glyph: () => ({ dy: (1 - a) * 0.01 }),
      });
    });
    headline(ctx, s, 'Three years, one line', 0, { layout: L.h1, alpha: 1 - s.kp(1, 0, 0.4) });
    ctx.text.draw('And a door at the end', {
      layout: L.h2,
      color: BRAND.ink,
      mask: { y0: L.h2.box.y0 - 0.02, y1: L.h2.box.y1 + 0.01 },
      glyph: (r) => ({ dy: (1 - staggered(s.p[1], r.i, r.n, 0.5)) * 0.08 }),
    });
  },
});

function lay(ctx) {
  return {
    h1: ctx.text.layout('Three years, one line', { font: 'display', size: 0.07, y: 0.24, x: 0.36 }),
    h2: ctx.text.layout('And a door at the end', { font: 'display', size: 0.07, y: 0.24, x: 0.36 }),
  };
}
