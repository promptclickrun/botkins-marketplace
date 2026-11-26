// Text inside the picture: glyphs rasterised once into a canvas atlas, drawn as quads,
// animated per glyph. All layout is in "frame units": the 16:9 safe frame is
// FRAME_W wide and 1 tall, y grows downward. Sizes are fractions of the frame height.
import { makeProgram, setUniforms } from './gl.js';
import { clamp, unmix, ease as E } from './math.js';

export const FRAME_W = 16 / 9;

export const FONTS = {
  display: { family: "'Deck Display', 'Inter', 'Helvetica Neue', 'Liberation Sans', Arial, sans-serif", weight: 800, px: 112 },
  body: { family: "'Deck Body', 'Inter', 'Helvetica Neue', 'Liberation Sans', Arial, sans-serif", weight: 500, px: 64 },
  mono: { family: "'Deck Mono', 'JetBrains Mono', 'DejaVu Sans Mono', 'Liberation Mono', monospace", weight: 600, px: 72 },
};

const VS = /* glsl */ `
in vec2 aPos;
in vec2 aUv;
in vec4 aColor;
in vec4 aClip;
out vec2 vUv;
out vec4 vColor;
out vec4 vClip;
uniform vec2 uRes;
void main() {
  vUv = aUv;
  vColor = aColor;
  vClip = aClip;
  gl_Position = vec4(aPos.x / uRes.x * 2.0 - 1.0, 1.0 - aPos.y / uRes.y * 2.0, 0.0, 1.0);
}`;

const FS = /* glsl */ `
in vec2 vUv;
in vec4 vColor;
in vec4 vClip;
uniform sampler2D uAtlas;
void main() {
  vec2 px = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  // Soft-edged clip rectangle in target pixels (x0, y0, x1, y1).
  float m = sat(px.y - vClip.y) * sat(vClip.w - px.y) * sat(px.x - vClip.x) * sat(vClip.z - px.x);
  float a = texture(uAtlas, vUv).a * vColor.a * m;
  o = vec4(vColor.rgb * a, a);
}`;

const ATLAS = 2048;
const FLOATS = 2 + 2 + 4 + 4;

export function createText(G) {
  const { gl } = G;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = ATLAS;
  const c2 = canvas.getContext('2d', { willReadFrequently: false });
  const glyphs = new Map();
  const kern = new Map();
  let penX = 0;
  let penY = 0;
  let rowH = 0;
  let dirty = true;

  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL, 3);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const prog = makeProgram(gl, VS, FS, 'text');
  const vao = gl.createVertexArray();
  const vbo = gl.createBuffer();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  const attrs = [['aPos', 2, 0], ['aUv', 2, 2], ['aColor', 4, 4], ['aClip', 4, 8]];
  for (const [name, size, off] of attrs) {
    const loc = gl.getAttribLocation(prog, name);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, FLOATS * 4, off * 4);
  }
  gl.bindVertexArray(null);
  let verts = new Float32Array(FLOATS * 6 * 2048);
  let count = 0;
  let target = null;
  let frame = null;

  const fontCss = (f) => `${f.weight} ${f.px}px ${f.family}`;

  function glyph(fontKey, ch) {
    const key = fontKey + '\u0000' + ch;
    let g = glyphs.get(key);
    if (g) return g;
    const f = FONTS[fontKey];
    c2.font = fontCss(f);
    const m = c2.measureText(ch);
    const pad = Math.ceil(f.px * 0.12);
    const asc = Math.ceil(f.px * 1.0);
    const desc = Math.ceil(f.px * 0.32);
    const left = Math.ceil(Math.max(0, m.actualBoundingBoxLeft || 0));
    const inkW = Math.ceil(Math.max(m.width, (m.actualBoundingBoxRight || 0) + left));
    const w = inkW + pad * 2;
    const h = asc + desc + pad * 2;
    if (penX + w > ATLAS) {
      penX = 0;
      penY += rowH;
      rowH = 0;
    }
    if (penY + h > ATLAS) {
      // Atlas full: start over. Rare; glyphs re-rasterise on demand.
      glyphs.clear();
      c2.clearRect(0, 0, ATLAS, ATLAS);
      penX = penY = rowH = 0;
    }
    c2.fillStyle = '#fff';
    c2.textBaseline = 'alphabetic';
    c2.fillText(ch, penX + pad + left, penY + pad + asc);
    g = {
      u0: penX / ATLAS,
      v0: penY / ATLAS,
      u1: (penX + w) / ATLAS,
      v1: (penY + h) / ATLAS,
      w: w / f.px,
      h: h / f.px,
      ox: -(pad + left) / f.px,
      oy: -(pad + asc) / f.px,
      adv: m.width / f.px,
    };
    glyphs.set(key, g);
    penX += w;
    rowH = Math.max(rowH, h);
    dirty = true;
    return g;
  }

  function pairKern(fontKey, a, b) {
    if (!a) return 0;
    const key = fontKey + a + b;
    let k = kern.get(key);
    if (k !== undefined) return k;
    const f = FONTS[fontKey];
    c2.font = fontCss(f);
    k = (c2.measureText(a + b).width - c2.measureText(a).width - c2.measureText(b).width) / f.px;
    kern.set(key, k);
    return k;
  }

  // Lay out a string. Returns glyph records and a bounding box, all in frame units.
  function layout(str, o = {}) {
    const fontKey = o.font || 'display';
    const size = o.size ?? 0.08;
    const tracking = o.tracking ?? (fontKey === 'display' ? -0.02 : 0);
    const lineH = (o.lineHeight ?? 1.12) * size;
    const maxW = o.maxWidth != null ? o.maxWidth * FRAME_W : Infinity;
    const tab = o.tabular ? Math.max(...'0123456789'.split('').map((d) => glyph(fontKey, d).adv)) : 0;
    const adv = (prev, ch) => {
      const g = glyph(fontKey, ch);
      const a = tab && ch >= '0' && ch <= '9' ? tab : g.adv;
      return (a + tracking + (tab ? 0 : pairKern(fontKey, prev, ch))) * size;
    };
    const measure = (s) => {
      let w = 0;
      let p = '';
      for (const ch of s) {
        w += adv(p, ch);
        p = ch;
      }
      return w - tracking * size;
    };
    // Greedy word wrap.
    const lines = [];
    for (const para of String(str).split('\n')) {
      let line = '';
      for (const word of para.split(' ')) {
        const t = line ? line + ' ' + word : word;
        if (line && measure(t) > maxW) {
          lines.push(line);
          line = word;
        } else line = t;
      }
      lines.push(line);
    }
    const x0 = (o.x ?? 0.5) * FRAME_W;
    const y0 = o.y ?? 0.5;
    const align = o.align || 'center';
    const vAlign = o.valign || 'middle';
    const totalH = lines.length * lineH;
    // y is the baseline of the first line, adjusted so the block is anchored by valign.
    const capH = size * 0.72;
    let baseY = y0 + capH / 2;
    if (vAlign === 'top') baseY = y0 + capH;
    if (vAlign === 'middle') baseY -= ((lines.length - 1) * lineH) / 2;
    if (vAlign === 'bottom') baseY = y0 - (lines.length - 1) * lineH;
    const out = [];
    let minX = Infinity;
    let maxX = -Infinity;
    let word = 0;
    lines.forEach((ln, li) => {
      const w = measure(ln);
      let x = align === 'left' ? x0 : align === 'right' ? x0 - w : x0 - w / 2;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x + w);
      let prev = '';
      for (const ch of ln) {
        if (ch === ' ') word++;
        else out.push({ ch, g: glyph(fontKey, ch), x, y: baseY + li * lineH, line: li, word });
        x += adv(prev, ch);
        prev = ch;
      }
      word++;
    });
    out.forEach((r, i) => {
      r.i = i;
      r.n = out.length;
    });
    const top = baseY - capH - size * 0.12;
    const box = { x0: minX, y0: top, x1: maxX, y1: top + totalH - lineH + size * 1.12, size };
    return { glyphs: out, box, size, lines: lines.length };
  }

  function begin(t, fr) {
    target = t;
    frame = fr;
    count = 0;
  }

  // Frame units -> target pixels.
  const fx = (x) => frame.x + x * frame.h;
  const fy = (y) => frame.y + y * frame.h;

  function push(x0, y0, x1, y1, u0, v0, u1, v1, col, clip) {
    if ((count + 1) * 6 * FLOATS > verts.length) {
      const n = new Float32Array(verts.length * 2);
      n.set(verts);
      verts = n;
    }
    const q = [
      [x0, y0, u0, v0], [x1, y0, u1, v0], [x0, y1, u0, v1],
      [x1, y0, u1, v0], [x1, y1, u1, v1], [x0, y1, u0, v1],
    ];
    let k = count * 6 * FLOATS;
    for (const v of q) {
      verts[k++] = v[0]; verts[k++] = v[1]; verts[k++] = v[2]; verts[k++] = v[3];
      verts[k++] = col[0]; verts[k++] = col[1]; verts[k++] = col[2]; verts[k++] = col[3];
      verts[k++] = clip[0]; verts[k++] = clip[1]; verts[k++] = clip[2]; verts[k++] = clip[3];
    }
    count++;
  }

  // Draw a string. o.glyph(r) may return {dx, dy, alpha, scale, wipe, color}.
  // o.mask = {y0, y1} hides anything outside that band (frame units): the line-mask reveal.
  function draw(str, o = {}) {
    const L = o.layout || layout(str, o);
    const col = toColor(o.color ?? '#ffffff');
    const alpha = o.alpha ?? 1;
    if (alpha <= 0.001) return L;
    const clip = o.mask
      ? [-1e5, fy(o.mask.y0), 1e5, fy(o.mask.y1)]
      : [-1e5, -1e5, 1e5, 1e5];
    for (const r of L.glyphs) {
      const a = o.glyph ? o.glyph(r) || {} : {};
      const ga = alpha * (a.alpha ?? 1);
      if (ga <= 0.002) continue;
      const s = L.size * (a.scale ?? 1);
      const g = r.g;
      const cx = r.x + (g.adv * L.size) / 2;
      const cy = r.y - L.size * 0.36;
      let x0 = cx + ((r.x + g.ox * L.size) - cx) * (s / L.size) + (a.dx ?? 0);
      const y0 = cy + ((r.y + g.oy * L.size) - cy) * (s / L.size) + (a.dy ?? 0);
      let w = g.w * s;
      const h = g.h * s;
      let u1 = g.u1;
      const wipe = a.wipe ?? 1;
      if (wipe < 1) {
        w *= clamp(wipe);
        u1 = g.u0 + (g.u1 - g.u0) * clamp(wipe);
      }
      const c = a.color ? toColor(a.color) : col;
      push(fx(x0), fy(y0), fx(x0 + w), fy(y0 + h), g.u0, g.v0, u1, g.v1, [c[0], c[1], c[2], ga], clip);
    }
    return L;
  }

  function flush() {
    if (!count) return;
    if (dirty) {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
      gl.generateMipmap(gl.TEXTURE_2D);
      dirty = false;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, verts.subarray(0, count * 6 * FLOATS), gl.DYNAMIC_DRAW);
    gl.useProgram(prog);
    setUniforms(gl, prog, { uAtlas: { tex }, uRes: [target.w, target.h] });
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.bindVertexArray(vao);
    gl.drawArrays(gl.TRIANGLES, 0, count * 6);
    gl.bindVertexArray(null);
    gl.disable(gl.BLEND);
    count = 0;
  }

  function reset() {
    glyphs.clear();
    kern.clear();
    c2.clearRect(0, 0, ATLAS, ATLAS);
    penX = penY = rowH = 0;
    dirty = true;
  }

  return { layout, draw, begin, flush, reset, measure: (s, o) => layout(s, o).box, canvas };
}

function toColor(c) {
  if (typeof c === 'string') {
    const h = c.replace('#', '');
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  }
  return c;
}

// Per-glyph reveal presets. p is the beat progress (0..1). Returns a glyph() function.
export const reveal = {
  // Glyphs rise out from under a line, staggered left to right. Pair with o.mask.
  rise(p, { spread = 0.55, dist = 0.9, easeFn = E.outCubic } = {}) {
    return (r) => {
      const t = staggered(p, r.i, r.n, spread, easeFn);
      return { dy: (1 - t) * dist * 0.1, alpha: unmix(0, 0.4, t) };
    };
  },
  // Fade and slight scale-down into place.
  settle(p, { spread = 0.5, from = 1.25, easeFn = E.outQuart } = {}) {
    return (r) => {
      const t = staggered(p, r.i, r.n, spread, easeFn);
      return { scale: from + (1 - from) * t, alpha: t };
    };
  },
  // Typewriter-style horizontal wipe per glyph.
  wipe(p, { spread = 0.85, easeFn = E.linear } = {}) {
    return (r) => {
      const t = staggered(p, r.i, r.n, spread, easeFn);
      return { wipe: t, alpha: t > 0 ? 1 : 0 };
    };
  },
  // Whole words at a time.
  words(p, { spread = 0.6, dist = 0.03, easeFn = E.outCubic, count = 8 } = {}) {
    return (r) => {
      const t = staggered(p, r.word, count, spread, easeFn);
      return { dy: (1 - t) * dist, alpha: t };
    };
  },
};

export function staggered(p, i, n, spread, easeFn = E.outCubic) {
  if (n <= 1) return easeFn(clamp(p));
  const start = (i / (n - 1)) * spread;
  return easeFn(unmix(start, start + (1 - spread), p));
}
