# Notice

The `visual-presentation` skill (this folder: `SKILL.md`, `references/`, `starter/` and `preview.png`) is original work written for the Botkins marketplace. It is released under the MIT License in the repository root `LICENSE`.

The text and code were written from scratch. They follow presentation and real-time rendering techniques that are publicly described in many places, such as beat-based pacing, pure-function scene state, linear-HDR shading with filmic tone mapping, instanced stateless crowds, glyph atlases, two-target shader transitions and WebAudio synthesis. No third-party code, text or assets are included.

The tone-mapping curve in `starter/src/engine/post.js` is a widely published polynomial fit of the ACES filmic curve. The noise and hash functions are standard constructions.

The demo deck uses illustrative data only. Fonts are not bundled; the deck uses system fonts unless you add font files whose licence allows embedding.
