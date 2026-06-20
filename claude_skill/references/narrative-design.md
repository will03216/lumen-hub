# Narrative Design — from idea to shot list

Use this file when the request is bigger than one shot: a story, a commercial,
an episode, a montage. It turns intent into a shot list that
[`duration-calculus.md`](duration-calculus.md) can price and
[`prompt-guidance.md`](prompt-guidance.md) can compile.

---

## The micro-story rule

**Every clip must show a visible change**: state A → trigger → state B.
If nothing observable changes between the first and last frame, you generated
a screensaver, not a shot.

Beat formula for a single clip:

```
ESTABLISH (who/where) → DISRUPT (the trigger lands) → CHANGE (new state, visible)
```

Map those three to shots — often 1:1 for a three-shot call.

## Treatment → shot list pipeline

1. **Logline** — one sentence: who wants what, what stands in the way.
2. **Beat sheet** — 3–7 beats, each one visible change. If a beat's change
   can't be photographed, rewrite the beat.
3. **Shot list** — the director's core artifact:

| # | Size | Move | Action / dialogue | Performance cue | Sound | Dur | Refs |
|---|------|------|-------------------|-----------------|-------|-----|------|
| 1 | Wide | slow push | courier enters the vault | posture wary | hum, footsteps | 4s | [image1] |
| 2 | CU | locked | "It's already gone." | jaw tightens after the line | line, room tone | 4s | [image1] |
| 3 | ECU | locked | empty case revealed | — | single latch click | 3s | — |

   - **Dur** comes from [`duration-calculus.md`](duration-calculus.md), never from feel.
   - **Performance cue** comes from [`performance-direction.md`](performance-direction.md).
   - **Refs** point at character cards ([`character-card.md`](character-card.md)).
4. **Group shots into calls** — 2–3 shots per call, ≤15s, split at scene
   boundaries (location/time jumps), never mid-scene.
5. **Chain the calls** — shared preamble + first/last-frame chaining +
   continuity ledger: [`continuity-and-editing.md`](continuity-and-editing.md).

Show the user the shot list **before** generating. Fixing a shot list costs
nothing; fixing generated clips costs money and hours.

> Structure here is the story *shape*. The matching genre *visual look*
> (lighting, camera, color, staging conventions) lives in
> [`genre-grammar.md`](genre-grammar.md); plan a color script across the beats
> with [`color-design.md`](color-design.md); plant motifs and POV via
> [`visual-language.md`](visual-language.md).

## Genre macro-structures

| Genre | Structure |
|-------|-----------|
| **Commercial 15s** | HOOK (product or conflict inside 0–3s) → TRANSFORM (demo/benefit) → PAYOFF (brand/label hold ≥2s). First frame must work as a thumbnail. |
| **Trailer** | Shot lengths shrink as it builds (4s → 2s → 1s), hard silence before the title card, one button shot after. |
| **Music video** | Verse = locked or minimal moves; chorus = the camera move escalates (push → orbit). Cuts land on the grid (see [`audio.md`](audio.md)). |
| **UGC / talking head** | Hook line inside 2s, single speaker, locked framing, native-language delivery. |
| **Episode / 漫剧** | Cold-open recall (1 shot) → two scene beats → cliffhanger final frame worth screenshotting. |

## Scene design

- Each scene = **one want + one obstacle**. Write the obstacle into the
  prompt — what resists is what creates drama ("she reaches for the handle;
  it doesn't turn").
- Across a multi-call project, sketch the **emotional intensity curve**
  (rate each clip 1–5). Flat lines bore; place the peak around two-thirds in,
  and put a quiet beat directly before it so the peak lands.

## When the user brings prose (novel, script, brief)

Compress to beats — never transcribe prose into the prompt. The prompt
carries what the camera sees and hears, nothing else. Inner monologue must be
converted to visible behavior ([`performance-direction.md`](performance-direction.md))
or cut.
