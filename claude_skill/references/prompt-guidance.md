# Prompt Guidance — Seedance 2.0 Optimization Framework

This file is the **mandatory pre-submission optimizer**. Before calling
`seedance_generate` (MCP) / `seedance generate` (CLI), run the user's input
through the 7-step pipeline
below and submit the **rewritten** prompt — never the raw user input.

Exception: user says "use this prompt as-is" AND it already follows the
6-component framework. Even then, run step 6 (the integrity check).

---

## Optimization principles (read first)

The optimizer is a **scalpel, not a blender**. Five rules govern every edit:

1. **Preserve user-provided structure.** If the input has explicit shot labels
   (`Shot 1:` / `镜头1:`) or per-beat timestamps, preserve the multi-shot
   structure. Do **not** collapse a multi-shot prompt into one paragraph just
   because the default pattern is one paragraph. (Timestamps get *converted*
   to `Shot N:` labels — see step 3 — but the beats themselves are sacred.)
2. **Preserve — and on beauty briefs, ADD — concrete atmospheric detail.**
   `Kodak Vision3 250D`, `50mm anamorphic`, `T2.8`, `magic-hour rim light`,
   `Wong Kar-wai color`, `dust motes in the beam` — these are **signal**, not
   slop. Keep them verbatim. Anti-slop only deletes vague mood words (`epic`,
   `beautiful`, `amazing`, `cinematic` *alone*). ⚠️ When the user asks for
   "beautiful / cinematic / 氛围感 / atmospheric / 高级感" with no specifics,
   deleting the mood word is only half the job — **replace it with 1–2 concrete
   atmospheric microelements** the scene can render: drifting smoke or haze,
   floating dust/light particles, a color-script transition (twilight indigo →
   amber), gentle background life/movement (passersby, leaves, steam). A clip
   that only removed the slop and added nothing reads sterile next to one that
   added real atmosphere — the "no_skill had drifting particles / a richer color
   arc and ours was bare" losses. Atmosphere is content, not decoration.
3. **Edit surgically.** When the only problem is a real public figure's name
   or a copyrighted IP, rewrite **just that span** to a descriptive original.
   Do not rewrite the whole prompt.
4. **Tag every reference.** If `image_urls=` / `video_urls=` / `audio_urls=`
   are passed to the API, each one **must** appear in the optimized prompt
   as `[imageN]` / `[videoN]` / `[audioN]` next to the entity it represents.
   Without these tags Seedance cannot bind references to subjects and falls
   back to "use first image as literal first-frame" — which is almost always
   wrong for character / object / style references. See the
   [Reference indexing](#reference-indexing--required-when-references-are-passed)
   section below.
5. **Protect the headline beat — it must dominate and actually render.** Name
   the ONE thing the user most wants to *see happen* (the milk pouring and the
   art blooming; the painted figures turning and moving; the tears spilling; the
   trick landing) and make it the **most concrete, most emphasized, front-loaded**
   instruction — Subject + Action come first, stated unmissably, before lighting,
   style, or the atmosphere you added under rule 2. The model renders what is
   emphasized and early; a headline buried after three clauses of mood often
   **fails to render at all** (the painting that never moves, the "very sad" face
   that sheds one stingy tear). Atmosphere and craft *support* the headline, they
   never crowd it out. If the brief's emotion/energy is explicitly big, the
   headline must be big and visible too (open streaming tears, not a single
   blink) — see [`performance-direction.md`](performance-direction.md) amplitude.

If the raw input is already detailed and well-structured, the optimizer's job
is mostly the integrity check + safety rewrite + reference tagging — not a
full rebuild.

---

## The 6-component formula

Seedance 2.0 honors the **earliest strong instruction**. Default order:

> **`Subject → Action → Environment → Camera → Lighting → Style`** (+ optional Constraints)

| # | Component | What goes here |
|---|-----------|----------------|
| 1 | **Subject** | Who/what — singular if possible. Age, clothing, material, identity refs. For recurring characters use the identity block from [`character-card.md`](character-card.md). |
| 2 | **Action** | One verb in present tense, **kept as a verb**. One physical movement per shot. ⚠️ If the subject IS an action (latte *art* = pouring, *stir*-fry = tossing over flame, a *stretch*, *brewing*), render that action being PERFORMED in the present continuous as the foreground event — never nominalize it into a finished-state product display ("a completed heart pattern sits on the foam"). The verb the user reached for is the shot. For emotional beats, direct the body — see [`performance-direction.md`](performance-direction.md). |
| 3 | **Environment** | Location + 1–2 renderable atmospheric elements. |
| 4 | **Camera** | Shot size + **ONE** move + angle/lens cue. See [`shot-design.md`](shot-design.md). |
| 5 | **Lighting** | Named setup — the highest-leverage quality lever, never skip. See [`shot-design.md`](shot-design.md). |
| 6 | **Style** | One concrete visual anchor + 1–2 modifiers. See [`shot-design.md`](shot-design.md). |
| 7 | Constraints | Negative list, duration, tempo, consistency. Last. |

### Length targets

| Prompt type | Target |
|-------------|--------|
| Single shot, simple | 50–80 words / 30–60 Chinese chars |
| Single shot, layered | 80–120 words / 60–100 Chinese chars |
| Multi-shot (preamble + `Shot N:` blocks) | 200–350 words; preamble ≤120, each shot block ≤40 |

The 150-word averaging limit applies to **single-paragraph** prompts. A
preamble + labeled shot list can run longer because each `Shot N:` block acts
as a local anchor. Trim order: filler adjectives → repeated environment
details → secondary style tokens → extra camera modifiers. Never cut:
subject, action, identity refs, shot labels, per-shot sound cues,
**or reference tags** (`[imageN]` / `[videoN]` / `[audioN]`).

**Duration is computed, not guessed** — price every prompt with
[`duration-calculus.md`](duration-calculus.md) before submission.

---

## Reference indexing — REQUIRED when references are passed

Whenever the user supplies `--image`, `--video`, or `--audio-ref` references
(MCP `image_urls=` / `video_urls=` / `audio_urls=`), the optimized prompt
**MUST** tag each reference
inline so Seedance knows which asset binds to which subject. The tag goes
immediately after the noun phrase the reference describes.

### The tag convention

| Asset arg | Tag for index 0 | Tag for index 1 | … |
|-----------|-----------------|-----------------|---|
| `image_urls=[a, b, c]` | `[image1]` | `[image2]` | `[image3]` |
| `video_urls=[a, b]`    | `[video1]` | `[video2]` | — |
| `audio_urls=[a]`       | `[audio1]` | — | — |

Indices are **1-based** and follow the **order of the argument list**
(positional, not URL-form-specific — `asset://...` portraits use the same
`[imageN]` tag as plain URLs).

Chinese prompts may use `[图1]` / `[视频1]` / `[音频1]` instead — pick one
language style and stay consistent within a single prompt.

### What happens without tags

| Refs passed | Prompt has tags? | What Seedance does |
|-------------|------------------|--------------------|
| 0 refs | n/a | T2V — fine |
| 1 image | no tag | Treats it as **first frame** (I2V default) |
| 1 image | `[image1]` next to subject | Treats it as a **subject reference** |
| 2+ images | no tags | **First image becomes literal first-frame**, others are guessed at — ❌ this is almost always the wrong behavior |
| 2+ images | each tagged | References bound correctly to subjects |

So: **with two or more references, tags are not optional.** With one
reference, choose deliberately — first-frame (no tag) vs. subject reference
(tagged) — and write the prompt to match. (The untagged first-frame behavior
is exactly what first/last-frame chaining exploits — see
[`continuity-and-editing.md`](continuity-and-editing.md).)

### How to place the tag

Put it **adjacent to the entity** the reference describes, not at the end of
the sentence. The tag binds locally.

✅ Good:
> The Carthaginian commander [image1] in bronze scale armor, sits atop an
> armored war elephant [image2]. He raises his curved sword high; camera
> tilts up. Audio bed: [audio1] (battlefield ambience).

❌ Bad (tags floating, no binding):
> The Carthaginian commander in bronze scale armor sits atop an armored war
> elephant. He raises his sword. References: [image1], [image2], [audio1].

### Multi-shot prompts

Tag at the **first introduction** of each entity (usually in the
identity-sentence between preamble and Shot 1). Re-tag at major identity
beats (close-ups, scale changes) to lock continuity. Don't spam every shot —
that adds noise.

### Coverage rule

**Every URL passed must appear at least once as a tag.** Unreferenced URLs
waste budget and confuse the model. If the user supplies a reference you
don't use, drop it from the API call rather than leaving it dangling.

### Reference roles — what each asset *contributes*

A tag binds a reference to an entity; a **role** says *what* to take from it.
Seedance fuses multiple references by assigning each a job — you decompose a
look across several refs instead of cramming one image to do everything:

> Composition from [image1], color grade from [image2], character design from
> [image3].

Common roles: **identity/character**, **composition/framing**, **palette/grade**,
**material/texture**, **motion/choreography** (`[video1]`), **camera rhythm**
(`[video1]`), **audio tempo/ambience** (`[audio1]`), **environment/scene**.

There is **no numeric strength knob** — adjust adherence with language:

- tighten: `strictly follow the character design from [image1]; do not change
  the outfit or hairstyle`
- soften: `loosely inspired by the lighting in [image2], adapted to a sunset`

Default fusion priority when you don't assign roles: text description >
subject reference > secondary style/scene references. So if a style ref is
bleeding into identity, give it an explicit narrow role.

### Negative constraints (ban-list)

Seedance has no separate negative-prompt field; negatives work **inline**,
best as a short constraints clause at the end: `no text overlays, no logos, no
extra characters, no lens flare`. Treat them as *soft* constraints — they
reduce, not guarantee. Use a ban-list to protect identity/product/text and to
kill recurring failure modes (`no watermark, no subtitles`).

---

## The optimization pipeline

### Step 1 — Triage & capture intent

First decide the **input shape**:

| Shape | Signal | How to optimize |
|-------|--------|-----------------|
| **Vague brief** | One line, mood words, no structure | Full rebuild via 6-component pipeline |
| **Single-shot draft** | One paragraph, has subject + action | Light polish + safety + integrity check |
| **Multi-shot draft** | `Shot N:` / `镜头N:` labels, or `0–Xs:` timestamps | **Preserve the beats**; convert timestamps to `Shot N:` labels; rewrite only what fails safety/integrity |
| **Story / scene brief** | Narrative bigger than one clip | Route through [`narrative-design.md`](narrative-design.md) → shot list → group into calls |
| **Already optimized** | Follows 6-component, named lighting, no slop | Integrity check only |

Then capture: subject, goal (genre/mood/brand), references (flag human
portraits → [`assets.md`](assets.md); recurring characters → build a card per
[`character-card.md`](character-card.md)), hard constraints (duration, ratio,
audio, language).

Ask one clarifying question if something material is missing. Otherwise infer
from genre defaults in [`workflow.md`](workflow.md).

### Step 2 — Fill the compiler scaffold

```text
Mode:        T2V | I2V | R2V | V2V (face swap)
References:  [URL / asset:// / data: URI — flag portraits]
Subject:
Action:
Environment:
Camera:
Lighting:
Style:
Constraints:
Audio:       (only if generate_audio=True)
Duration:    (computed via duration-calculus.md)
```

- **I2V:** omit Subject/Environment (the image carries them); describe
  motion + camera + lighting changes only.
- **R2V / face swap:** state explicitly what to preserve from each reference.

### Step 3 — Compile to final form

**Single-shot prompt** → assemble into one paragraph in order: `Subject →
Action → Environment → Camera → Lighting → Style → Constraints`. Plain
commas and periods.

**Multi-shot prompt** → use the **`Shot N:` grammar**. Explicit shot labels
are what give the model its cut points — long unlabeled prose tends to render
as one continuous take, and bare timestamp blocks are weaker cut signals than
labels:

```text
[Preamble: shared technical contract — film stock, lens, aperture, color
 grade, lighting, atmosphere. One block.]

[Identity sentence — original character with reference tags at first
 introduction, written per character-card.md.]

Shot 1 (≈Xs): [shot size + ONE camera move] — [one action / dialogue line].
[This shot's specific sound.]
Shot 2 (≈Xs): …
Shot 3 (≈Xs): …
```

Multi-shot rules (the **shot budget**):

- **One primary action + one camera move per shot**, plus that shot's sound.
- **≈4–6s per shot**: two shots want ≥10s total, three shots want 12–15s.
  **Four or more shots → split into multiple calls** (chain per
  [`continuity-and-editing.md`](continuity-and-editing.md)).
- Per-shot durations come from [`duration-calculus.md`](duration-calculus.md);
  their sum is the `duration=` argument.
- **End each shot's sentence on the completed beat** — the cut lands there.
  Let the next shot open the new beat (cut on action).
- A spoken line goes **inside the shot where the speaker is on-screen**,
  quoted, short.
- Timestamps (`at 5 seconds…`) may appear *inside* a labeled shot as pacing
  hints — never as bracketed time blocks replacing the labels. If the user
  supplied a timestamp skeleton, convert each time block to a `Shot N (≈Xs):`
  label and keep the content.
- For an unbroken take, say so explicitly: **"single continuous take, no
  cuts"** — otherwise long action prose may get auto-cut.
- Chinese prompts use `镜头1:` / `镜头2:` the same way.

Never use JSON or bullet `-` lists in the final string. Plain text only.

### Step 4 — Anti-slop pass + prose craft (slop ≠ detail)

Delete every banned **mood word**: `cinematic` (alone), `epic`, `beautiful`,
`stunning`, `amazing`, `masterpiece`, `8K ultra-real`, `fast` (unqualified),
`dynamic` (unqualified), `lots of movement`. Emotion adjectives are slop too:
`emotional`, `very sad`, `happy expression` — replace with physical behavior
per [`performance-direction.md`](performance-direction.md). Full list in
[`safety.md`](safety.md).

> **Anti-slop trades vague intensity for concrete intensity — it does NOT turn
> the energy down.** `epic VFX` → name five concrete VFX beats (plasma bloom,
> heat-shimmer, debris blast, billowing smoke, ground steam), not "restrained
> VFX". `很emotional、眼泪流下来` → a full visible tear cascade (brows pull in,
> eyes flood, two tears spill), not "one suppressed blink". Replacing a hype
> word with a *suppressive* word (`restrained`, `subtle`, `克制`, `避免过度`)
> when the user asked for big is a mis-fire: **preserve the user's intended
> amplitude, just make it physical and specific.** Restraint is a default
> register, not a ceiling you impose on an explicit "make it intense" request.

Then apply the **prose craft pass** from
[`prompt-prose-craft.md`](prompt-prose-craft.md):
- Replace generic verbs with verbs encoding visible physics + one consequence
  clause
- Add temporal markers ("first/then/by the end") for any shot with progression
- Compress environment phrases: material + condition + light interaction in one
  clause (not separate sentences for each attribute)
- Remove negation; rewrite as positive ("clean wall" not "no text on wall")
- Break any nested who/which/that chain into short declarative sentences
- Ensure present tense throughout
- Pair every named material with one imperfection + its lighting interaction

**Do NOT delete concrete technical specs** — they look verbose but are
high-signal:

| Keep (signal) | Delete (slop) |
|---------------|---------------|
| `Kodak Vision3 250D`, `Fuji 8553` | `8K ultra-real` |
| `50mm anamorphic`, `T2.8`, `35mm feel` | `ARRI Alexa`, `RED Komodo` |
| `magic-hour rim light from camera-back` | `cinematic lighting` |
| `Wong Kar-wai color`, `Roger Deakins natural` | `epic look` |
| `dust motes in the beam`, `heat shimmer` | `beautiful atmosphere` |
| `jaw tightens, nostrils flare once` | `very angry, emotional` |
| `slow push-in transitioning into forward tracking` (across shots) | `fast dynamic camera` |

If a banned mood word survives or a real public figure's name remains, the
pass is incomplete.

### Step 4.5 — Author the shot (beat the competent default)

A correct prompt produces the *obvious* rendering — which is exactly what a
generic optimizer also produces, so you tie. To **beat** it, add to the shot
**one motivated, distinctive directorial choice** a default prompt would not —
the thing that makes it look authored, not stock. Pick ONE (not all) from the
depth the skill has and a generic prompt lacks:

- a **color choice that carries meaning** — a motif color, a temperature shift
  across the beat, complementary accent ([`color-design.md`](color-design.md))
- a **telling production-design detail** — one prop/texture/world-state that
  implies a backstory ([`production-design.md`](production-design.md))
- an **expressive (not merely functional) camera or composition** — a motivated
  move, a depth-staged frame, a motif in the blocking
  ([`visual-language.md`](visual-language.md), [`shot-design.md`](shot-design.md))
- a **specific performance micro-detail** that individualizes the moment
  ([`performance-direction.md`](performance-direction.md))

Three guardrails, or it backfires:
1. **Motivated** — it must serve the feeling/story, not decorate. A random flare
   or unmotivated prop reads as noise (and can trip moderation/incoherence).
2. **Coherent** — never at the cost of the subject, the headline beat (rule 5),
   or clarity. One signature, cleanly integrated — not five flourishes.
3. **Earned by the brief** — quality/creative briefs want this; a pure
   functional spec (a plain interview, a literal dolly-through-door) may have no
   honest room, and forcing one is worse than leaving it. Don't gild a tie that
   has no story.

Ask: "what is the one choice here that a thoughtful director would make and a
template wouldn't?" That choice is the margin between tie and win.

### Step 5 — Length & duration check

Trim to the target band. Never cut subject, action, or identity references.
Then run [`duration-calculus.md`](duration-calculus.md): compute per-shot
seconds, sum, clamp to 4–15, sanity-check the shot budget. The computed
number is the `duration=` argument — report it to the user with the prompt.

### Step 6 — Final integrity check

Verify ALL before submitting:

- [ ] **Per shot (or per single-shot prompt):** one primary camera move + one
      primary action verb + that shot's sound cue
- [ ] Lighting is **named** (not just implied)
- [ ] No banned mood words or bare emotion adjectives remain
- [ ] No camera brand names (`ARRI`, `RED`, `Sony`, etc.); film stock + focal
      length + aperture are fine
- [ ] No conflicting style/motion (e.g. "static slow handheld")
- [ ] Style has at least one concrete anchor
- [ ] Length within target band for the prompt shape
- [ ] **Multi-shot:** `Shot N:` labels present (not bare timestamp blocks),
      beat structure preserved, ≤3 shots per call, shot budget respected
- [ ] **Duration computed** via duration-calculus (dialogue word count,
      action beats, camera minimums) — not guessed
- [ ] **Performance beats:** emotion written as physical behavior with an
      on-screen trigger; micro-expressions only in MCU/CU/ECU shots
- [ ] **Two+ characters:** no bare pronouns; frame-left/right positions stated
      and held (180° axis — see [`continuity-and-editing.md`](continuity-and-editing.md))
- [ ] **I2V:** prompt does NOT restate visible image content
- [ ] **Audio:** dialogue language matches user intent; lines quoted verbatim,
      placed inside the speaker's shot
- [ ] **Portraits in refs:** uploaded as `asset://` (see [`assets.md`](assets.md))
- [ ] **Reference tags present:** every URL in `image_urls=` / `video_urls=`
      / `audio_urls=` is tagged inline as `[imageN]` / `[videoN]` / `[audioN]`
      next to the entity it represents. With 2+ references this is mandatory;
      with 1 reference, choose first-frame (no tag) vs. subject-ref (tagged)
      deliberately
- [ ] No real public figures, named IP, or branded music
      (see [`safety.md`](safety.md)) — rewrite the offending span only, not
      the whole prompt

### Step 7 — Submit & log

Pass the **optimized** prompt and the **computed** duration to
`seedance_generate` (MCP) / `seedance generate` (CLI). Log both the raw and
optimized versions when
iterating so you can compare.

---

## Mode-specific patterns

### T2V

> A young woman in a red windbreaker walks across a wet alley at night. Slow
> tracking follow, medium shot, normal lens. Practical neon lights only, cool
> blue ambience, reflections on the pavement. 35mm film tone, subtle grain.

### I2V

> She turns her head toward camera, eyes narrowing. Slow push-in from medium
> shot to medium close-up over 4 seconds. Rim light unchanged. Rain continues
> in the background.

*(Never restate what the image already shows — motion + camera + light changes
only. Single image with no tag = first-frame default. Add `[image1]` only if
you want it treated as a styled subject reference instead of a literal first
frame.)*

**"Bring it to life / make it move / 让它动起来" briefs.** The model has a
strong prior to keep a still image (a painting, a photo) static — it will happily
just re-light or de-age it and call it done (the painting whose figures never
move). To overcome the prior, name the SPECIFIC per-element motion as the
dominant, concrete headline action: *"the left man turns his head and lifts his
goblet; the center figure's chest rises with a breath and he blinks; the candle
flames flicker"* — not the vague "characters come alive." Concrete who-moves-what,
front-loaded (rule 5), is what actually animates a static source.

### R2V — motion transfer

> Transfer the dance timing and camera rhythm from [video1] to the singer
> [image1]. Stage neon-lit, cuts aligned to the beat. One orbit move per
> chorus, otherwise locked-off.

### V2V — face swap

> Replace the face of the woman in [video1] with the face from the portrait
> [image1]. Preserve original body motion, background, clothing, and lighting
> from [video1]. Match skin tone and hairline blending. Static camera carried
> over from source.

### Multi-shot (the `Shot N:` grammar)

```text
Film stock: Kodak Vision3 250D. Lens: 50mm anamorphic, T2.8 shallow depth.
Color grade: golden magic-hour, deep contrast. Lighting: low backlit sun
creating strong rim light, dust glowing in light rays, heat shimmer.
Atmosphere: drifting sand, banners in the wind.

The commander [image1] in bronze scale armor sits atop an armored war
elephant [image2].

Shot 1 (≈4s): Wide rear tracking shot — the commander [image1] on the
elephant [image2] surveys the battlefield from a dune ridge, army stretched
behind him. Wind, low rumble.
Shot 2 (≈5s): Medium close-up — he tightens his grip on the curved sword and
raises it high; camera tilts up with the motion, then he shouts: "For
Carthage!" Rising rumble, wind surge under the shout.
Shot 3 (≈5s): Dynamic forward tracking — cavalry and infantry charge past
the elephant [image2], dust exploding skyward. Thunder of hooves, battle
cries.
```

*(3 shots ≈ 14s → `duration=14`. Each shot: one move, one action, its own
sound. The dialogue line sits inside the shot where the speaker is on-screen.)*

If a generation renders as one continuous take: sharpen the `Shot N:` labels,
reduce to two shots, and use the standard model (not the fast tier — fast
tiers honor multi-shot, slow motion, and dolly moves less reliably). If a
shot's action gets skipped: fewer shots or more seconds.

---

## Worked rewrites

### Example 1 — Skateboarding

**Raw input:** `cool skateboard video, cinematic, fast, amazing tricks, lots of movement, epic style`

**Optimized:**
> A skateboarder in a dark hoodie lands a clean kickflip in an empty dawn
> parking lot. Low tracking shot, normal lens, subtle rise on the landing.
> Soft golden hour from camera-left, long shadows. 35mm film tone, modern
> contrast, light grain. Avoid jitter and bent limbs.

### Example 2 — Perfume product

**Raw input:** `beautiful product shot of a perfume bottle, very fast camera, cinematic dynamic epic feel, 8K ultra-real`

**Optimized:**
> A faceted perfume bottle on a black mirror surface. Slow dolly-in over 5
> seconds, telephoto (85mm feel), shallow depth of field. Single overhead
> spotlight refracting warm gold through the crystal, dust motes drifting in
> the beam. Anamorphic lens flare, rich blacks, bokeh background.

### Example 3 — Chinese coffee shop

**Raw input:** `拍一个咖啡店女生很美的视频，电影感`

**Optimized:**
> 一位短发女生坐在木质咖啡店窗边，双手捧杯轻吹热气。镜头从中景缓推至中近景。窗外晨光斜射，蒸汽在光柱中升起。35mm胶片质感、暖色调、轻微颗粒。

### Example 4 — UGC vlog (Bahasa Indonesia)

**Raw input:** `tiktok vlog street food jakarta, indo language, vibey`

**Optimized:**
> A young man vlogger walks through a Jakarta evening warung, waves at the
> camera, and says in fluent Bahasa Indonesia: "Halo guys, hari ini kita
> jalan-jalan makan makanan lokal." Handheld vertical 9:16, normal lens, eye
> level. Practical street-stall lighting, golden-hour warmth, mild handheld
> sway. Soft lo-fi music low under speech. Avoid watermarks and subtitles.

*(Duration check: 9 words ÷ 2.3 + 1.5 ≈ 5.5 → `duration=6`.)*

### Example 5 — Multi-shot historical sequence (convert timestamps, tag refs)

**Setup:** the user passes `image_urls=[commander_portrait_url, war_elephant_url]`
(so `[image1]` = commander, `[image2]` = elephant) plus a 6-beat timestamp
timeline naming a real actor.

**What's wrong with the raw input:**
1. Real public figure (`actor Denzel Washington`) — must be replaced with an
   original character.
2. **No reference tags** — Seedance will fall back to "first image as
   first-frame", freezing the commander portrait instead of using it as an
   identity reference.
3. **Six beats in one call** breaks the shot budget (≈4–6s per shot, max 3
   shots) — regroup into 3 shots here, or split into two chained calls if all
   six beats must survive.
4. Timestamp blocks (`0–3s:`) as the skeleton — convert to `Shot N:` labels.

Otherwise the input is high-signal: keep the technical preamble, the actions,
the dialogue line. **Do not collapse to one paragraph.**

**Raw input (excerpt):**
> Film stock: Kodak Vision3 250D. Lens: 50mm anamorphic. … Hannibal is
> played by actor Denzel Washington and sits atop an armored war elephant.
> 0–3s: Wide rear tracking shot. … 3–6s: Medium push-in from side. … 6–9s:
> Medium close-up. He raises sword. … 9–11s: Close-up low angle. He shouts:
> "For Carthage!" … 11–13s: Wide shot behind. … 13–15s: Dynamic tracking shot.

**Optimized (beats regrouped to 3 shots, labels replace timestamps, public-figure span rewritten, references tagged):**
> Film stock: Kodak Vision3 250D. Lens: 50mm anamorphic, T2.8 shallow depth.
> Color grade: rich golden magic-hour, warm highlights, deep contrast, dusty
> mids. Lighting: low backlit sun creating strong rim light and silhouette,
> dust glowing in light rays, heat shimmer. Atmosphere: drifting sand,
> layered dust haze, banners moving in wind.
>
> The Carthaginian commander [image1] — a tall, weathered general in bronze
> scale armor and a crimson cloak, dark beard, sun-darkened skin — sits atop
> an armored war elephant [image2].
>
> Shot 1 (≈5s): Wide rear tracking shot — the commander [image1] sits high
> on the elephant [image2] on a dune ridge, his army stretched along the
> ridgeline behind him, Roman lines far across the dust plains; he turns
> slightly, scanning them, focused. Wind, armor movement, low rumble.
> Shot 2 (≈5s): Low-angle medium close-up — he [image1] tightens his grip on
> the curved sword, raises it high, camera tilting up with the motion, and
> shouts clearly: "For Carthage!" Sun flares behind him. Rising rumble, wind
> surge under the shout.
> Shot 3 (≈5s): Dynamic forward tracking — the army roars back and charges:
> cavalry and infantry sweep past the commander [image1] and the elephant
> [image2], dust exploding skyward. Unified battle cry, thunder of hooves.

**What changed vs. raw:**
- `actor Denzel Washington` → original character description (safety rewrite,
  surgical span only)
- **Added `[image1]` and `[image2]` tags** at first introduction and at
  identity-critical shots
- **Six timestamp beats → three labeled shots** honoring the shot budget;
  adjacent beats with the same framing intent were merged (survey + scan,
  raise + shout, response + charge) so no story beat was lost
- Duration: 3 shots × ≈5s → `duration=15`
- All technical specs, atmosphere, dialogue, per-shot camera moves and sounds:
  **kept verbatim or near-verbatim**
