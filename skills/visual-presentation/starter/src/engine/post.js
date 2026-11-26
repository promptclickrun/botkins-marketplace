// Post stack: HDR scene target -> bloom -> ACES fit -> grade -> sRGB -> vignette, grain, dither.
// Output is display-ready RGBA8. Text is drawn after this, so glyphs stay crisp.
import { fullProgram, makeTarget, resizeTarget, bindTarget, drawFull } from './gl.js';

const BRIGHT = /* glsl */ `
in vec2 vUv;
uniform sampler2D uSrc;
uniform float uThreshold;
uniform vec2 uTexel;
void main() {
  // 4-tap box downsample while extracting highlights (soft knee).
  vec3 c = vec3(0.0);
  c += texture(uSrc, vUv + uTexel * vec2(-1, -1)).rgb;
  c += texture(uSrc, vUv + uTexel * vec2( 1, -1)).rgb;
  c += texture(uSrc, vUv + uTexel * vec2(-1,  1)).rgb;
  c += texture(uSrc, vUv + uTexel * vec2( 1,  1)).rgb;
  c *= 0.25;
  c = max(c, 0.0);
  c = min(c, vec3(64.0)); // one hot pixel must not paint the screen
  float l = max(c.r, max(c.g, c.b));
  float knee = uThreshold * 0.5;
  float s = clamp(l - uThreshold + knee, 0.0, 2.0 * knee);
  s = s * s / (4.0 * knee + 1e-4);
  float w = max(s, l - uThreshold) / max(l, 1e-4);
  o = vec4(c * w, 1.0);
}`;

const DOWN = /* glsl */ `
in vec2 vUv;
uniform sampler2D uSrc;
uniform vec2 uTexel;
void main() {
  vec3 c = texture(uSrc, vUv).rgb * 4.0;
  c += texture(uSrc, vUv + uTexel * vec2(-1, -1)).rgb;
  c += texture(uSrc, vUv + uTexel * vec2( 1, -1)).rgb;
  c += texture(uSrc, vUv + uTexel * vec2(-1,  1)).rgb;
  c += texture(uSrc, vUv + uTexel * vec2( 1,  1)).rgb;
  o = vec4(c / 8.0, 1.0);
}`;

const UP = /* glsl */ `
in vec2 vUv;
uniform sampler2D uSrc;
uniform sampler2D uBase;
uniform vec2 uTexel;
void main() {
  // 9-tap tent upsample added onto the next larger level.
  vec3 c = vec3(0.0);
  c += texture(uSrc, vUv + uTexel * vec2(-1, -1)).rgb;
  c += texture(uSrc, vUv + uTexel * vec2( 0, -1)).rgb * 2.0;
  c += texture(uSrc, vUv + uTexel * vec2( 1, -1)).rgb;
  c += texture(uSrc, vUv + uTexel * vec2(-1,  0)).rgb * 2.0;
  c += texture(uSrc, vUv).rgb * 4.0;
  c += texture(uSrc, vUv + uTexel * vec2( 1,  0)).rgb * 2.0;
  c += texture(uSrc, vUv + uTexel * vec2(-1,  1)).rgb;
  c += texture(uSrc, vUv + uTexel * vec2( 0,  1)).rgb * 2.0;
  c += texture(uSrc, vUv + uTexel * vec2( 1,  1)).rgb;
  o = vec4(texture(uBase, vUv).rgb + c / 16.0, 1.0);
}`;

const COMPOSITE = /* glsl */ `
in vec2 vUv;
uniform sampler2D uSrc;
uniform sampler2D uBloom;
uniform float uBloomAmt, uExposure, uVignette, uGrain, uSeed, uSat, uContrast;
uniform vec3 uShadows, uHighlights;

vec3 acesFit(vec3 x) {
  // Narkowicz's curve fit of the ACES filmic tone curve.
  return sat((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14));
}
vec3 toSRGB(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
void main() {
  vec3 hdr = max(texture(uSrc, vUv).rgb, 0.0);
  vec3 bloom = texture(uBloom, vUv).rgb;
  vec3 c = (hdr + bloom * uBloomAmt) * uExposure;
  // Any NaN or Inf from a scene becomes black instead of a bright square.
  if (any(isnan(c)) || any(isinf(c))) c = vec3(0.0);
  c = acesFit(c);
  // Grade in display-linear: split tone, contrast around mid grey, saturation.
  float l = luma(c);
  c *= mix(uShadows, uHighlights, smoothstep(0.05, 0.6, l));
  c = 0.18 + (c - 0.18) * uContrast;
  c = max(c, 0.0);
  c = mix(vec3(luma(c)), c, uSat);
  c = toSRGB(sat(c));
  // Vignette by distance from centre, aspect-corrected.
  vec2 q = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  c *= 1.0 - uVignette * smoothstep(0.35, 1.05, length(q));
  // Film grain (luma-weighted, strongest in mid-tones) and +-1/255 triangular dither.
  vec2 px = vUv * uRes;
  float g = hash12(px + uSeed * 131.0) - 0.5;
  c += g * uGrain * (1.0 - abs(luma(c) - 0.5) * 1.6);
  float d = hash12(px + 17.0 + uSeed) + hash12(px + 59.0 - uSeed) - 1.0;
  c += d / 255.0;
  o = vec4(c, 1.0);
}`;

export const DEFAULT_GRADE = {
  bloom: 0.6,
  threshold: 0.9,
  exposure: 1.0,
  vignette: 0.35,
  grain: 0.035,
  saturation: 1.05,
  contrast: 1.04,
  shadows: [0.96, 1.0, 1.06],
  highlights: [1.04, 1.0, 0.96],
};

export function createPost(G) {
  const { gl, floatOK } = G;
  const progs = {
    bright: fullProgram(gl, BRIGHT, 'post.bright'),
    down: fullProgram(gl, DOWN, 'post.down'),
    up: fullProgram(gl, UP, 'post.up'),
    comp: fullProgram(gl, COMPOSITE, 'post.composite'),
  };
  const LEVELS = 5;
  const down = [];
  const up = [];
  for (let i = 0; i < LEVELS; i++) {
    down.push(makeTarget(gl, 4, 4, { floatOK }));
    up.push(makeTarget(gl, 4, 4, { floatOK }));
  }

  function resize(w, h) {
    for (let i = 0; i < LEVELS; i++) {
      const f = 2 ** (i + 1);
      resizeTarget(gl, down[i], w / f, h / f);
      resizeTarget(gl, up[i], w / f, h / f);
    }
  }

  // src: HDR target, dst: LDR target. grade: partial DEFAULT_GRADE. seed: deterministic grain seed.
  function run(src, dst, grade, seed) {
    const g = { ...DEFAULT_GRADE, ...grade };
    const vao = G.emptyVAO;
    resize(src.w, src.h);
    bindTarget(gl, down[0], false);
    drawFull(gl, vao, progs.bright, {
      uSrc: { tex: src },
      uThreshold: g.threshold,
      uTexel: [0.5 / src.w, 0.5 / src.h],
    });
    for (let i = 1; i < LEVELS; i++) {
      bindTarget(gl, down[i], false);
      drawFull(gl, vao, progs.down, { uSrc: { tex: down[i - 1] }, uTexel: [1 / down[i - 1].w, 1 / down[i - 1].h] });
    }
    // Walk back up: up[L-1] = down[L-1] (+0), then up[i] = down[i] + tent(up[i+1]).
    let prev = down[LEVELS - 1];
    for (let i = LEVELS - 2; i >= 0; i--) {
      bindTarget(gl, up[i], false);
      drawFull(gl, vao, progs.up, { uSrc: { tex: prev }, uBase: { tex: down[i] }, uTexel: [1 / prev.w, 1 / prev.h] });
      prev = up[i];
    }
    bindTarget(gl, dst, false);
    drawFull(gl, vao, progs.comp, {
      uSrc: { tex: src },
      uBloom: { tex: up[0] },
      uBloomAmt: g.bloom / LEVELS,
      uExposure: g.exposure,
      uVignette: g.vignette,
      uGrain: g.grain,
      uSeed: seed % 97,
      uSat: g.saturation,
      uContrast: g.contrast,
      uShadows: g.shadows,
      uHighlights: g.highlights,
      uRes: [dst.w, dst.h],
    });
  }

  return { run, resize, progs };
}
