import { defineTransition } from '../engine/transitions.js';

// Iris / portal: B opens from a circle. If the outgoing scene exposes a `portal` hook
// ({x, y, r} in uv, y up), the circle starts exactly where that scene drew its portal,
// so the doorway in A becomes the whole screen. Hook units: centred frame units (y up), r in
// frame heights; toUv/frameToUvY convert them for the shader.
export default defineTransition({
  name: 'portal',
  dur: 1.4,
  sound: 'whoosh',
  uniforms({ from, fromState, toUv, frameToUvY }) {
    const h = from && from.hooks && from.hooks.portal ? from.hooks.portal(fromState) : null;
    return { uCenter: h ? toUv(h.x, h.y) : [0.5, 0.5], uR0: h ? h.r * frameToUvY : 0.0 };
  },
  glsl: /* glsl */ `
uniform vec2 uCenter;
uniform float uR0;
vec4 transition(vec2 uv, float p) {
  vec2 d = (uv - uCenter) * vec2(uAspect, 1.0);
  float far = length(max(abs(uCenter), abs(1.0 - uCenter)) * vec2(uAspect, 1.0)) + 0.05;
  float e = p * p * (3.0 - 2.0 * p);
  float r = mix(uR0, far, e);
  float dist = length(d);
  // Inside the iris, B is seen slightly magnified and settles to 1x as the iris fills the frame.
  float zoom = mix(1.35, 1.0, e);
  vec2 buv = uCenter + (uv - uCenter) / zoom;
  vec4 b = B(buv);
  // Outside, A is pulled inward a little, as if sucked through.
  vec2 auv = uCenter + (uv - uCenter) * mix(1.0, 0.9, e);
  vec4 a = A(auv);
  float edge = 0.004 + 0.02 * (1.0 - e);
  float m = smoothstep(r + edge, r - edge, dist);
  // A thin bright rim sells the doorway.
  float rim = exp(-pow((dist - r) / (edge * 2.5 + 0.002), 2.0)) * (1.0 - e) * 0.6;
  return vec4(mix(a.rgb, b.rgb, m) + rim * vec3(1.0, 0.9, 0.75), 1.0);
}`,
});
