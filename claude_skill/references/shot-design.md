# Shot Design

Use this file for camera, composition, motion, lighting, character control,
style, and VFX.

## Camera

### One-Move Rule

For a single shot, specify one primary camera move at a time — the ban is on
**compound simultaneous** moves, not on motion variety.

- good: `locked-off static camera`
- good: `slow dolly push-in`
- good: `slow orbit left around the subject`
- bad: `push in while panning left and tilting up` (three moves at once = drift)

**Connected move sequences are allowed and encouraged** for product / showcase /
reveal work: chain single moves with settle-points so only one runs at any
instant — `tilt up to reveal the front, settle; track along the side; push to a
detail close-up; pull back to the hero wide`. This is one continuous take with a
*rhythm*, not a compound move. A showcase that does only "push in, then pull
back" looks plainer than the brief asks — give the camera a choreographed path.

> **For product / showcase, the default is an ORBIT or multi-feature detail
> pass, NOT a straight push-in/pull-back.** A premium product spot earns its
> "高级感" by moving *around* the object and stopping on its features: reveal →
> arc/orbit across the form → detail passes on the distinct parts (knobs, seam,
> spout, logo) → settle on the hero wide. A centered dolly-in then dolly-out is
> the plain fallback that reads as a 3D turntable, not an ad — only use it when
> the brief explicitly wants stillness. When the brief says "高级感/大气/
> cinematic product," choreograph 3–5 connected moves that show the object from
> multiple angles.
>
> **One hero unit — never duplicate the product across cuts.** A single-product
> ad shows the SAME one item from new angles at every cut; do not let a cut
> introduce a second copy of the product (two espresso machines, two bottles).
> State "the same [product]" across shots so the model keeps one coherent hero,
> not a lineup.

⚠️ **When a reference video supplies the camera rhythm** (an R2V/`[video1]`
"运镜节奏" brief), follow ITS pacing — its move count, cut points, accelerations
and holds. Do **not** flatten it into the default 3×4s template; that discards
the very thing the reference was given for. Match the reference's beat count and
let duration follow from it (it may want 6 fast moves in 8s, not 3 slow ones in
12s).

### Stable camera contract

```text
Framing: wide / medium / close-up
Move: locked / push / pull / pan / tilt / orbit / tracking / handheld / crane
Speed: slow / moderate / fast
Angle: eye level / low angle / high angle
```

Camera moves have minimum readable durations — see
[`duration-calculus.md`](duration-calculus.md).

### Camera height is meaning

| Height | Reads as |
|--------|----------|
| Low angle | power, threat, monumentality |
| Eye level | neutrality, empathy, documentary |
| High angle | vulnerability, smallness, surveillance |
| Overhead / top-down | fate, pattern, detachment |

Pick the height for the story, not for variety.

### Lens psychology

Focal length is an emotional instrument, not a spec:

| Lens feel | Effect | Use for |
|-----------|--------|---------|
| Wide (24–35mm feel) | space, exaggerated depth, slight distortion; intimate-but-uneasy up close | environments, vulnerability, chaos, POV urgency |
| Normal (35–50mm feel) | human-eye neutrality | dialogue, documentary, lifestyle |
| Telephoto (85–135mm feel) | compressed depth, isolated subject, voyeuristic distance | longing, surveillance, product hero, romance |
| Macro | texture as landscape | product detail, ECU inserts |

## Composition

State one compositional intent per shot; the model fills the rest.

- **Rule of thirds** — subject on a third line; eyes on the top third.
- **Lead room / nose room** — space in front of a moving or looking subject:
  `she walks frame-left to right with open space ahead of her`.
- **Headroom** — minimal in close-ups; generous headroom reads as isolation.
- **Depth layering** — name foreground / midground / background:
  `rain-streaked glass in the foreground, her face in midground focus, neon
  street bokeh behind`. Three layers is the single fastest way to make a
  frame feel "expensive".
- **Negative space** — isolates and makes posters: `small figure low in the
  frame, vast pale sky above`.
- **Symmetry** — formality, ritual, unease: `centered one-point perspective
  down the corridor`.
- **Frame-in-frame** — doorways, windows, mirrors: confinement or voyeurism.

## Motion

Describe intent and consequence, not animation keyframes.

- `A charges, B sidesteps, dust kicks up at the turn.`
- `The bag swings once as she stops.`
- `Steam thickens as the coffee begins to pour.`

For complex action, use a reference video first. Text-only action should stay
low-density — count beats per [`duration-calculus.md`](duration-calculus.md).

### Prefer slow, continuous, small movements

The model is most stable on low-amplitude motion. Favor `walks slowly`,
`gently raises a hand`, `slightly lowers the head`, `smoothly sits down`.
Avoid high-intensity verbs — `sprints`, `big jump`, `violent roll`, `rapid
spin` — which drive jitter and limb deformation. If a big action is essential,
transfer it from a `[video1]` reference instead of describing it in text.

### Write the transition between actions

Give the model the *hinge* between two moves so it can keep continuity:

- `using the momentum from the turn, she raises the cup`
- `naturally transitioning from a pause into a slow step forward`
- `the bag swings once as she stops, then settles`

## Blocking & staging

Movement **inside** the frame often beats moving the camera:

- Stage entrances/exits through frame edges: `he enters frame-right,
  crosses behind her, exits frame-left`.
- Move subjects **through depth** (toward/away from camera) — more cinematic
  than lateral drift and cheaper than a camera move.
- Two-character power staging: who stands, who sits; who faces camera, whose
  back is turned; who occupies more frame. Say it explicitly.
- Keep screen positions consistent across shots — the 180° axis rule lives in
  [`continuity-and-editing.md`](continuity-and-editing.md).

## Lighting

Always name a source.

- `window backlight`
- `single overhead practical`
- `soft studio key top-left`
- `warm streetlamp backlight`

Useful additions:

- contrast: low-key / high-key
- color temperature: warm amber / cool blue / neutral white
- atmosphere: thin fog / dust motes / smoke drift / light rain
- **motivation**: prefer light that the scene could plausibly produce
  (window, lamp, neon sign) — motivated light grounds the frame
- **color contrast design**: pick one warm/cool opposition and stick to it
  (`warm tungsten interior against cool blue dusk through the window`)

Genre starting points: noir = single hard source + deep shadow; horror =
underlight or top-light, pools of dark; romance = soft backlit warmth, halation;
corporate = high-key soft wrap. Full per-genre lighting/camera/color
conventions: [`genre-grammar.md`](genre-grammar.md). Color as a story system
(palettes, motif color, temperature arcs): [`color-design.md`](color-design.md).

## Characters

### Identity anchors

Recurring or hero characters get a full **character card** — turnaround,
expression strip, written identity block — not a headshot. See
[`character-card.md`](character-card.md).

Tag each reference inline next to the character it controls — 1-indexed,
matching the order of `image_urls=` in the API call:

- `Character A [image1] confronts Character B [image2] across the room.`
- `She [image1] turns toward the door.` (face + wardrobe consistency from image 1)
- `The hero [image1] in the rain-slick alley [image2].` (subject ref + scene ref)

Avoid ambiguous pronouns when multiple characters are present. **Without a
tag, Seedance falls back to using the first image as a literal first-frame**
— almost never what you want for character references. See
[`prompt-guidance.md`](prompt-guidance.md#reference-indexing--required-when-references-are-passed)
for the full convention.

### Performance

Emotion is directed as physical behavior — entry state, on-screen trigger,
exit state, micro-expression cues scaled to shot size. The full vocabulary
and worked patterns are in
[`performance-direction.md`](performance-direction.md).

### Hand and face safety

- prefer waist-up if hands are not essential
- use one simple hand action only
- avoid rapid head turns in extreme close-up
- re-upload identity references when extending a sequence

### First frame for I2V

The first frame should already contain:

- desired camera angle
- desired light direction
- starting pose, not mid-action
- clean background separation
- matching aspect ratio

## Dialogue coverage patterns

Reliable setups for spoken scenes (one speaker per generation — see
[`audio.md`](audio.md)):

| Pattern | When |
|---------|------|
| **Locked single** (MCU, speaker only) | default; safest lip-sync |
| **Shot-reverse-shot** (two calls or two shots: A speaks / B reacts) | conversations — hold the axis: A frame-left looking right, B frame-right looking left |
| **Over-the-shoulder** | adds spatial relation; keep the foreground shoulder soft |
| **Two-shot profile** | negotiation, standoff; no lip-sync pressure on the far speaker |
| **Listener insert** (1.5–2.5s reaction, no lines) | breaks monologues, hides cuts |

## Style

Use one primary style anchor.

- `anamorphic, subtle grain, muted palette`
- `2D animation, bold outlines, flat shading`
- `stop-motion texture, visible material grain`

Useful material contract for CGI:

- base: glass / brushed aluminum / ceramic / leather
- roughness: matte / satin / glossy
- imperfection: dust / scratches / fingerprints / edge wear

For multi-clip projects, fix the style + grade in the shared preamble and
reuse it verbatim — see [`continuity-and-editing.md`](continuity-and-editing.md).

Avoid empty boosters such as `masterpiece`, `ultra-real`, and `award-winning`.

## VFX

Describe the effect as a contract:

- source
- scale
- behavior
- interaction
- duration

Example:

`Blue sparks burst from the sword impact point, arc downward with gravity, briefly light the characters' faces, then fade within one second.`

For multiple effects, define hierarchy:

- primary effect
- secondary debris or particles
- environment reaction

## Fast presets

| Use case | Reliable approach |
|---|---|
| Product ad | orbit or slow push, soft key, clean background |
| Dialogue | locked medium close-up, single speaker, steady face |
| Fight | reference video or one beat per shot, handheld or tracking |
| Landscape | static wide or slow aerial pullback |
| MV | rhythm-led motion, strong style anchor, beat-visible camera |
| Emotional beat | MCU/CU, locked or slow push, one expression transition (see [`performance-direction.md`](performance-direction.md)) |
