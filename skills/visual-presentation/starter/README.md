# Cinematic deck starter

A dependency-free WebGL2 deck engine: scenes made of beats, HDR post, per-glyph text, shader transitions, synthesized sound and presenter controls. It builds into **one** self-contained HTML file.

```bash
node build.mjs            # -> dist/deck.html  (Node >= 20, no npm install needed)
node build.mjs --watch
```

Open `dist/deck.html` in Chrome, Edge, Firefox or Safari. Press `?` for the controls.

## Layout

```
src/engine/       gl, math, glsl prelude, post, text, scene, transitions, audio, deck, ui
src/scenes/       01-title 02-bars 03-crowd 04-portal 05-close, common.js (brand + helpers)
src/transitions/  crossfade portal push wipe dissolve zoom
src/main.js       scene order, audio root note
src/index.html    shell: canvas, loader, chrome CSS
assets/           inlined as data URIs (fonts/display.woff2, body.woff2, mono.woff2 are optional)
tools/            shoot.mjs (screenshots + contact sheet), smoke.mjs (end-to-end test)
```

## Test tools (Playwright, optional)

```bash
npm i -D playwright && npx playwright install chromium      # or install it elsewhere and:
export PLAYWRIGHT=/path/to/node_modules/playwright
node tools/shoot.mjs [--mid] [--scene id] [--size 1920x1080]   # -> shots/*.png, shots/contact.png
node tools/smoke.mjs                                          # forward/back, UI, deep links, determinism
```

Headless Chromium uses software WebGL (`--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`). Set `CHROMIUM_PATH` to use a system browser, and `DECK` to test another built file.

## The bundler

`build.mjs` wraps each ES module in a function scope and runs them in dependency order inside one classic `<script>`, so the file works from `file://`. It supports `import x from`, `import { a as b } from`, `import './x.js'`, `export const|let|function|class`, `export default` and `export { a as b }`, one statement per line. Asset paths of the form `../assets/name.ext` are inlined as data URIs.

See `../SKILL.md` and `../references/` for how to write scenes.
