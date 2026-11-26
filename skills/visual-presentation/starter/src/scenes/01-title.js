// Title: a shader background (slow light through haze) and a per-glyph headline reveal.
import { defineScene } from '../engine/scene.js';
import { BRAND, headline, sourceLine, boxOf, E } from './common.js';

const FS = /* glsl */ `
uniform float uT, uIn, uLift, uExit;
uniform vec2 uMouse;
uniform vec4 uBox;
uniform vec3 uBg, uWarm, uCool;
void main() {
  vec2 c = centered();
  vec2 m = uMouse * 0.03;
  // Haze: two fbm layers drifting at different speeds (parallax from the pointer).
  float n1 = fbm(c * 2.2 + vec2(uT * 0.03, -uT * 0.02) + m);
  float n2 = fbm(c * 4.5 - vec2(uT * 0.05, uT * 0.015) + m * 2.0 + n1);
  // A low sun-like glow that rises with the second beat.
  vec2 sunP = vec2(0.0, mix(-0.62, -0.36, uLift));
  float d = length((c - sunP) * vec2(0.55, 1.0));
  float glow = exp(-d * 4.5) * 1.3 + exp(-d * 14.0) * 3.0;
  // Light rays: angular noise around the glow.
  float ang = atan(c.y - sunP.y, c.x - sunP.x);
  // Seam-free angular noise: sample on a circle instead of using the raw angle.
  vec2 dirc = vec2(cos(ang), sin(ang));
  float rays = pow(vnoise(dirc * 5.0 + vec2(uT * 0.05, 0.0)), 3.0) * smoothstep(1.1, 0.0, d) * 0.7;
  vec3 col = uBg;
  col += uCool * n1 * n1 * 0.28;
  col += uWarm * (glow + rays) * mix(0.2, 1.0, uLift) * (0.6 + 0.4 * n2);
  col += uWarm * n2 * n2 * 0.12 * uLift;
  // Horizon line catches the light.
  col += uWarm * exp(-abs(c.y - sunP.y + 0.02) * 90.0) * smoothstep(0.9, 0.0, abs(c.x)) * 0.8 * uLift;
  // Keep the text legible: darken behind it, inside the picture.
  col *= 1.0 - 0.72 * textScrim(uBox, 0.07, 0.2);
  col *= uIn * (1.0 - uExit * 0.4);
  o = vec4(col, 1.0);
}`;

export default defineScene({
  id: 'title',
  title: 'Title',
  alt: 'A warm light rises behind haze over a dark horizon while the title appears letter by letter.',
  notes: 'Wait for the room. Say the title only after it lands. One breath, then click.',
  transitionOut: { name: 'wipe', opts: { angle: 0.3, soft: 0.2 } },
  beats: [
    { say: 'Every presentation is a film', dur: 1.6, cue: { sound: 'swell', at: 0.1 } },
    { say: 'Scenes, beats, light and sound', source: 'A Botkins starter deck', dur: 1.2, cue: 'chime' },
  ],
  render(ctx, s) {
    const L1 = headline(ctx, s, 'Every presentation is a film', 0, { y: 0.44 });
    const L2 = sourceLine(ctx, s, 'SCENES, BEATS, LIGHT AND SOUND', 1, { y: 0.56 });
    const prog = ctx.program('bg', FS);
    ctx.draw(prog, {
      uT: s.t * s.motion,
      uIn: s.kp(0, 0, 0.5, E.outCubic) * 0.7 + 0.3,
      uLift: s.kp(1, 0, 1, E.inOutCubic),
      uExit: s.exit,
      uMouse: s.mouse,
      uBox: boxOf(L1, L2),
      uBg: BRAND.bg,
      uWarm: BRAND.warm,
      uCool: BRAND.cool,
    });
  },
  text(ctx, s) {
    headline(ctx, s, 'Every presentation is a film', 0, { y: 0.44 });
    sourceLine(ctx, s, 'SCENES, BEATS, LIGHT AND SOUND', 1, { y: 0.56, color: BRAND.accent });
  },
});
