// Shared look and text helpers for the demo scenes. Change the brand here.
import { reveal } from '../engine/text.js';
import { hexToLinear, ease as E, unmix } from '../engine/math.js';

export const BRAND = {
  ink: '#f4efe6', // text (display sRGB, drawn after post)
  muted: '#b9b2a6',
  accent: '#ffb35c',
  accent2: '#6fd3ff',
  // Linear HDR colours for shaders (values > 1 bloom).
  bg: hexToLinear('#07080c'),
  warm: hexToLinear('#ff9a3c'),
  cool: hexToLinear('#3aa6ff'),
  hot: hexToLinear('#ffd59a'),
};

// One headline (<= 10 words) revealed glyph by glyph from under a mask line.
// at: which beat drives it. Returns the layout so the scene can put a scrim behind it.
export function headline(ctx, s, str, at, o = {}) {
  const p = s.kp(at, 0, 1, E.linear);
  const L = o.layout || ctx.text.layout(str, { font: 'display', size: 0.085, maxWidth: 0.8, ...o });
  if (!ctx.drawing) return L;
  const out = (o.until != null ? 1 - s.kp(o.until, 0, 0.6) : 1) * (o.alpha ?? 1);
  ctx.text.draw(str, {
    layout: L,
    color: o.color || BRAND.ink,
    alpha: out,
    mask: { y0: L.box.y0 - 0.02, y1: L.box.y1 + 0.01 },
    glyph: (o.style ? reveal[o.style] : reveal.rise)(p, o.revealOpts || {}),
  });
  return L;
}

// The single small line under a headline: a source, a date, a caption.
export function sourceLine(ctx, s, str, at, o = {}) {
  const p = s.kp(at, 0.2, 1, E.outCubic);
  const L = o.layout || ctx.text.layout(str, { font: 'body', size: 0.028, tracking: 0.04, ...o });
  if (!ctx.drawing) return L;
  const out = o.until != null ? 1 - s.kp(o.until, 0, 0.6) : 1;
  ctx.text.draw(str, { layout: L, color: o.color || BRAND.muted, alpha: p * out, glyph: () => ({ dy: (1 - p) * 0.012 }) });
  return L;
}

// Union of layout boxes as a vec4 for textScrim().
export function boxOf(...Ls) {
  const b = Ls.filter(Boolean).map((L) => L.box);
  if (!b.length) return [0, 0, 0, 0];
  return [Math.min(...b.map((x) => x.x0)), Math.min(...b.map((x) => x.y0)), Math.max(...b.map((x) => x.x1)), Math.max(...b.map((x) => x.y1))];
}

export { E, unmix };
