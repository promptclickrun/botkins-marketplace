# Narrative: what the film says

A cinematic deck makes a weak argument look expensive and still weak. Write the story first, in text, and build only after it holds up.

## Start from the claims

Ask for the 3–7 claims the audience must remember. Each one is one sentence with a verb, and true:

- Bad: "Deployment frequency" (a topic)
- Good: "Teams that ship weekly recover from incidents faster" (a claim)

If the person gives topics, rewrite them as claims and confirm. If a claim has no evidence, it is an opinion: label it as one, or cut it.

## Structure

One scene = one idea. Use this shape and adapt it:

| Part | Scenes | Job | Example |
|---|---|---|---|
| **Hook** | 1 | A question, an image or one surprising number. **Not** an agenda or "About me". | One dot: "It starts with one person." |
| **Tension** | 1–2 | The problem, made concrete and felt. A cost, a person, a time. | "Every release waits 19 days." |
| **Evidence** | 2–4 | The claims, each with its number in the geometry. | 26 of 100 bars light up. |
| **Turn** | 1 | What changes it: the idea, product, decision. Often the biggest transition. | Through the portal. |
| **Payoff** | 1 | One line to remember + one action. Holds while you take questions. | "Make the room feel it." |

For a 3-minute trailer: hook → 3 evidence beats → payoff. For a 20-minute keynote: repeat tension → evidence two or three times, each one larger, with one quiet scene between.

## The beat sheet

Write it before code. Format:

```
SCENE <id> — "<the idea in a few words>"         transition out: <name> (why)
  b1  "<headline ≤10 words>"     <what the picture does>     cue: <sound>
  b2  "<headline>"               <picture>                   cue: <sound>
      source: <who, what, n, year> | ILLUSTRATIVE
  notes: <what the speaker says or does; 1–3 sentences>
  alt: <one sentence describing the picture, for the outline>
```

Read it aloud with a timer. If a scene takes longer than 90 s to talk over, split it.

## Motifs

Choose **one visual motif** and carry it through, changing its meaning:

- a dot (one person → a crowd → a network),
- a line (a timeline → a road → a horizon),
- a light (a spark → a sunrise → a portal).

Choose **one colour pair**: a warm accent for "the thing that matters" (the 26 bars, the one person), a cool base for everything else. Never use the accent for decoration.

Use **match cuts**: end a scene on a shape that becomes the start of the next (the portal ring becomes the frame).

## Honesty rules (not optional)

1. **No invented data.** If you do not have the number, say so and use a placeholder clearly marked ILLUSTRATIVE on screen and in the notes.
2. **Every number has a source line** on the same beat: who, what, sample size, year. Put the full reference in the notes.
3. **The geometry must be true to the number.** 26% = 26 of 100 equal units. Bars start at zero. Areas scale with the value (radius ∝ √value). Log scales are labelled "log scale".
4. **No cherry-picked axes or time windows.** If you crop, say what you cropped.
5. **Do not animate a value past its true value** (no overshoot easing on data).
6. **Separate data from illustration.** A crowd of dots "one per respondent" must have one dot per respondent, or say "each dot = 10 people".
7. **Correlation is not causation.** The headline must not claim more than the source.
8. Uncertainty is part of the number: show ranges when the source gives them (a soft band, not a hard bar).

## Speaker notes

Every scene has `notes`. Write them for a nervous speaker, not as a script:

- What to say first, in a few words.
- When to click ("after the bars settle").
- Where to pause and look at the room.
- The full source reference.
- A fallback line if the demo or video fails.

Notes appear with `N` and in the speaker window (`S`), together with the next beat's headline and a timer.

## Titles and endings

- The title is a promise, not a topic: "Every presentation is a film", not "Presentation Techniques Q3".
- The last scene is the one line to remember + one concrete action (a link, a date, a decision). It should hold for minutes: slow drift, no loops, nothing that looks broken if left up.
- No "Thank you / Questions?" scene. The payoff scene is the question slide.
