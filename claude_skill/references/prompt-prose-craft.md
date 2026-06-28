# Prompt Prose Craft — how to write, not just what to write

The other references tell you *what* to include (subject, camera, lighting…).
This file tells you **how to phrase it** so the model renders it accurately,
with depth, texture, and professional cinematic quality. These are
language-level techniques proven across video generation models.

---

## 1. Verb physics — encode what the eye sees

Generic verbs ("walks", "moves", "looks") give the model no physical
information. Replace with verbs that encode visible mechanics: **speed,
weight, resistance, direction, effort**. Then add 1–2 clauses showing the
physical consequence.

| Generic | Physical verb + consequence |
|---------|----------------------------|
| walks | trudges through wet sand, each boot sinking and pulling free |
| runs | sprints across the courtyard, coat whipping behind her, breath visible |
| picks up | lifts the suitcase with both hands, arms straining, then steadies |
| looks | glances over her shoulder, the movement sharp and sudden |
| falls | collapses forward, knees hitting first, hands catching the stone |
| opens | pushes the heavy door with her shoulder, the hinges groaning |

**Rules:**
1. Every subject verb should imply a visible physics — weight, momentum,
   resistance, temperature, or surface interaction.
2. Add one clause showing what the environment does in response: dust rises,
   fabric moves, water splashes, light shifts.
3. For rare or literary verbs, add a parenthetical gloss so the model has a
   second chance: `saunters (walking slowly with a lazy swagger)`.
4. One hero action per shot, described in 1–3 countable beats — not a summary.

**Chinese equivalent pattern:**
- ❌ `走过去` → ✅ `拖着脚步踩过积水，水花溅起`
- ❌ `拿起来` → ✅ `双手托起箱子，手臂微颤`

---

## 2. Temporal phrasing — describe time unfolding

Models respond to **pacing adverbs near the verb** and **sequence markers**
far better than to clock durations alone ("over 3 seconds" is soft guidance
at best).

### Pacing adverbs (adjacent to the verb)
- Slow: `slowly`, `gradually`, `smoothly`, `in one continuous motion`
- Fast: `suddenly`, `in a quick burst`, `all at once`, `rapidly`
- Sustained: `steadily`, `without stopping`, `in an unbroken movement`

Place them directly before or after the verb: "slowly turns" not "turns in a
slow manner."

### Sequence markers (structure the shot)
- `At the beginning of the shot… Then… By the end…`
- `First… then… finally…`
- `Throughout the shot…` (for persistent states)
- `For a moment…` / `briefly…` (for transient states)

### The 3-beat rule inside a single shot

Even a 5-second shot has a temporal arc. Describe 3 beats:

```
WEAK:   "She slowly turns, her face entering the light."

STRONG: "At the start, she faces away from the window in shadow.
         Then she slowly turns toward the light, features gradually
         emerging. By the end she faces camera, fully lit, expression calm."
```

The strong version tells the model: start state → transition → end state.
This maps directly to the performance arc in
[`performance-direction.md`](performance-direction.md).

### Reiterate identity across beats

When describing temporal progression, re-anchor the subject: "the same woman,"
"the red car still in frame," "his coat unchanged." Without this, the model
may drift mid-shot on long prompts.

---

## 3. Information hierarchy — front-loading

Early tokens in the prompt disproportionately shape global composition.
Later tokens affect secondary attributes. The 6-component order in
[`prompt-guidance.md`](prompt-guidance.md) already encodes this, but
understand *why*:

| Position | Weight | Put here |
|----------|--------|----------|
| First sentence | Highest | Subject + what they do + where |
| Second sentence | High | Camera framing + movement |
| Third sentence | Medium | Lighting + atmosphere |
| Fourth sentence | Medium-low | Style, technical specs, sound |
| Last position | Lowest | Negative constraints, duration |

**Anti-patterns that waste prime position:**
- Starting with style keywords: "Hyper-realistic cinematic 8K…" before
  specifying a subject → model matches a generic "cinematic" look
- Meta-instructions: "Generate a video where…" → zero visual information
- Negatives first: "No watermark, no text, no logo…" → the model sees
  these words in prime token position and may activate them

**The fix:** The very first clause is always a concrete noun doing a
concrete verb in a concrete place.

---

## 4. Sensory compression — maximum information density

The best descriptions follow a compression formula:

```
[material noun] + [condition/state] + [light interaction] + [atmospheric force]
```

One phrase doing 3–4 jobs outperforms verbose enumeration:

| Verbose (12 words) | Compressed (5–7 words) |
|--------------------|------------------------|
| wet street with reflections of lights at night | rain-slicked asphalt reflecting neon |
| old metal railing that looks weathered in morning light | salt-crusted railing under hard sunrise |
| a foggy forest with light coming through the mist | mist-filtered light through old-growth canopy |
| glass wall with steam on it under fluorescent light | steam curling off glass under fluorescent cold |
| dust in the air lit by a window | dust motes suspended in a window shaft |

**Rules:**
1. Every environment phrase must contain a **light-surface interaction** —
   describe what the light *does* to the surface, not the light and surface
   separately.
2. Prioritize interaction verbs: "reflecting," "catching," "filtering,"
   "pooling on," "scattering through" > static adjectives.
3. Limit to 2–4 tightly related descriptors per phrase — more dilutes.
4. Concrete nouns over mood words: "condensation on glass" > "mysterious
   atmosphere."

### Chinese compression
- ❌ `一条雾蒙蒙的有灯光的夜晚街道` → ✅ `夜雾中霓虹倒映在湿沥青上`
- ❌ `阳光透过窗户照进来有灰尘飘动` → ✅ `窗光斜射，光柱中浮尘悬停`

---

## 5. Causal connectors — actions that belong together

Causal linking tells the model "these events are one timeline" rather than
independent descriptions. But keep it simple — one connector per sentence.

**Connectors that work:**
- `as` (simultaneity): "As he opens the door, cold air rushes in"
- `causing` / `sending` (direct effect): "The impact sends glass sliding
  across the floor"
- `in response` (reaction): "The dog hears the whistle and tilts its head"
- `which makes` (consequence): "The branch snaps, which sends birds erupting
  from the canopy"

**The sweet spot: simple sentences, linked.**
```
BAD (nested):
  "As the thunder cracks, causing the windows to shake, which makes dust
   fall from the ceiling, the character flinches and drops the glass, which
   shatters on the floor"

GOOD (segmented):
  "Thunder cracks. The windows shudder, dust falling from the ceiling.
   She flinches. The glass slips from her hand and shatters on the stone."
```

**Rules:**
1. One causal connector per sentence, maximum.
2. Always name the reacting subject — avoid ambiguous "it."
3. For chains of 3+ events, break into separate sentences or numbered beats.
4. Use causal language for the reaction you most want rendered — the model
   allocates attention to explicit cause-and-effect pairs.

---

## 6. Material vocabulary — the anti-plastic list

Specifying surface irregularity and imperfection pushes the model toward
real-world footage distributions rather than CGI renders. The formula:
**specific material + imperfect finish + one micro-detail**.

### Vocabulary by category

| Category | High-reliability terms |
|----------|----------------------|
| **Aging/wear** | weathered, worn, tarnished, oxidized, sun-faded, scuffed, patinated, chipped |
| **Surface finish** | matte, brushed, raw, satin, low-gloss, uncoated, hand-rubbed |
| **Micro-texture** | grainy, porous, frayed, micro-scratched, pitted, visible weave, open grain, cracked |
| **Organic fabric** | raw linen, coarse cotton, frayed wool, visible weave, natural dye |
| **Leather** | worn leather with cracked seams, supple, creased, softened at the folds |
| **Metal** | brushed steel, tarnished brass, oxidized copper, pitted iron, anodized aluminum |
| **Wood/stone** | weathered oak, rough-cut timber, ring-stained, chipped stone, worn concrete |
| **Glass** | frosted, smoked, rain-beaded, fogged, scratched acrylic |

### The anti-plastic formula

```
PLASTIC:  "a leather chair"
REAL:     "a worn leather armchair, cracked seams, softened edges, matte finish"

PLASTIC:  "a metal door"
REAL:     "a brushed steel door, pitted near the handle, low-gloss under
           overhead fluorescent"

PLASTIC:  "a wooden table"
REAL:     "a weathered oak table, ring-stains, open grain, warm side-light
           catching the surface texture"
```

**Rules:**
1. Every important surface gets: material + condition + finish.
2. Default to "matte" or "low-gloss" — glossy reads as CG unless intentional.
3. Add one imperfection: "scratches," "dust," "wear at the edges," "patina."
4. Pair material with lighting interaction (see §4).

Cross-reference: conceptual discussion in
[`production-design.md`](production-design.md) §2.

---

## 7. Atmosphere reliability tiers

Not all atmospheric effects render equally well. Use from the top; go lower
only for background seasoning far from the subject.

### HIGH reliability (safe, high-yield)
- **atmospheric perspective** — distance falloff; the cheapest depth enhancer
  for any wide shot
- **haze / light haze** — adds filmic contrast and depth separation
- **morning mist / thin ground mist** — mood, ground plane, soft diffusion
- **volumetric light / god rays** — cinematic shafts (always add "soft" or
  "subtle")
- **subtle lens flare** — directional light cue

### MEDIUM reliability (good but qualify intensity)
- **dust motes / floating dust** — indoor depth and realism (always "faint"
  or "subtle")
- **thin smoke wisps** — motion-ful atmosphere (not "heavy smoke")
- **embers / sparks** — stylized VFX, keep away from the face

### LOW reliability (artifacts common — use with caution)
- **steam** — may flicker or look like low-res noise
- **condensation on glass** — droplets mutate between frames
- **heat shimmer / heat haze** — warps subjects, temporal jitter
- **dense fog / thick smoke** — subjects vanish, silhouettes unstable

**Rules:**
1. Maximum 2 atmospheric effects per shot, anchored to a physical cause
   ("sunlight through dusty air" not just "dust").
2. Always qualify with intensity: "subtle," "light," "thin," "faint."
3. For subject-critical shots add: "subject clearly visible despite the haze."
4. Never stack contradictory atmosphere + lighting ("bright noon sun + dense
   fog + god rays + clear sky").
5. For wide establishing shots, "atmospheric perspective" alone adds more
   depth than any particle effect.

---

## 8. Contrast pairs — cinematic polarity

Visual contrast pushes the model away from its "average" default toward a
more defined, directorial frame. Choose 1–3 axes per shot and **tie each
pole to a specific spatial region**.

### The 5 reliable contrast axes

| Axis | Example prompt language |
|------|------------------------|
| **Warm vs cool** | `warm candlelight on her face, cold blue city glow through the window behind` |
| **Light vs shadow** | `single shaft of light on the subject, the rest of the room in deep shadow` |
| **Sharp vs soft** | `sharp focus on his eyes, background dissolving into gentle bokeh` |
| **Still vs moving** | `locked static frame, only the curtain breathing in the draft` |
| **Large vs small** | `tiny silhouette on the ridge, dwarfed by towering storm clouds` |

### How to write it

Tie each side of the contrast to a **region** (foreground/background,
subject/environment, interior/exterior):

```
FLAT:       "A woman reading by a window at night"
CONTRASTED: "A woman reading in warm candlelight, cold blue city light
             through the window behind her, high contrast between the two"
```

**Rules:**
1. Max 1–3 contrast axes per shot — more creates contradiction.
2. Anchor each pole to a named object or region in frame.
3. Warm/cool + light/shadow is the single most reliable combination.
4. For motion contrast, specify "locked camera" or "static frame" to anchor
   the still side.
5. Physically impossible contrasts ("pitch black but everything visible")
   produce artifacts.

Cross-reference: color contrast in [`color-design.md`](color-design.md);
depth staging in [`visual-language.md`](visual-language.md).

---

## 9. Anti-patterns — what the model can't parse

Beyond slop words (see [`prompt-guidance.md`](prompt-guidance.md) step 4),
these linguistic patterns actively degrade output:

### CRITICAL — avoid entirely

| Pattern | Why it fails | Fix |
|---------|--------------|-----|
| **Negation** ("no X," "without X") | Models often activate the concept rather than suppress it. "No watermark" can introduce one. | Positive framing: "clean wall" not "no text on wall" |
| **Abstract concepts as content** ("freedom," "hope," "guilt") | No visual referent → generic stock footage | Translate to concrete staging: "she opens the cage door and steps out" (freedom) |
| **Contradictions** ("dark bright room," "fast slow-motion") | Model averages both → muddy output | Pick one pole, commit |
| **Multiple detailed subjects** ("ten friends each with unique outfits") | Identity merging, limb duplication | Max 2–3 specific characters per shot |

### SERIOUS — restructure

| Pattern | Why it fails | Fix |
|---------|--------------|-----|
| **Nested clauses** ("A man who is wearing a jacket that has a logo on the sleeve and who is walking through a market that is lit by neon while the camera tracks…") | Attribute bleeding — colors/clothes land on wrong subject | Break into short declarative sentences |
| **Metaphorical language** ("thoughts are a storm of glass") | Model renders literal storms/glass | Describe the visual: "close-up of her face, then cut to dark sky with lightning" |
| **Story summaries** ("learns to love himself again") | No shot-level information | Describe what is on screen right now |
| **Past tense / mixed tense** | Training captions are present-tense descriptions | Always present tense: "walks" not "walked" |
| **Meta-instructions** ("Generate a video where…" / "Make it look like…") | Wastes prime tokens, outside training distribution | Delete — start with the subject |

### MODERATE — use with awareness

| Pattern | Risk |
|---------|------|
| Exact counts ("seven birds in a V") | Counting is unreliable in all current models |
| Ambiguous motion subject ("it moves slowly") | Always name what moves and how |
| Style-keyword chains longer than the scene description | Dilutes important tokens |
| Excessive punctuation/formatting (bullets, colons, dashes) | Final prompt is plain prose, not a form |

### Quick self-check before submitting

- Is every sentence in present tense?
- Does every sentence have a concrete named subject?
- Is there any negation? → Rewrite as positive.
- Is there any abstract emotion? → Rewrite as physical behavior
  ([`performance-direction.md`](performance-direction.md)).
- Are there nested who/which/that chains? → Break apart.
- Does any sentence start with a meta-instruction? → Delete it.

---

## 10. Putting it all together — before and after

### Example A — Product shot

```
BEFORE (19 words, 0 physics):
  "A beautiful perfume bottle on a table, cinematic lighting, gorgeous,
   8K ultra realistic"

AFTER (38 words, layered):
  "A faceted glass perfume bottle on black marble, faint scratches on
   the cap. Slow dolly-in, telephoto. Single overhead spot refracting
   warm gold through the crystal, dust motes in the beam. Anamorphic,
   matte blacks."
```

Why the AFTER works: specific material (faceted glass, black marble),
imperfection (faint scratches), light-surface interaction (refracting warm
gold through crystal), atmosphere (dust motes — high reliability tier),
contrast (warm gold light vs matte blacks), one camera move (slow dolly-in),
one style anchor (anamorphic). Present tense throughout, subject first.

### Example B — Emotional beat

```
BEFORE (14 words, abstract):
  "A sad woman looking out a window, very emotional, dramatic, cinematic"

AFTER (52 words, physical + temporal + contrast):
  "A woman in a grey wool cardigan sits at a rain-beaded window. At the
   start her gaze rests on the street below; then her jaw tightens, she
   blinks twice, and slowly turns away. Locked medium close-up, soft
   overcast window light on her face, warm lamp glow behind, shallow
   focus."
```

Why: verb physics (jaw tightens, blinks twice, turns away), temporal markers
(at the start / then / slowly), material (grey wool cardigan, rain-beaded
glass), contrast (cool window light vs warm lamp behind), sensory compression
(rain-beaded window = weather + texture + light in 3 words).

### Example C — Chinese action beat

```
BEFORE: "一个人在雨中奔跑，很快，动态镜头，电影感"

AFTER: "一名穿深色冲锋衣的男子在暴雨中全力冲刺，每一步溅起水花，
呼吸急促可见。中景跟拍，手持轻微晃动。唯一光源为头顶路灯，雨丝在
光柱中斜落，湿沥青反射冷白光。粗颗粒胶片质感。"
```

Why: verb physics (全力冲刺 + 溅起水花 + 呼吸可见), material (深色冲锋衣,
湿沥青), sensory compression (雨丝在光柱中斜落 = atmosphere + light
interaction in 7 chars), contrast (冷白路灯光 vs 暗夜), single camera move
(中景跟拍). No abstract adjectives.

---

## Summary cheat sheet

| Layer | One-line rule |
|-------|---------------|
| Verbs | Encode visible physics + add one consequence clause |
| Time | "First… then… by the end" + pacing adverb adjacent to verb |
| Order | Subject + action first; style + negatives last |
| Density | material + condition + light verb + atmosphere in one phrase |
| Causality | One connector per sentence; name the reactor |
| Material | Specific noun + imperfection + matte/low-gloss default |
| Atmosphere | Max 2, high-reliability tier, intensity-qualified, cause-anchored |
| Contrast | 1–3 axes, each pole tied to a spatial region |
| Avoidance | No negation, no abstract, no past tense, no nested clauses, no meta |
