import { defineTransition } from '../engine/transitions.js';

// Push / shove: B slides in and shoves A out, with a short motion smear along the move.
export default defineTransition({
  name: 'push',
  dur: 1.0,
  uniforms: ({ opts }) => ({ uDir: opts && opts.dir === 'up' ? [0, 1] : [1, 0] }),
  glsl: /* glsl */ `
uniform vec2 uDir;
vec4 transition(vec2 uv, float p) {
  float e = p < 0.5 ? 4.0 * p * p * p : 1.0 - pow(-2.0 * p + 2.0, 3.0) / 2.0;
  float speed = 6.0 * p * (1.0 - p);
  vec3 c = vec3(0.0);
  for (int i = 0; i < 6; i++) {
    float k = e + (float(i) / 5.0 - 0.5) * 0.012 * speed;
    vec2 q = uv + uDir * k;
    bool inB = dot(q, uDir) >= 1.0;
    c += inB ? B(q - uDir).rgb : A(q).rgb;
  }
  return vec4(c / 6.0, 1.0);
}`,
});
