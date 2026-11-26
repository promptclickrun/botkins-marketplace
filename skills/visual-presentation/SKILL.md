---
name: visual-presentation
description: Make cinematic, film-like presentations as one self-contained WebGL HTML file, with scenes made of beats, shader transitions, synthesized sound and presenter controls. Use for cinematic or animated presentations, keynote-style talks, product or release trailers, pitch decks that need to impress, and data stories. Also helps choose the medium. Do not use it for editable corporate decks or slides others must edit in Office (use the pptx skill), or for a quick plain outline.
---

# Visual presentation

You make a talk that plays like a short film: one full-window WebGL canvas, scenes made of beats, light and sound tuned together, and presenter controls. You ship it as **one HTML file** that opens from disk with no network.

The engine is in `starter/`. It is original, dependency-free WebGL2. Copy it; do not write a new engine. The reference files say *how*; this file gives the *order*.

| Need | Read |
|---|---|
| Scene API, controller, headless hooks | [references/engine.md](references/engine.md) |
| Pacing numbers, easing, staggers | [references/beats-and-timing.md](references/beats-and-timing.md) |
| Colour pipeline, post, shader cost | [references/rendering.md](references/rendering.md) |
| Type in the picture | [references/text.md](references/text.md) |
| Transitions (contract + 6 recipes) | [references/transitions.md](references/transitions.md) |
| Sound | [references/audio.md](references/audio.md) |
| Story, honesty, notes | [references/narrative.md](references/narrative.md) |
| Idea → technique recipes | [references/scene-recipes.md](references/scene-recipes.md) |
| Before you present | [references/checklist.md](references/checklist.md) |

## 1. Choose the medium first

Ask one question: **who edits this after you?**

| Situation | Medium |
|---|---|
| Others must edit it, it goes into a corporate template, or it is printed or emailed as a file | **PowerPoint**: hand off to the `pptx` skill. Stop here. |
| Content-heavy (training, tables, many bullets), shown on unknown hardware, or needed in under an hour | **Plain HTML slides**: semantic sections, CSS transitions, keyboard nav. See §9. |
| One speaker, a big screen, a moment that must land (keynote, launch, pitch, data story, trailer) | **Cinematic deck** (this skill). |

If you are not sure, say what you plan to make and why in one line, then continue. Make the cinematic deck only when the picture carries the argument. A deck full of bullets is worse as a film than as slides.

## 2. Gather the minimum input

Get these before you build. Ask once, in one message, for what is missing. Assume sensible defaults for the rest and say what you assumed.

1. **Audience and setting**: who, how many, room or remote, projector or laptop.
2. **Talk length**: about 1 scene per 45–90 s of speaking. A 10-minute talk is 6–10 scenes.
3. **The 3–7 claims.** One sentence each. If the person cannot state them, help them write the claims first (see narrative.md).
4. **Evidence**: numbers with their **source and date**. Never invent data. Mark illustrative data as illustrative on screen.
5. **Brand**: 2–3 colours (hex), fonts (files, if they may be embedded), a logo (SVG preferred).
6. **Where it will run**: offline file, link, or kiosk loop (autoplay).

## 3. Write the beat sheet before any code

Write it in plain text and show it to the person if they are available. Each scene has **one idea**. Each beat is **one click** with **one headline of 10 words or fewer** and at most one source line.

```
SCENE crowd — "This is not rare"            transition out: dissolve
  b1  "It starts with one person"            one dot, warm        cue: tick
  b2  "One in eight already does this"       zoom out to 17k dots; 1/8 light   cue: swell
      source: Survey of N=17,424, 2026 (or: ILLUSTRATIVE)
  notes: pause on the single dot; the zoom is the argument.
```

Shape: **hook** (a question or image, not an agenda) → **tension** (the problem, made concrete) → **evidence** (the number *in the geometry*: 26 lit bars of 100 for 26%) → **turn** → **payoff** (one line to remember, one action). Rules for honest numbers, motifs and notes are in [references/narrative.md](references/narrative.md).

## 4. Scaffold from the starter

```bash
cp -r <this skill>/starter ./my-talk && cd my-talk
node build.mjs            # -> dist/deck.html (one file)
node build.mjs --watch    # rebuild on save
```

- Put brand colours in `src/scenes/common.js` (`BRAND`). Shader colours are **linear**; use `hexToLinear()`.
- Put fonts in `assets/fonts/display.woff2`, `body.woff2`, `mono.woff2`; the build inlines them as data URIs. Only embed fonts whose licence allows it. Without them, system fonts are used.
- Reference images as `../assets/name.png`; the build inlines them.
- List scenes in order in `src/main.js`. Delete the demo scenes you do not use.

## 5. Write the scenes

A scene is a **pure function of its state** (full contract: [references/engine.md](references/engine.md)):

```js
export default defineScene({
  id: 'bars', title: 'The number', alt: 'One hundred bars; 26 light up.',
  notes: 'Let the bars finish before you speak.',
  transitionOut: { name: 'push' },
  beats: [
    { say: 'We asked one hundred teams', dur: 1.5, cue: 'hit' },
    { say: '26% ship every week', source: 'Survey, 2026', dur: 1.6 },
  ],
  render(ctx, s) { /* WebGL into the HDR target, from s only */ },
  text(ctx, s)   { /* glyphs, drawn after post */ },
});
```

Hard rules:
- **Only `s` drives the picture.** No `Date.now()`, `performance.now()` or `Math.random()` in anything visible. Use `s.t`, `s.p[i]`, `s.k()`, `s.kp()` and the seeded `hash()` / `prng()` from `engine/math.js`, or `hashi()` / `hash12()` in GLSL.
- **Beats are short**: 0.6–1.6 s animation, then a hold. Pacing numbers: [references/beats-and-timing.md](references/beats-and-timing.md).
- **Never freeze a hold**: drift with `s.t`, add pointer parallax with `s.mouse`, multiply motion by `s.motion` (0 in reduced-motion mode).
- **Shade in linear HDR.** Do not tone-map or gamma-correct in the scene; the post pass does that ([references/rendering.md](references/rendering.md)).
- **Text is in the picture**, per glyph, with a scrim in the image for legibility ([references/text.md](references/text.md)).
- **Encode the number in the geometry.** Counters are tabular. Show the source.
- **Large counts are a function of the instance id** (`gl_InstanceID`), not buffers you simulate. Zoom across scale in **log space** (`logMix`).
- **Sound on thresholds**: `s.cue(key, value, threshold, sound)` fires only when you play forward live ([references/audio.md](references/audio.md)).
- **End on the first frame of the next scene**: match colour, position or shape across the cut, or use a transition hook such as `hooks.portal` ([references/transitions.md](references/transitions.md)).

Use [references/scene-recipes.md](references/scene-recipes.md) for 11 tested ideas (bar race, counter, particle field, globe, timeline, quote, before/after, network, terrain, logo reveal, comparison split).

## 6. The screenshot loop: look before you judge

You cannot judge shader work from code. Build, shoot, then **open the PNGs and look at them** with your image tool. Do this after every scene you add or change.

```bash
# Playwright is optional. Install it once outside the project if needed:
#   npm i --prefix ~/.cache/vp-pw playwright && npx --prefix ~/.cache/vp-pw playwright install chromium
export PLAYWRIGHT=~/.cache/vp-pw/node_modules/playwright   # or npm i -D playwright in the project
node build.mjs && node tools/shoot.mjs          # every beat end + every transition at p=0.5
node tools/shoot.mjs --mid                      # also mid-beat frames (catch bad in-betweens)
node tools/shoot.mjs --scene bars               # one scene while iterating
```

Open `shots/contact.png` first, then any full-size frame that looks wrong. Look for:
- black or nearly black frames (the tool also warns), NaN squares, seams (an `atan` seam is a common one: sample noise on `vec2(cos a, sin a)` instead);
- clipped, overlapping or low-contrast text; hard-edged scrim boxes;
- blown-out highlights (lower the emissive value or `grade.exposure`), muddy greys (raise contrast or add a light source);
- a transition at p=0.5 that shows neither scene clearly.

Fix, rebuild, reshoot. **Do at least two visual passes.** Without a GPU, Chromium needs software WebGL: the tools pass `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`. Set `CHROMIUM_PATH` to use a system Chromium.

## 7. Smoke test

```bash
node tools/smoke.mjs
```

It walks every beat forward and back with the keyboard, clicks fast during transitions, tests number keys, overview, help, notes, black screen, mute, the outline, a deep link, `?autoplay`, `?still`, and checks that `seek` gives the same pixels twice. It **fails on any console error**. Do not ship until it prints `SMOKE PASSED`. Also run `window.deck.lint()` (it runs at start): it warns about headlines over 10 words and beats longer than 2.5 s.

## 8. Accessibility

- **Outline export**: `window.deck.outline()` returns a plain HTML outline (scene titles, `alt` descriptions, headlines, sources, notes). Save it next to the deck as `outline.html`, and give it to anyone who uses a screen reader or needs a handout.
- **Reduced motion**: `?still`, or the OS setting `prefers-reduced-motion`, sets `s.motion = 0`, speeds up beats and replaces all transitions with a short crossfade. Check one scene in this mode.
- **Captions and notes**: every beat's `say` and `source` goes to an `aria-live` region. `N` shows notes on screen. `S` opens a speaker window (synced with BroadcastChannel) with notes, the next beat and a timer.
- **Contrast**: headline text must reach 4.5:1 against what is behind it. Use a scrim; do not make the type thinner. Check the PNGs, not the code.
- **No flashing**: never more than 3 flashes per second. No strobing between light and dark.
- Give every scene an `alt` sentence.

## 9. Fallback: no Node or no browser

If you cannot run Node, or cannot run a headless browser to look at screenshots, **do not ship unverified shader work**. Make a **static HTML slides** version instead:

- one `<section>` per beat with the headline and source; keyboard nav (←/→) in about 30 lines of inline JS;
- CSS-only motion: `@keyframes` for rise/fade reveals, `transition` on `transform` and `opacity`, gradients for light, CSS bars (`height: 26%`) for numbers, `@media (prefers-reduced-motion)` to turn motion off;
- the same narrative, notes (`<aside class="notes">`) and sources; still one file, with fonts and images as data URIs.

Tell the person what you skipped (WebGL light, transitions, sound, screenshot check) and how to get the full version (run `node build.mjs` and the tools where Node is available). If you have Node but no browser, you may build the cinematic deck, but say clearly that you could not look at it.

## 10. Ship

- The deliverable is `dist/deck.html`: one file, no external requests. Check: `grep -Eo '(src|href)="https?://' dist/deck.html` must print nothing.
- Also ship `outline.html` (from `deck.outline()`) and, if useful, `contact.png` as a preview.
- Publish with whatever hosting tool you have (a static-site or file-share tool). **Keep it private by default**; make it public only when the person says so. Never put private data in a public deck.
- Tell the person the controls: → / Space / click next, ← back, O overview, N notes, S speaker window, B black, F fullscreen, M sound, ? help. Sound stays off until the first click or key.
- Link options: `#sceneId` opens a scene, `?quick` skips warm-up, `?autoplay` runs hands-free, `?still` reduces motion.

## 11. Final checklist

Run [references/checklist.md](references/checklist.md) completely. In short:

- [ ] The medium is right (not a deck someone must edit).
- [ ] One idea per scene; each headline ≤ 10 words; every number has a source or says ILLUSTRATIVE.
- [ ] Numbers are in the geometry; counters are tabular; units are shown.
- [ ] No `Date.now` / `Math.random` in visuals; `seek` is deterministic (smoke checks this).
- [ ] Two or more visual passes on the contact sheet; no black frames, seams, NaNs or clipped text.
- [ ] `SMOKE PASSED` with zero console errors.
- [ ] Outline exported; reduced motion checked; notes written for every scene.
- [ ] One file, no network; fonts are licensed for embedding; private unless told otherwise.
