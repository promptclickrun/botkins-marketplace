// Close: the inside of the portal, calmed down. One line to remember, one way to act.
// It begins on the portal's interior colours so the transition lands without a cut.
import { defineScene } from '../engine/scene.js';
import { BRAND, headline, sourceLine, boxOf, E } from './common.js';

const FS = /* glsl */ `
uniform float uT, uCalm, uIn;
uniform vec2 uMouse;
uniform vec4 uBox;
uniform vec3 uBg, uWarm, uCool, uHot;
void main() {
  vec2 c = centered() + uMouse * 0.015;
  float d = length(c);
  // Same swirl as the portal interior, slowing and dimming as the scene calms.
  float speed = mix(0.4, 0.08, uCalm);
  float swirl = fbm(rot2(uT * speed + d * mix(14.0, 3.0, uCalm)) * c * mix(9.0, 2.5, uCalm) + 3.0);
  vec3 core = mix(uCool * 0.6, uHot * 2.2, swirl * swirl) * mix(1.0, 0.35, uCalm);
  vec3 col = mix(core, uBg + uCool * 0.08 * swirl, uCalm * 0.7);
  // A warm horizon of light at the bottom: the "after".
  col += uWarm * exp(-abs(c.y + 0.5) * 6.0) * 0.6 * uCalm;
  // Slow stars, from a hashed grid.
  vec2 g = c * 60.0;
  vec2 id = floor(g);
  vec2 f = fract(g) - 0.5 - (hash22(id) - 0.5) * 0.7;
  float star = smoothstep(0.08, 0.0, length(f)) * step(0.93, hash12(id + 3.0));
  star *= 0.5 + 0.5 * sin(uT * 1.5 + hash12(id) * 30.0);
  col += uHot * star * 1.4 * uCalm;
  col *= 1.0 - 0.6 * textScrim(uBox, 0.06, 0.16);
  o = vec4(col, 1.0);
}`;

const T1 = 'Make the room feel it';
const CTA = 'BUILD YOURS · BOTKINS VISUAL-PRESENTATION SKILL';

export default defineScene({
  id: 'close',
  title: 'Close',
  alt: 'The swirl from inside the portal slows into a calm starfield over a warm horizon. Closing line and a call to action.',
  notes: 'Slow down. Say the line once. Leave it up while you take questions (it keeps drifting).',
  beats: [
    { say: T1, dur: 1.8, cue: { sound: 'chime', at: 0.3 } },
    { say: 'Build yours with the Botkins visual-presentation skill', dur: 1.0 },
  ],
  render(ctx, s) {
    const L = lay(ctx);
    ctx.draw(ctx.program('bg', FS), {
      uT: s.t * s.motion + 20.0,
      uCalm: s.kp(0, 0, 1, E.inOutCubic),
      uIn: s.enter,
      uMouse: s.mouse,
      uBox: boxOf(L.a, L.b),
      uBg: BRAND.bg,
      uWarm: BRAND.warm,
      uCool: BRAND.cool,
      uHot: BRAND.hot,
    });
  },
  text(ctx, s) {
    const L = lay(ctx);
    headline(ctx, s, T1, 0, { layout: L.a, style: 'settle', revealOpts: { from: 1.4 } });
    sourceLine(ctx, s, CTA, 1, { layout: L.b, color: BRAND.accent });
  },
});

function lay(ctx) {
  return {
    a: ctx.text.layout(T1, { font: 'display', size: 0.1, y: 0.44, maxWidth: 0.85 }),
    b: ctx.text.layout(CTA, { font: 'body', size: 0.028, tracking: 0.06, y: 0.58 }),
  };
}
