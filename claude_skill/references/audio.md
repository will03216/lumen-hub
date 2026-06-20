# Audio

Use this file for sound design, dialogue, lip-sync, beat-sync, and audio
failure diagnosis.

## Scope

This guidance is for Seedance video generation, not the separate Jimeng
digital-human workflow.

## The four-layer model

Professional sound is designed in layers. Decide each layer per shot — even
if the decision is silence:

| Layer | Examples | Prompt handling |
|-------|----------|-----------------|
| **Dialogue** | quoted lines | inside the speaker's shot, short, verbatim |
| **Ambience** | room tone, rain, city hum, wind | always name one — dead silence reads as broken audio |
| **SFX / foley** | latch click, armor creak, footsteps, blade impact | anchor 1–2 per shot to on-screen events |
| **Music** | score, source music | describe by tempo + instrumentation + mood, never by artist/song (see [`safety.md`](safety.md)): `sparse piano, slow, unresolved` |

In multi-shot prompts, give **each `Shot N:` its own sound cue** — per-shot
sounds anchor the audio pass to the picture.

**Silence is a tool**: an explicit `no music, room tone only` before a loud
beat makes the beat land harder.

### Diegesis & perspective (film-school sound)

- **Diegetic** sound lives in the world (a radio in the room, street noise);
  **non-diegetic** sits outside it (score). Naming which is which sharpens
  point of view: *"diegetic radio music in the room gradually swells into full
  non-diegetic score,"* blurring world and feeling.
- **Sound perspective** — close/distant, clear/muffled — codes subjectivity.
  For dissociation or shock: *"all ambient sound muffles to a low hum; isolate
  one tiny foley — a dripping tap — with unnatural reverb."* For intimacy amid
  chaos: *"street noise drops distant and muffled; her breath stays close and
  present."*

**Music does not carry across calls.** Multi-clip projects get per-clip
ambience/SFX from Seedance and one unifying music bed in post — see
[`continuity-and-editing.md`](continuity-and-editing.md).

## When to set `generate_audio=True`

The boolean is a separate decision from the prose — describing ambience does
nothing if `generate_audio=False`. Default the flag **on** for any scene with a
living or active sound source, even with no dialogue:

- animals (a cat's stretch-yawn, birds), nature (wind, water, rain), crowds &
  markets (chatter, sizzle), mechanical/process sound (espresso hiss, wok roar,
  engine), foley-rich action.
- Naming the ambient/SFX layer above without enabling audio ships a silent clip
  where the brief implied sound — the "no_skill had the cat's meow / market
  hum and we didn't" failure.

Leave it **off** only for deliberately silent pieces (a pure product hero on
seamless, an abstract/graphic style) or when the user asks for no sound. When
unsure and the scene is alive, prefer on.

> **A music bed is not enough — name the DIEGETIC layer.** Turning the flag on
> and writing only "soft piano score" wastes it: the scene sounds like a stock
> music video, not a place. Whenever audio is on, specify the concrete diegetic
> sound the action would actually make, matched beat-for-beat:
> - a person walking → **footstep foley** in step with the gait
> - a park / forest / outdoors → **birdsong, breeze, leaf rustle** (not just score)
> - an animal → its **vocalization** (a cat's meow, not just a rumble)
> - a process (pour, fry, engine, espresso) → its **working sound**
>
> Pattern: *diegetic foley/ambience first, optional music bed under it.* The
> "no_skill clip felt alive and ours felt like a screensaver with music" losses
> all trace to naming music but not the foley the picture demanded.
>
> **Hard rule — moving subject ⇒ movement foley.** If the subject walks, runs,
> steps, or rolls on screen, the prompt MUST name the matching foley (footsteps
> in step, wheels on ground) when audio is on. A walk scored with only music and
> no footsteps reads as a silent mannequin gliding — a recurring loss against
> no_skill. This is not optional polish; it is part of completing the audio.
>
> ⚠️ **Music-led genres are NOT exempt.** Fashion lookbooks, MVs, and montages
> default to a music bed — but foley and music are not mutually exclusive. Layer
> the diegetic foley UNDERNEATH the music: *"downtempo bed with soft heel-clicks
> in step underneath."* "It's a fashion film, so music only" is the exact instinct
> that loses the footstep — keep the bed AND add the footfalls.

## Default rule

If exact audio playback is not required, describe sound in natural language:

- `soft room tone and distant rain`
- `low electronic pulse under the scene`
- `brief metallic impact when the blade lands`

Use `[audio1]` when rhythm or lip-sync matters — tag it inline next to the
speaking subject (e.g. `She [image1] speaks in sync with [audio1].`).

**Passing an audio reference:** supply it via `--audio-ref <url>` (CLI) /
`audio_urls=[...]` (MCP). It is URL-only (MP3/WAV, not auto-uploaded), max
3 clips, and binds by content role as `[audio1]`, `[audio2]`, … in argument
order. This is distinct from `--audio` / `generate_audio`, which is a boolean
asking Seedance to *synthesize* a matching track (no reference, no tag).

## Hard constraints from repo guidance

Treat these as working assumptions and re-check in the UI if needed:

- prefer MP3
- keep clips short
- single speaking face per clip is the safest setup
- short dialogue lines sync better than long monologues

## Dialogue timing

Dialogue length drives clip duration — compute it, don't guess:
**EN ≈ 2.5 words/sec (2.0 dramatic), ZH ≈ 4 chars/sec (3 dramatic), plus a
0.5s lead-in and ≥1s reaction tail.** Full rules in
[`duration-calculus.md`](duration-calculus.md). Never cut on the last
syllable.

## Lip-sync rules

### Text-driven

Most reliable for one speaker:

`She says: "We leave at dawn." Locked medium close-up. Minimal head motion.`

### Audio-driven

Use when timing must follow an uploaded file:

`The speaker [image1] lip-syncs to [audio1]. Locked medium close-up. No fast turns or nodding.`

## Multi-character workaround

Do not attempt dual-character lip-sync in one generation.

Use this workaround:

1. Generate speaker A alone.
2. Generate speaker B alone.
3. Composite the two clips in post.

Or stage it as **shot-reverse-shot**: A's line in Shot 1, B listening (no
line) in Shot 2 — see dialogue coverage patterns in
[`shot-design.md`](shot-design.md).

## Sound-driven transitions (pre-lap)

End a shot with the **next** shot's sound already rising:

`…the courtroom doors close; a train horn already rising. Shot 2: the platform at night…`

This is the cheapest professional-feeling cut available — see
[`continuity-and-editing.md`](continuity-and-editing.md).

## Beat-sync

Use compact rhythm language:

- `cuts land on the snare`
- `camera push on the chorus hit`
- `quick whip pan at beat drop`
- `卡点` for short-form Chinese prompts

## Audio failures

### Audio ignored or rewritten

Reduce competing motion instructions and shorten the clip. Treat uploaded
audio as a reference signal, not guaranteed passthrough.

### Lip-sync drifting

- shorten dialogue
- lock the camera
- reduce head rotation
- keep one face in frame

### Distorted or weak audio

Regenerate shorter clips first. If the voice is critical, prefer compositing
the final master audio in post.
