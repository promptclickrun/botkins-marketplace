import { defineTransition } from '../engine/transitions.js';

// A dip-free crossfade with a slight luminance-weighted bias: bright parts of B arrive first,
// which reads more like film than a flat 50/50 mix.
export default defineTransition({
  name: 'crossfade',
  dur: 0.9,
  glsl: /* glsl */ `
vec4 transition(vec2 uv, float p) {
  vec4 a = A(uv), b = B(uv);
  float bias = (luma(b.rgb) - luma(a.rgb)) * 0.35;
  float t = smoothstep(0.0, 1.0, clamp(p + bias * p * (1.0 - p) * 4.0, 0.0, 1.0));
  return mix(a, b, t);
}`,
});
