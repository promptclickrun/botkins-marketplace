# Before you present

Do every item. Write down the ones you could not check and tell the person.

## Story
- [ ] The medium is right: no one needs to edit this in Office (otherwise: pptx skill).
- [ ] Each scene has one idea; the beat sheet reads well aloud in the time slot.
- [ ] Each headline is 10 words or fewer (`deck.lint()` is clean).
- [ ] The opening is a hook, not an agenda; the last scene is one line + one action.
- [ ] Every scene has `notes` and an `alt` sentence.

## Honesty
- [ ] Every number has a source line (who, what, n, year), or ILLUSTRATIVE on screen.
- [ ] The geometry matches the number: equal units, zero baselines, area ∝ value.
- [ ] No overshoot easing on data; counters land on the exact value.
- [ ] Headlines do not claim more than the source.
- [ ] No private data in the deck, the notes or the outline (unless the person asked, and it stays private).

## Picture
- [ ] `node tools/shoot.mjs` (and `--mid`) run, and you **looked at** `shots/contact.png` and every suspicious frame.
- [ ] No black frames, NaN blocks, seams, hard scrim edges or clipped text.
- [ ] Text contrast is about 4.5:1 or better on every beat (check the PNG).
- [ ] Transitions look composed at p=0.5 and clean at 0.02 / 0.98.
- [ ] Nothing important is outside the 16:9 safe frame (try a 4:3 and a 21:9 window).
- [ ] Holds move a little (drift, parallax); nothing freezes; nothing flashes more than 3×/s.
- [ ] It still looks right at quality 0.5 (no 1-px lines that disappear).

## Behaviour
- [ ] `node tools/smoke.mjs` prints `SMOKE PASSED` with zero console errors.
- [ ] Back across every beat and scene works; it is silent.
- [ ] Number keys, O, N, S, B, F, M, ? and Home/End work; the speaker window syncs.
- [ ] `#sceneId`, `?quick`, `?autoplay` and `?still` work.

## Sound
- [ ] Watched once, start to end, with sound on: cues help and are not too many.
- [ ] Volume set for the room; the deck works fine muted.

## Ship
- [ ] One file: `grep -Eo '(src|href)="https?://' dist/deck.html` prints nothing.
- [ ] Fonts are licensed for embedding.
- [ ] `outline.html` exported (`deck.outline()`) and shipped with the deck.
- [ ] Opened from `file://` in the browser that will be used on the day, on the actual machine if possible, at the projector's resolution.
- [ ] Shared privately unless the person said public.

## On the day
- [ ] Laptop on power; notifications off; display sleep off; the browser in fullscreen (F).
- [ ] Load the deck 5 minutes early so warm-up is done; leave it on the title.
- [ ] Click once to enable sound (then Home) if you use sound.
- [ ] A backup: the same file on a USB stick, plus `contact.png` / `outline.html` in case WebGL fails.
