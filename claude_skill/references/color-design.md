# Color Design — color is narrative, not a grade name

Naming a grade ("teal-orange", "muted") is the floor. A director designs color
as a *system*: a palette that carries emotion, separates worlds, tracks a
character, and shifts across the story. This file turns that craft into prompt
language.

Seedance has **no numeric color knob** — color is steered entirely by
language and by reference images (assign a reference the palette role, see
[`prompt-guidance.md`](prompt-guidance.md) reference roles). So the words have
to do the work.

---

## 1. Palette relationships (color theory as conflict/harmony)

Pick one palette logic per scene and state it:

| Palette | Feeling | Prompt phrasing |
|---------|---------|-----------------|
| **Complementary** (orange/teal, red/green, blue/amber) | tension, figure-ground separation, character-vs-world | `warm skin tones against cool blue city light — orange/teal complementary split` |
| **Analogous** (blues→cyans→greens) | unified, dreamlike, numb, submerged | `strictly analogous deep-blue to cyan, no warm tones, emotionally submerged` |
| **Monochrome + 1 accent** | isolation with a single emotional charge | `desaturated graphite world, one crimson object as the only saturated color` |
| **Warm-dominant** | intimacy, nostalgia, safety | `warm tungsten interior, amber practicals, soft warm shadows` |
| **Cool-dominant** | distance, dread, clinical | `cool overcast daylight, blue shadow fill, neutral-to-cold skin` |

## 2. Color script (palette arc across beats)

A **color script** plans how the palette evolves shot-to-shot to track the
emotional line — borrowed from animation prep. Plan it in the shot list
([`narrative-design.md`](narrative-design.md)), then write each shot's stage
into its preamble or per-shot line.

Common arcs:

- **Warm → cool** = hope → alienation, togetherness → separation
- **Saturated → desaturated** = innocence → trauma (drain a little each beat)
- **Desaturated → one color bleeding in** = numbness → a feeling returning

Prompt phrasing (multi-shot):

> Color script across the sequence: Shot 1 in tender low-contrast pastels;
> Shot 2 saturation drops, cool blue creeping into the shadows; Shot 3 muted
> earthy aftermath tones, almost colorless.

## 3. Color as character / motif

Bind a color to a person, force, or idea and repeat it. The repetition is the
meaning.

> Red is the protagonist's motif: every key beat hides one small dominant red
> object tied to her desire — a mug, a sign, a taillight.

> The antagonist is encoded green: wherever his influence reaches, green light,
> green reflections, or green props leak into the frame.

Keep it **subtle and consistent** — one planted object per shot, not a green
wash. Track which color belongs to whom in the continuity ledger
([`continuity-and-editing.md`](continuity-and-editing.md)).

## 4. Color temperature arc (within or across shots)

Temperature codes warmth-vs-distance, past-vs-present, subjective-vs-objective.

- Within a shot: `opens in warm 3200K tungsten intimacy, slides toward cold
  5600K daylight as they pull apart` (pair with a slow light change, not a cut).
- Across a film: `flashbacks warm, hazy, golden with soft blacks; present day
  cool, hard-edged, neutral` — a clean way to mark timelines.

## 5. Motivated color

Ground every color in a plausible source — it reads as real, not graded-on:
`green from the exit sign overhead`, `amber from the sodium streetlight`,
`magenta from the bar's neon`. Unmotivated color washes look like an Instagram
filter. (See lighting motivation in [`shot-design.md`](shot-design.md).)

## Cross-shot consistency

Color is a top continuity failure. In a multi-clip project, repeat the
**named grade + light direction + time of day** verbatim in every call's
preamble — exact grade matching is finished in post
([`continuity-and-editing.md`](continuity-and-editing.md)). Inconsistent color
across shots almost always means the grade contract wasn't pasted verbatim.

## Failure repairs

| Symptom | Repair |
|---------|--------|
| Flat, washed image | add a motivated key + rim separation + one material highlight |
| Overprocessed / Instagram look | cut style-words, specify natural contrast + neutral skin |
| Color drifts across shots | repeat grade + light direction + palette in every shot |
| Accent color lost | make the accent object larger / closer / better-lit, isolate it against a desaturated field |

## Avoid

LUT names as magic words with no described result (`bleach bypass` alone) ·
impossible stacks (`HDR + 16mm + neon + pastel` in one shot) · `cinematic
color` · more than one palette logic per scene.
