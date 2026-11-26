import { defineTransition } from '../engine/transitions.js';

// Pixel dissolve: blocks flip from A to B in a noise order; blocks shrink as p grows,
// so it starts chunky and finishes fine.
export default defineTransition({
  name: 'dissolve',
  dur: 1.2,
  glsl: /* glsl */ `
vec4 transition(vec2 uv, float p) {
  float cells = mix(18.0, 140.0, p);
  vec2 g = floor(uv * vec2(cells * uAspect, cells));
  float n = hash12(g + floor(cells));
  float fine = vnoise(uv * vec2(uAspect, 1.0) * 6.0);
  float order = mix(n, fine, 0.55);
  float m = step(order, p * 1.08 - 0.04);
  return mix(A(uv), B(uv), m);
}`,
});
