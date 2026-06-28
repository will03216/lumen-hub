# Continuity & Editing — making separate generations feel like one film

Seedance generates clips; the audience watches a film. This file covers the
glue: continuity across calls, editorial grammar inside calls, and what must
be planned for post.

---

## The continuity ledger

For any multi-clip project, maintain a small table and consult it before
every call:

| Field | Track |
|-------|-------|
| Characters | card refs + identity block (verbatim) + wardrobe state + damage/dirt progression |
| Props | what each character carries, in which hand |
| Time of day / weather | and the direction it evolves |
| Location anchors | 1–2 named background elements that recur |
| Lighting contract | the named lighting setup, reused verbatim |
| Color grade | the named grade, reused verbatim |
| Color motifs | which color is bound to which character/idea ([`color-design.md`](color-design.md)) |
| Visual motifs | recurring objects/shapes and where they must reappear ([`visual-language.md`](visual-language.md)) |
| World state | location's drift over the story — clutter, decay, damage ([`production-design.md`](production-design.md)) |
| Screen direction | who travels which way; who is frame-left / frame-right |

## The shared preamble — cheapest continuity tool

Write the technical contract once (film stock, lens, grade, lighting,
atmosphere) and paste it **verbatim** into every call of the project.
Paraphrasing the preamble between calls is self-inflicted drift.

## The 180° axis rule

In any dialogue, confrontation, or chase: pick a line between the two
subjects and keep the camera on one side of it.

- Practically: **A stays frame-left, B stays frame-right, in every shot** —
  and say so in the prompt: *"the courier stays frame-left, the broker
  frame-right throughout."*
- **Eyelines**: when a character looks at someone off-screen, the gaze must
  point toward where that person last was (A looks frame-right at B).
- Breaking the axis without a shown camera move reads as teleportation.

## Screen direction

A subject traveling left→right keeps traveling left→right across cuts until a
turn is shown on screen. In a chase, pursuer and pursued move the same
direction. State it: *"she runs frame-left to frame-right in every shot."*

## First/last-frame chaining (long-form)

To make clip N+1 continue seamlessly from clip N:

1. Extract the final frame:
   `ffmpeg -sseof -0.1 -i clipN.mp4 -frames:v 1 -q:v 2 lastframe.png`
2. Pass it as the **first** image of the next call **without a tag** —
   a single untagged image is treated as the literal first frame
   (see [`prompt-guidance.md`](prompt-guidance.md) reference indexing).
3. The prompt then describes **only what changes** — motion, camera, light
   evolution. Do not restate the frame's content.
4. If the frame contains a human face, it still needs `asset://` upload
   ([`assets.md`](assets.md)).
5. Start the new clip from a **settled pose**: motion momentum does not carry
   across calls, so don't chain out of mid-air or mid-swing — chain at the
   completed beat.

## Cut grammar (inside one call, with `Shot N:` labels)

- **Cut on action / match-on-action** — end each shot's sentence on the
  *completed* beat; let the next shot open the new one. To bridge a cut
  smoothly, start a movement in one shot and complete it in the next:
  *"Shot 1: her hand reaches for the door. Shot 2 (closer): the hand closes on
  the handle."* Cutting mid-action with no match produces smeared cuts.
- **30° rule** — when cutting to the same subject, change the angle by at
  least ~30° (or change shot size), or it reads as a jump cut: *"Shot 2 — same
  subject, swing to a 3/4 front angle, tighter."*
- **Match cut / graphic match** — write the visual rhyme explicitly: *"Shot 2
  opens on a ceiling fan whose blades echo the helicopter rotors from Shot 1."*
- **J-cut (sound leads picture)** — the next shot's sound starts *before* we
  cut: *"…we already hear party laughter; Shot 2: the party."* Great for pulling
  the viewer forward.
- **L-cut (sound lingers)** — the current shot's sound continues *over* the new
  picture: *"their argument keeps ringing over Shot 2's empty hallway,"* leaving
  the space haunted. (Pre-lap is the J-cut; the lingering hold is the L-cut.)
- **Whip-pan transition** — costs ~0.5s; use at most once per call.
- **The oner** — for an unbroken take, declare it: *"single continuous take,
  no cuts"* — otherwise a long action description may get auto-cut.

## Montage & juxtaposition (meaning from the cut, not the shot)

Meaning can come from *what you cut against*, not from any single shot:

- **Kuleshov effect** — hold a face **neutral and unreadable**; let the cutaway
  assign the emotion. *"Shot 1: her blank face. Shot 2: an eviction notice."*
  vs. the same face cut against a winning lottery ticket — the audience writes
  the feeling. Direct restrained faces and let the inserts do the work, rather
  than over-acting every close-up.
- **Montage types** (sequence-level intent): *metric/rhythmic* (cut on fixed
  lengths or movement, e.g. half-second shards synced to a heartbeat), *tonal*
  (juxtapose for mood), *intellectual* (juxtapose two ideas — exhausted workers
  intercut with penned cattle → dehumanization). State the pattern: *"A-B-A-B-C:
  worker, machine, worker, machine, the accident."*

Because Seedance generates per-call, true montage usually means **several
short calls assembled in post** — design the juxtaposition in the shot list
([`narrative-design.md`](narrative-design.md)).

## Pacing curve (shot length as tension)

Average shot length is an emotional dial: shorter = urgency/energy, longer =
contemplation/discomfort. Plan a curve across the sequence rather than a flat
rhythm:

- *"Open on slow, meditative 6–8s holds; steadily shorten toward 1–2s shots by
  the climax for breathless urgency."*
- *"As voices rise, cut faster — trim each reaction to a half-beat so it feels
  jagged."*
- *"After the revelation, one uncomfortably long 10s static close-up traps the
  viewer in her shame."*

Map this onto per-shot durations in [`duration-calculus.md`](duration-calculus.md)
and onto the emotional-intensity curve in
[`narrative-design.md`](narrative-design.md) — pacing and intensity should
peak together.

## Coverage thinking (edit safety)

For hero beats, generate options like a director shoots them:

- a **master** (wide/medium covering the whole beat) *and* a **closer
  alternative** (MCU on the key moment) — two cheap calls beat one
  unusable one;
- **insert shots** for story-critical objects (1.5–2.5s, locked, shallow
  focus) — they hide continuity errors in the edit;
- dialogue: **shot-reverse-shot** pairs with the axis held (see
  [`shot-design.md`](shot-design.md) dialogue coverage patterns).

## What does NOT carry across calls — plan for post

| Doesn't carry | Plan |
|---------------|------|
| Music / score | Generate per-call sound effects only; lay the unifying music bed in post (see [`audio.md`](audio.md)) |
| Exact color grade | Keep the grade contract in every prompt; do the final match in post |
| Motion momentum | Chain at settled poses |
| Voice timbre between clips | Keep dialogue for a given character inside one call where possible; otherwise plan ADR/dub in post |
