# Scene recipes

Each recipe: **idea** (what the audience should feel) → **technique** (how to build it with the starter) → **rule** (what keeps it honest and good-looking). Recipes 1–3 and 5/10 have working versions in `starter/src/scenes/`.

---

### 1. Bar race / encoded share
**Idea**: "26% of teams…" should look like a quarter of something, not a word.
**Technique**: N equal bars drawn with `drawArraysInstanced(TRIANGLES, 0, 6, N)`. Corners come from `gl_VertexID`, data from `gl_InstanceID` (heights from `hashi(i, seed)`, or a small uniform array / data texture for real data). Beat 1 grows them from the centre outward; beat 2 lights bars `i < value` with the accent colour in HDR (they bloom). See `02-bars.js`.
For a race over time: put the values for each period in a float texture (`width = bars`, `height = periods`), sample at `mix(row, row + 1, frac)`, and sort by rank with a smooth move of `y = rank` over 0.4 s.
**Rule**: equal units, zero baseline, accent only on the bars that make up the number; label the unit; the source is on the same beat.

### 2. Counter
**Idea**: a number arriving has weight.
**Technique**: `const v = s.kp(i, 0, 1, E.inOutCubic)`; draw `Math.round(v * target)` with `tabular: true` at 0.16–0.22 size; fire `s.cue('n'+k, v*target, k, 'tick', {deg})` on whole steps (or every 10th step for big numbers); `hit` or `chime` when it lands.
**Rule**: no overshoot easing; format as the final number will be (`1,204`, `$4.2M`) the whole time; animate it together with the geometry it describes.

### 3. Particle field / crowd
**Idea**: scale. One becomes many.
**Technique**: instanced quads; position = f(cell id): grid `(id % cols, id / cols)` + `hashi` jitter, or a sunflower spiral (`r = sqrt(id)`, `a = id * 2.39996`). The camera's half-height moves with `logMix(1.6, 46, zoom)`, so each doubling takes the same time. Highlight a subset by hash (`hashi(id, 9) < 0.125`), with a wave from the centre (`sat((wave*R - dist)/8)`). Give dots a minimum radius in pixels. Dim the others while zoomed in on the one. See `03-crowd.js`.
**Rule**: stateless (no buffers you update, no simulation); "one dot per X" must be true; ≤ 50k quads, or switch to points.

### 4. Globe and arcs
**Idea**: reach, connection, distance.
**Technique**: a full-screen ray–sphere shader: ray from the camera, `t = -b - sqrt(b*b - c)`, normal `n = p/r`, lat/long from `n`; land from a small equirectangular mask texture (inlined PNG) or fbm continents for an abstract globe; fresnel rim `pow(1 - dot(n, v), 3)` in the cool colour; night side dim. Arcs: for each pair, points along the slerp between the two unit vectors, lifted by `1 + h * sin(PI*t)`, drawn as instanced segments; reveal by `t < s.kp(i)`; HDR dot at the head. Rotate the globe as a function of `s.t` and the beat (`yaw = mix(a, b, ease)`), never by accumulating.
**Rule**: real coordinates for real places; no more than 12 arcs on screen; arcs that go behind the globe fade with `dot(n, view)`.

### 5. Timeline
**Idea**: time passes and builds to now.
**Technique**: an HDR line drawn in the background shader (`exp(-abs(c.y - y0) * 260.0)`) up to `mix(x0, x1, progress)`; milestone dots pop with `outBack` as the line passes; labels in mono type at 0.024 under each dot with `reveal.wipe`. Leave the end open to lead into the next scene (a door, a horizon). See `04-portal.js`.
**Rule**: even spacing only if the intervals are even; otherwise space by real time. At most 5 labels.

### 6. Quote card
**Idea**: a person's words, with weight.
**Technique**: a dark, soft background (one wide glow + fbm haze, scrim behind the text); the quote at 0.06–0.07 with `reveal.words` across one beat of 1.4–1.8 s; the attribution as the source line 0.4 s later; a slow push-in (`scale = 1 + 0.03 * s.t * s.motion`) during the hold.
**Rule**: the exact words, ≤ 25 words (the one exception to the 10-word headline rule; give it its own beat), with name, role and date. Get consent for a private quote.

### 7. Before / after
**Idea**: the change is the message.
**Technique**: render both states into private targets (`ctx.target('before')`, `ctx.target('after')`), or in one shader as two functions; a soft vertical split whose position is `s.kp(1)` and whose edge glows (`exp(-abs(x - split) * 80.0)`); labels "BEFORE" / "AFTER" fade with the side they belong to. Optional: the split follows `s.mouse.x` slightly during the hold.
**Rule**: same framing, scale and colour treatment on both sides; the only difference is the change.

### 8. Network graph
**Idea**: things are connected; one node matters.
**Technique**: node positions precomputed in `setup` with a seeded `prng` and a fixed number of relaxation steps (deterministic), stored in a float texture or uniform array; edges as instanced quads between endpoints; beat 1 reveals nodes by BFS distance from the key node (`delay = hops * 0.15`); beat 2 lights the path through the key node in the accent colour.
**Rule**: no live force simulation (not scrubbable); ≤ 200 nodes visible; the highlighted path must be a real path in the data.

### 9. Terrain / height field
**Idea**: a landscape of a quantity (risk, demand, cost).
**Technique**: a grid mesh (instanced quads or one triangle strip from `gl_VertexID`) displaced by `h(x, y)` from data (a texture) or fbm; shade with a normal from finite differences, low sun, fog by depth, contour lines `fract(h * k)` thin and HDR; the camera orbits as a function of beat progress. For a full-screen version, ray-march the height field (32–64 steps, scaled by `s.q`).
**Rule**: if the height is data, label the axis and units; do not exaggerate height without saying "height ×3".

### 10. Logo reveal
**Idea**: the brand, earned at the end (or the start).
**Technique**: inline the logo as an SVG data URI; rasterise it once to a canvas → texture in `setup`; in the shader, reveal by an fbm threshold (`step(noise, p)`) with an HDR edge where `abs(noise - p) < 0.02`, or with light sweeping across (`exp(-abs(dot(uv, dir) - sweep) * 30)`). For a match cut, the previous scene's shape (a circle, a line) moves to where the logo's main shape will be.
**Rule**: logo at its official colours after post (draw it in the text pass, or check the colours in the PNG); at most 25% of frame height; clear space around it.

### 11. Comparison split
**Idea**: A vs B, side by side, one winner.
**Technique**: the frame split in two (or three) columns, each with the same visual (bars, dots, a gauge) driven by its own value; beat 1 shows both at full grey; beat 2 brings the accent to the winning side and dims the other to 40%; the difference as a number between them (`+3.1×`) in a counter.
**Rule**: same scale on both sides (shared max); same units; if the difference is small, say so; never colour both sides with the accent.

---

## Choosing

| You want to show… | Recipe |
|---|---|
| A share, a percentage | 1 (equal units), 3 (one per person) |
| A single big number | 2, with 1 or 3 behind it |
| Growth over time | 1 (race), 5 |
| Scale or reach | 3, 4 |
| Change | 7, 11 |
| Structure, dependencies | 8 |
| A distribution over space | 9, 4 |
| Voice of a person | 6 |
| Brand moment | 10 |
