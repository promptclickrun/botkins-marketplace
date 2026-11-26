// Math, easing and deterministic randomness. Nothing here reads the clock.

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const mix = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
// Map x from [a,b] to [0,1], clamped.
export const unmix = (a, b, x) => clamp((x - a) / (b - a));
// Interpolate in log space: use for any change of scale (1 -> 1000 people, 1x -> 100x zoom).
export const logMix = (a, b, t) => Math.exp(mix(Math.log(a), Math.log(b), t));
export const fract = (x) => x - Math.floor(x);
// 0 at t=0 and t=1, 1 at the middle. Handy for "only during the move" effects.
export const bump = (t) => Math.sin(Math.PI * clamp(t));

export const ease = {
  linear: (t) => t,
  inQuad: (t) => t * t,
  outQuad: (t) => 1 - (1 - t) * (1 - t),
  inOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  inCubic: (t) => t * t * t,
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outQuart: (t) => 1 - Math.pow(1 - t, 4),
  inOutQuart: (t) => (t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2),
  outExpo: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  inOutExpo: (t) =>
    t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2,
  inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  outBack: (t) => {
    const c = 1.6;
    const u = t - 1;
    return 1 + (c + 1) * u * u * u + c * u * u;
  },
};

// Integer hash -> [0,1). Same input, same output, on every machine.
export function hash(n, seed = 0) {
  let x = (Math.imul(n | 0, 0x9e3779b1) ^ Math.imul((seed | 0) + 0x632be5ab, 0x85ebca77)) >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

// Seeded PRNG (small-state xorshift-multiply). Use instead of Math.random for anything visible.
export function prng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Exponential approach that is frame-rate independent (for chrome-only smoothing like the pointer).
export const damp = (cur, target, rate, dt) => mix(cur, target, 1 - Math.exp(-rate * dt));

export const hexToLinear = (hex) => {
  const h = hex.replace('#', '');
  const v = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  return v.map((c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
};
