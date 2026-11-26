# Beats and timing

A **beat** is one click. It plays a small timeline (in seconds), then holds until the next click. A **scene** is 1–5 beats with one idea. Clicks belong to the speaker, so the deck never moves on by itself (except with `?autoplay`).

```js
{ say: 'Headline', delay: 0.1, dur: 1.2, hold: 0.3, cue: 'hit' }
//   delay: wait before the animation starts
//   dur:   the animation (p goes 0 → 1)
//   hold:  extra settle time counted as part of the beat (autoplay waits for it)
```

## Numbers that work

| Thing | Value | Why |
|---|---|---|
| Beat animation (`dur`) | **0.6–1.6 s** | Under 0.5 s reads as a cut; over 2 s the speaker waits for the screen. |
| Big reveal (zoom across scale, portal) | 1.8–2.6 s | Allowed once or twice per talk. Split anything longer. |
| Delay before motion | 0–0.15 s | A small delay after the click feels like a response, not a lag. |
| Hold before autoplay advance | 2–4 s + reading time | Reading time ≈ 0.3 s per word + 1 s. |
| Transition between scenes | 0.8–1.4 s | Back plays it reversed at 60% of the length. |
| Per-glyph stagger, whole line | 40–60% of `dur` spread | `staggered(p, i, n, spread)`; the last glyph starts at `spread`. |
| Per-item stagger (bars, cards) | 15–40 ms per item, total ≤ 0.6 s | Bigger sets: stagger by group, or from the centre outward. |
| Counter climb | Same `dur` as the geometry it describes | The number and the shape arrive together. |
| Text after a picture change | +0.2–0.4 s | The eye goes to motion first; then read. |
| Exit of old text | 0.2–0.35 s, before the new text | Never two headlines in full at once. |
| Scenes per minute of talk | 0.7–1.3 | One idea needs 45–90 s of speech. |
| Beats per scene | 1–5 (2–3 typical) | Six or more means two scenes. |

## Easing

| Motion | Ease | In `math.js` |
|---|---|---|
| Things arriving and settling (text, cards, bars) | fast start, soft stop | `outCubic`, `outQuart`, `outExpo` |
| Camera moves, zooms, morphs between two states | soft both ends | `inOutCubic`, `inOutSine` |
| Things leaving | soft start, fast end | `inQuad`, `inCubic` |
| Pop of a small item (milestone dot) | slight overshoot | `outBack` (use sparingly) |
| Scale changes (1 → 10,000) | linear in **log space** | `logMix(a, b, ease(t))` |
| Data values | `inOutCubic` on the value, never overshoot | A number must not show 27% on its way to 26%. |

Do not use `linear` for anything visible except a progress line or a constant drift.

## Sub-timelines inside a beat

Use `s.k(i, t0, t1, ease)` for seconds and `s.kp(i, a, b, ease)` for fractions:

```js
const grow  = s.k(0, 0.0, 0.9, E.outCubic);    // bars grow first
const label = s.k(0, 0.6, 1.2, E.outCubic);    // labels follow, overlapping
const glow  = s.kp(0, 0.8, 1.0, E.inOutSine);  // last 20%: light comes up
```

Overlap the parts by 30–50%. Do not run them one after another.

## Back, skip and speed

- A click mid-beat makes the rest of the beat run at 4× and then advances. A speaker who clicks twice quickly gets where they meant to go.
- A click during a transition makes it faster (×2 per click, max 6×) and queues one advance.
- Back retracts the current beat in about 0.35 s (no cues fire) and shows the previous beat's final frame.
- Going back across a scene boundary replays the transition reversed and shorter.

Design so every beat's **end frame** is a good still: it is what Back, jump, overview and screenshots show.

## Holds never freeze

Something should always move a little during a hold:
- drift: `sin(s.t * 0.3 + phase) * small` (multiply by `s.motion`);
- noise fields advected by `s.t`;
- parallax from `s.mouse` (0.5–2% of the frame);
- slow light changes (±5% intensity over 4–8 s).

Keep idle motion below the level at which it pulls attention: under about 1% of the frame per second.

## Talk-level rhythm

- Change the energy every 2–3 scenes: big → quiet → big.
- Put the biggest motion on the **payoff**, not on the title.
- The last scene should hold well: slow drift, the one line to remember, and nothing that loops on a cut.
