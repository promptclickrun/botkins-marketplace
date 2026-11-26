// Shared GLSL. Prepended to every program the engine compiles (both stages).

export const LIB = /* glsl */ `
#define PI 3.14159265
#define TAU 6.28318531
float sat(float x) { return clamp(x, 0.0, 1.0); }
vec3 sat(vec3 x) { return clamp(x, 0.0, 1.0); }
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
mat2 rot2(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

// Integer hashes: stateless, so anything built from them can be scrubbed.
float hashu(uint x) {
  x ^= x >> 16; x *= 0x7feb352du; x ^= x >> 15; x *= 0x846ca68bu; x ^= x >> 16;
  return float(x) * (1.0 / 4294967296.0);
}
float hashi(int i, int seed) { return hashu(uint(i) * 0x9e3779b1u + uint(seed) * 0x85ebca77u + 0x632be5abu); }
float hash12(vec2 p) {
  ivec2 q = ivec2(floor(p));
  return hashu(uint(q.x) * 0x9e3779b1u ^ (uint(q.y) * 0x85ebca77u + 0x27d4eb2fu));
}
vec2 hash22(vec2 p) { return vec2(hash12(p), hash12(p + 91.7)); }

// Value noise with quintic fade, and a rotated fbm.
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = hash12(i), b = hash12(i + vec2(1, 0)), c = hash12(i + vec2(0, 1)), d = hash12(i + vec2(1, 1));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  mat2 r = mat2(0.8, -0.6, 0.6, 0.8);
  for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = r * p * 2.03 + 17.1; a *= 0.5; }
  return s;
}
// Darkening pad behind text, in the image: 0 far away, 1 at the centre of the box.
float scrim(vec2 uv, vec2 c, vec2 halfSize, float soft) {
  vec2 d = abs(uv - c) - halfSize;
  float e = length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
  return 1.0 - smoothstep(-soft * 0.2, soft, e);
}
`;

export const FULL_VS = /* glsl */ `
out vec2 vUv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;

// Fragment-only helpers. uFrame = (x, y, width, height) of the 16:9 safe frame in target
// pixels, measured from the top-left. Frame units match text layout: x in [0, 16/9], y in [0, 1] downward.
export const FRAG_LIB = /* glsl */ `
uniform vec2 uRes;
uniform vec4 uFrame;
vec2 framePos() {
  vec2 px = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  return (px - uFrame.xy) / uFrame.w;
}
// Centred on the frame, y up, frame height 1: y in [-0.5, 0.5], x in [-0.889, 0.889].
vec2 centered() { vec2 f = framePos(); return vec2(f.x - 0.8888889, 0.5 - f.y); }
// Darken behind a text box given in frame units (x0, y0, x1, y1) so type stays legible.
float textScrim(vec4 box, float pad, float soft) {
  vec2 f = framePos();
  vec2 c = (box.xy + box.zw) * 0.5;
  vec2 h = (box.zw - box.xy) * 0.5 + pad;
  return scrim(f, c, h, soft);
}
`;

export const HEADER = '#version 300 es\nprecision highp float;\nprecision highp int;\n';
export const FRAG_HEADER = HEADER + LIB + FRAG_LIB + '\nout vec4 o;\n';
export const VERT_HEADER = HEADER + LIB + '\n';
