# Sound

Sound is synthesized with WebAudio in `engine/audio.js`. There are no audio files, so the deck stays small and every sound is in key.

## Rules

1. **One root note for the whole talk.** `createAudio({ root: 110 })` (A2). Every sound picks degrees from one minor-pentatonic scale on that root, so any two cues sound good together. Change the root to change the mood; do not mix roots.
2. **Cues fire on threshold crossings, never on timers.** `s.cue(key, value, threshold, sound, opts)` plays when `value` goes from below to at/above `threshold` between two live frames. No `setTimeout`, no "play at 0.4 s". So:
   - scrubbing, seeking, warm-up, screenshots and thumbnails are silent;
   - going **back** never plays sounds (beat retraction is silent);
   - a jump or the first frame of a scene only *primes* cues; they do not fire.
3. **Muted until the first gesture.** Browsers block audio before a click or key. The audio context is created on the first pointer or key event. `M` toggles mute. The HUD shows the state.
4. **Sound supports the picture; it is never the point.** Volume about −18 dB below speech. If the speaker uses a microphone, test the level in the room.
5. Never more than about 3 cues per second, except a deliberate run (a counter).

## Built-in sounds

| Name | What | Use |
|---|---|---|
| `swell` | Soft triangle chord, slow attack, 2.4 s | Titles, big reveals, the start of a zoom |
| `tick` | Short high sine; `opts.deg` picks a scale degree | Counters, items appearing; climb `deg` as the count rises |
| `hit` | Low sine thump + filtered noise click | A number lands, a statement |
| `chime` | Three-note bell arpeggio | Payoff, completion |
| `whoosh` | Band-passed noise sweep up | Transitions (default sound of each transition) |

Add your own: `audio.define('name', (opts) => { ... })` using `audio.note(degree, octave)` to stay in key.

## Two ways to cue

**Per beat** (simplest): the sound plays when the beat's clock passes `at` seconds.

```js
beats: [
  { say: 'We asked one hundred teams', dur: 1.5, cue: 'hit' },                 // at its delay
  { say: '26% ship every week', dur: 1.6, cue: { sound: 'chime', at: 1.4 } },  // near the end
]
```

**Inside render** (for things tied to the picture):

```js
const lit = s.kp(1, 0, 1, E.inOutCubic);
for (let k = 1; k <= 26; k++) s.cue('bar' + k, lit * 26, k, 'tick', { deg: Math.floor(k / 3) });
s.cue('land', lit, 1, 'chime');
```

Each `key` must be unique in the scene. The cue stores the previous value per key, so it works at any frame rate and fires once per crossing.

## Transitions

Each transition plays its `sound` (default `whoosh`, length matched to `dur`) when it starts forward. Set `sound: null` for a silent transition. Reversed transitions are silent.

## Checks

- Watch the deck once with sound on, from start to end, at real speed. Count the cues: if you notice the sound more than the picture, remove half.
- Press Back several times: there must be no sound.
- Load with `?autoplay`: sound still needs one click; after that it plays.
