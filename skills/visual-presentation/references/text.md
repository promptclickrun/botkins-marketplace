# Text in the picture

Text is part of the image, not a DOM layer on top of it. Glyphs are rasterised once into a canvas atlas and drawn as quads after post. So they:
- move with the picture and appear in screenshots and transitions;
- can be animated **per glyph** (offset, alpha, scale, wipe, colour);
- stay crisp (no bloom, grain or tone mapping on type).

DOM is only for chrome: help, overview, notes, the speaker window and an `aria-live` caption region.

## Content rules

- **One headline per beat, 10 words or fewer.** `deck.lint()` warns above 10.
- **At most one small line**: the source, a date or a caption. Sources are written out ("Survey of 1,204 teams, 2026"), not as "[1]".
- No bullet lists. Three bullets are three beats.
- Numbers: use the real unit (`26%`, `$4.2M`, `3.1×`). Do not round in a way that changes the claim.
- Sentence case for headlines. Use letter-spaced CAPS only for the small source line.

## Sizes (fraction of frame height)

| Role | Size | Font |
|---|---|---|
| Hero number | 0.16–0.22 | display, `tabular: true` |
| Headline | 0.06–0.10 | display (800 weight), tracking −0.02 |
| Sub-line | 0.04–0.05 | body |
| Source / label | 0.024–0.03 | body, tracking +0.04–0.06, CAPS |
| Axis or data labels | 0.022–0.026 | mono |

Minimum: 0.022 of frame height (about 24 px at 1080p). Smaller cannot be read from the back of a room.

## API

```js
const L = ctx.text.layout('Make the room feel it', {
  font: 'display' | 'body' | 'mono',
  size: 0.09,            // frame heights
  x: 0.5, y: 0.44,       // anchor: x as a fraction of frame width, y in frame heights (top = 0)
  align: 'center' | 'left' | 'right',
  valign: 'middle' | 'top' | 'bottom',
  maxWidth: 0.8,         // fraction of frame width; greedy word wrap
  tracking: -0.02, lineHeight: 1.12, tabular: false,
});
// L.box = {x0, y0, x1, y1} in frame units. Use it for scrims and placement.

ctx.text.draw(str, {
  layout: L,             // or pass the layout options directly
  color: '#f4efe6',      // display sRGB hex or [r,g,b]
  alpha: 1,
  mask: { y0, y1 },      // clip band in frame units: glyphs rise out from under a line
  glyph: (r) => ({ dx, dy, alpha, scale, wipe, color }),   // per glyph
});
```

Each glyph record `r` has `ch`, `i` (index), `n` (count), `line`, `word`, `x`, `y`.

### Reveal presets (`text.js` → `reveal`)

| Preset | Look | Good for |
|---|---|---|
| `reveal.rise(p)` + `mask` | Glyphs rise from under a line, left to right | Headlines (default in `headline()`) |
| `reveal.settle(p, {from: 1.3})` | Fade in while scaling down to size | Closing line, quotes |
| `reveal.wipe(p)` | Each glyph wipes on from its left edge | Labels, code, "typing" |
| `reveal.words(p)` | Whole words rise in turn | Long sub-lines |

Build your own with `staggered(p, r.i, r.n, spread, ease)`, which returns that glyph's own eased 0..1.

### Counters

```js
const v = s.kp(1, 0, 1, E.inOutCubic);
const str = `${Math.round(v * 26)}%`;
ctx.text.draw(str, { font: 'display', size: 0.19, y: 0.2, tabular: true, color: BRAND.accent });
```

`tabular: true` gives all digits the same advance, so the number does not jitter in width as it counts. Animate the counter with the same progress as the geometry that encodes the number.

## Legibility: scrims in the image

Put a **scrim** in the background shader behind the text box: a soft darkening of the image itself. It keeps the image continuous and is much better than a hard box.

```js
// render(): measure the text first, then pass its box to the shader
const L = headline(ctx, s, H, 0);
ctx.draw(prog, { uBox: boxOf(L, L2), ... });
```
```glsl
col *= 1.0 - 0.6 * textScrim(uBox, 0.03, 0.2);   // amount, padding, softness (frame units)
```

- Amount 0.35–0.75. Softness ≥ 0.15, or the box edge shows (a hard rectangle is a bug).
- Over instanced geometry (crowds), draw a premultiplied black quad with `textScrim` alpha **after** the geometry and before post (see `03-crowd.js`).
- Check contrast in the PNG, not in your head: light text needs a background of about 25% luminance or less behind it for 4.5:1.

## Fonts

- `assets/fonts/display.woff2`, `body.woff2`, `mono.woff2` are inlined by the build and used as `Deck Display` / `Deck Body` / `Deck Mono`. Embed only fonts whose licence allows embedding (OFL fonts do).
- The deck waits for `document.fonts.ready` and resets the atlas, so glyphs are not rasterised with a fallback font.
- Without files, it uses a system stack (Inter, Helvetica Neue, Liberation Sans, Arial). Screenshots taken on a server may use a different fallback than the presenter's laptop: embed fonts for anything important.

## Do not

- Use DOM text for headlines (it is not in screenshots or transitions and looks pasted on).
- Put text over the busiest part of the image.
- Animate text and a big camera move at the same moment: picture first, then text 0.2–0.4 s later.
- Let two headlines overlap at full opacity during a beat change: fade the old one out (0.2–0.35 s) first.
