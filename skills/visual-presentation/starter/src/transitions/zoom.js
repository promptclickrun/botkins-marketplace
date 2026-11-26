import { defineTransition } from '../engine/transitions.js';

// Zoom-through: fly into A (radial blur while scaling up), arrive in B from slightly far away.
// Scale is interpolated in log space so the speed feels constant.
export default defineTransition({
  name: 'zoom',
  dur: 1.2,
  uniforms: ({ opts }) => ({ uCenter: (opts && opts.center) || [0.5, 0.5] }),
  glsl: /* glsl */ `
uniform vec2 uCenter;
vec4 transition(vec2 uv, float p) {
  float e = p * p * (3.0 - 2.0 * p);
  float sA = exp(mix(0.0, log(6.0), e));          // A grows 1x -> 6x
  float sB = exp(mix(log(0.4), 0.0, e));          // B grows 0.4x -> 1x
  float blur = sin(PI * p) * 0.12;
  vec3 a = vec3(0.0), b = vec3(0.0);
  for (int i = 0; i < 8; i++) {
    float k = 1.0 - blur * float(i) / 7.0;
    a += A(uCenter + (uv - uCenter) / (sA / k)).rgb;
    b += B(uCenter + (uv - uCenter) / (sB / k)).rgb;
  }
  a /= 8.0; b /= 8.0;
  float m = smoothstep(0.35, 0.65, p);
  vec3 flash = vec3(1.0, 0.95, 0.85) * pow(sin(PI * p), 6.0) * 0.25;
  return vec4(mix(a, b, m) + flash, 1.0);
}`,
});
