# Duration Calculus — compute the duration, never guess it

`duration` is an integer 4–15 passed to `seedance_generate` (MCP) /
`seedance generate --duration N` (CLI). Picking it by
feel is a top-3 silent failure mode:

- **Too short** → actions compressed or skipped, dialogue truncated mid-word,
  camera moves too fast to read.
- **Too long** → the model invents filler: aimless drift, zombie walking,
  camera wander, repeated gestures.

The fix is a rule algorithm: score each shot by its content, sum, clamp.

---

## Per-dimension rates

### Dialogue (words → seconds)

| Language | Delivery | Rate |
|----------|----------|------|
| English | conversational | 2.5 words/sec |
| English | dramatic / weighted | 2.0 words/sec |
| Chinese | conversational | 4 chars/sec |
| Chinese | dramatic / weighted | 3 chars/sec |
| Bahasa / Spanish / similar | conversational | 2.3 words/sec |

```
speech_seconds = word_count / rate + 0.5s lead-in + ≥1.0s reaction tail
```

The reaction tail is non-negotiable: a shot that cuts on the last syllable
reads amateur. The camera holds on the speaker (or cuts to the listener) for
at least one beat after the line ends.

### Action (beats → seconds) — applies to ANY subject doing something

A **beat** is one complete physical event. Combat: a strike, parry, dodge,
throw, landing, grab. But this is **not just for fights** — it covers every
subject that *performs* rather than poses: a barista pouring milk and the
pattern blooming, a wok tossing noodles over flame, a cat waking → stretching →
settling, a machine dispensing espresso, a flower opening. Each distinct
physical change is a beat.

| Rule | Value |
|------|-------|
| One beat | 0.8–1.5s (use 1.2s as planning value) |
| Max beats per shot | 3 (4 only with a reference video driving timing) |
| Shot entry (wind-up / close distance / settle into action) | +0.5–1s |
| Punchy fight shot total | 2–4s — short shots hit harder |

```
action_shot_seconds = beats × 1.2 + 0.5 entry
```

> **The action-is-the-subject rule.** When the user's subject IS a process
> (latte *art*, *stir*-fry, a *stretch*, *brewing*), the action beats are the
> point of the shot — budget them explicitly. A pour that blooms into a finished
> pattern is ≈3 beats (stream lands → swirls form → lifts away ≈ 3.5s), NOT a
> 4s "camera-minimum" product hold. Pricing it as a static hero shot is the
> single most common way this skill under-serves dynamic subjects — see the
> Action component note in [`prompt-guidance.md`](prompt-guidance.md).

### Performance / micro-expression

| Content | Seconds |
|---------|---------|
| Single expression transition (state A → trigger → state B) | 3–5s |
| Two-stage emotional turn | 5–7s |
| Reaction insert (listener's face) | 1.5–2.5s |

See [`performance-direction.md`](performance-direction.md) — never stack three
emotions into 4 seconds.

### Camera-led minimums

A camera move that runs shorter than its minimum reads as jitter, not as a move.

| Move | Minimum |
|------|---------|
| Slow push-in / pull-out (perceptible) | 4s |
| Orbit 90° | 4–6s |
| Orbit 180° | 7–10s |
| Full 360° orbit | 8–12s — avoid inside one shot |
| Crane / aerial reveal | 5–8s |
| Tracking follow (establish gait) | ≥4s |
| Whip pan (as transition) | 0.5s |

### Holds

| Content | Seconds |
|---------|---------|
| Logo / product label / text hold | ≥2s |
| Establishing wide | 3–5s |
| Final-frame emotional hold | 1–2s |

---

## The algorithm

1. **Decompose** the idea into shots (see [`narrative-design.md`](narrative-design.md)).
2. **Score each shot**: `shot_seconds = max(action_budget, dialogue_need, performance_need, camera_minimum)`.
   - Compute EVERY dimension the shot contains, then take the max — never let
     one dimension (usually dialogue or camera-minimum) silently set the
     duration while the subject's action goes unbudgeted.
   - **Sequential loads sum, simultaneous loads max.** Talking *while* doing
     overlaps → max. But action *then* talk (wok tossing, then camera moves to
     the vendor who speaks) is sequential → sum the cooking beats + the dialogue
     need. A dialogue-only budget for an action-then-talk shot starves the
     action — this is the 烟火气/"where did the cooking go" failure.
3. **Sum** the shots. Cuts cost 0s; in-camera transitions (whip pan) add 0.5s.
4. **Round up** to an integer. `duration=` is ALWAYS a concrete integer — even
   when matching a reference video's rhythm, estimate that clip's length and
   commit to a number. Never emit a placeholder or a description
   (`"match_[video1]_length"`) as the duration; the API needs an int.
5. **Clamp to 4–15:**
   - Total < 4 → pad with entry hold or reaction tail. Never pad with new action.
   - Total > 15 → **split into multiple calls** at scene boundaries and chain
     via first/last-frame (see [`continuity-and-editing.md`](continuity-and-editing.md)).
6. **Shot-count sanity check** (the shot budget): a healthy call averages
   4–6s per shot. Two shots want ≥10s total; three shots want 12–15s.
   **Four or more shots in one call → split the call.** If you ask for four
   shots in 10s the model compresses or skips beats.

Report the computed duration to the user alongside the optimized prompt
("3 shots → 13s") so the math is auditable.

---

## Worked examples

**Dialogue beat.** Line: "We leave at dawn. No one follows." — 7 words,
dramatic delivery. `7 / 2.0 = 3.5s + 0.5 lead-in + 1.0 tail ≈ 5s`. One locked
MCU shot, `duration=5`.

**Two-shot fight.** Shot 1: charge + strike + parry = 3 beats × 1.2 + 0.5 ≈
4.5s. Shot 2: counter + takedown = 2 beats × 1.2 + 1s settle hold ≈ 3.5s.
Sum = 8s, but two shots want ≥10s → extend Shot 1 entry to a 2s wide
establishing of the standoff. `duration=10`.

**Three-shot product (commercial pattern).** Shot 1: ECU condensation rolling
down the bottle, 3s. Shot 2: bottle rises from ice, tilt up, 4s (camera
minimum). Shot 3: hand grabs it against sunset rooftop + label hold 2s = 5s.
Total 12s, 3 shots → fits. `duration=12`.

**20-word monologue.** `20 / 2.5 = 8s + 1.5 ≈ 10s`, single locked MCU,
`duration=10`.

**45-word pitch.** `45 / 2.5 = 18s + tails > 15s` → split into two calls at the
paragraph turn, chain with last-frame → first-frame, unify music in post.

---

## Anti-patterns

| Mistake | What you get |
|---------|--------------|
| 20 words of dialogue in `duration=4` | Truncated line or chipmunk lips |
| 4 shots in 10s | Skipped or compressed beats |
| Slow push-in in a 2s window | Imperceptible move or jitter |
| `duration=15` for "he walks down the street" | 10s of invented filler drift |
| Cutting exactly on the last syllable | No reaction beat — amateur rhythm |
| Budgeting an action subject by camera-minimum only | Static product hold — the pour/stir/stretch never happens |
| Budgeting an action-then-talk shot by dialogue only | The action (cooking, etc.) is skipped or shoved to the background |
