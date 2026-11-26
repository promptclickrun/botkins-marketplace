import { defineTransition } from '../engine/transitions.js';

// Soft-edged diagonal wipe. The edge is wide and noisy enough to feel like light, not a ruler.
export default defineTransition({
  name: 'wipe',
  dur: 1.1,
  uniforms: ({ opts }) => ({ uAngle: (opts && opts.angle) ?? 0.35, uSoft: (opts && opts.soft) ?? 0.18 }),
  glsl: /* glsl */ `
uniform float uAngle;
uniform float uSoft;
vec4 transition(vec2 uv, float p) {
  vec2 dir = vec2(cos(uAngle), sin(uAngle));
  vec2 q = (uv - 0.5) * vec2(uAspect, 1.0);
  float span = abs(dir.x) * uAspect * 0.5 + abs(dir.y) * 0.5;
  float x = dot(q, dir) / span * 0.5 + 0.5;            // 0..1 across the frame
  x += (fbm(uv * vec2(uAspect, 1.0) * 3.0) - 0.5) * uSoft * 0.8;
  float edge = mix(-uSoft, 1.0 + uSoft, p);
  float m = smoothstep(edge + uSoft, edge - uSoft, x);
  float glow = (1.0 - abs(m * 2.0 - 1.0)) * 0.35;
  vec3 c = mix(A(uv).rgb, B(uv).rgb, m) + glow * vec3(1.0, 0.95, 0.9);
  return vec4(c, 1.0);
}`,
});
