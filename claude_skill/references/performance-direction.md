# Performance Direction — emotion is a physical event, not an adjective

"She is sad" directs nothing. A director gives the actor a state, a trigger,
and a physical response. Prompt the model the same way: name the visible
behavior, never the abstract emotion.

---

## The arc rule

Every performance shot is a three-part arc:

```
ENTRY STATE → ON-SCREEN TRIGGER → EXIT STATE
```

- **One transition per shot.** Two emotional turns need two shots.
- **Write the trigger explicitly** — "as she reads the message…", "when the
  door clicks shut behind him…". A reaction without a cause reads as mannequin
  acting.
- ⚠️ **The trigger may be internal.** A remembered loss, a dawning realization,
  a held thought all work: "a memory surfaces and her composure cracks." Only
  add an *external* trigger (a sound, a light, a prop entering frame) when the
  scene already motivates one. **Never fabricate an unmotivated external cue —
  an off-screen phone glow, a random light flare, a door — just to satisfy the
  arc.** The model renders that invented cue literally (a stray lens flare, a
  weird flash) and it reads as an artifact, not motivation.
- The exit state should be *visible*: a changed posture, expression, or action
  the viewer can point at.

## Micro-expression vocabulary (prompt-ready)

| Region | Cues |
|--------|------|
| **Eyes** | blink rate quickens · eyes narrow · eyes widen a fraction · gaze drops · gaze darts to the door · stare held one beat too long · eyes well up without spilling |
| **Brows** | brows pull together · inner brow corners rise (grief) · single brow lifts (skepticism) · brief brow flash (recognition) |
| **Mouth / jaw** | lips press into a thin line · one corner of the mouth pulls up, suppressed · lower lip trembles once · jaw tightens · a visible swallow · teeth grit behind closed lips |
| **Nose / neck** | nostrils flare once · throat bobs · neck tendons tense |
| **Head** | chin drops · slight head tilt · slow turn away · a minute head shake |
| **Breath** | sharp inhale · held breath finally released · shaky exhale · breath fogs in the cold air |
| **Hands** | knuckles whiten on the strap · fingers drum once, then stop · reaching hand hesitates mid-air · grip loosens, the cup almost slips |

Chinese equivalents: see the 微表情 section in
[`vocabulary-zh.md`](vocabulary-zh.md).

## Shot size sets the performance scale

Match the acting instruction to what the lens can actually see:

| Shot size | Performance channel |
|-----------|---------------------|
| Wide | posture and blocking only — walks away, sinks into the chair, squares up |
| Medium | gesture + broad expression — hands, shoulders, clear smiles/frowns |
| MCU / CU | **micro-expression territory** — the table above lives here |
| ECU | a single feature — eyes welling, jaw clenching, fingers tightening |

Two hard rules:

- **Never write micro-expressions into a wide shot.** They won't render and
  the wasted words dilute the instructions that do.
- **Never write full-body action into an ECU.**

## The restraint principle

Screen acting is subtraction. The professional pattern is **suppressed emotion
plus one leaking detail**:

- ✅ "fights back tears, jaw set, one blink too many"
- ❌ "cries dramatically, very emotional"

Demonstrative acting ("screams in rage") reads as soap opera. Reserve full
release for the story's single peak beat — and even then, stage it in body
and voice, not adjectives.

> **Restraint is a default register, not a hard cap.** When the user explicitly
> asks for big, overt emotion ("very sad, tears streaming", "很难过很难过，眼泪
> 流下来"), that IS the peak beat — scale the performance UP to meet their
> amplitude. Stage it physically and richly (brows pulling in, eyes flooding,
> lower lip going, two tears spilling, a caught breath) — a *fuller cascade* of
> visible cues, not a single suppressed blink. Subtraction means "no adjectives,
> no mugging," NOT "always dial the feeling down below what was asked." Under-
> playing an explicit intense request is as wrong as overplaying a subtle one.
> **This applies in every mode — T2V drama, not only I2V.** "Crying
> dramatically" in a text-to-video brief still means visible open tears and an
> openly grieving face, not a quiet hitch; and a push-in to a tighter frame
> sells the build. Don't reserve the scale-up only for image-driven shots.

## Timing

From [`duration-calculus.md`](duration-calculus.md): a single expression
transition needs **3–5s**; a two-stage turn **5–7s**; a listener's reaction
insert **1.5–2.5s**. Three emotions in four seconds is a prompt bug.

## Worked patterns

**Grief reveal — MCU, 5s**
> She opens the letter. As her eyes track the first line, her breath catches;
> the page lowers slowly, her gaze drifting off-frame, eyes welling without
> spilling. Locked medium close-up, soft window key from the left.

**Suppressed anger — CU, 4s**
> He listens in silence, jaw tightening, nostrils flaring once. He exhales
> slowly through his nose and produces a thin, controlled smile. Static
> close-up, low-key single practical.

**Falling glance — MCU two-shot, 4s**
> Her gaze catches his across the counter, drops to her cup, then returns
> with a suppressed smile. Slow 10cm push-in, warm café window light.

**Fear escalation — CU, 5s**
> As the footsteps stop outside the door, her blinking stops; she holds her
> breath, eyes fixed on the handle, knuckles whitening around the phone.

## Avoid list

`emotional` · `very sad` · `happy expression` · `dramatic acting` ·
`crying loudly` (outside the story peak) · stacked emotions in one shot ·
reactions with no cause (internal cause is fine) · **unmotivated external
triggers invented to fill the arc** (a phantom light/sound/prop) ·
suppressing an emotion the user explicitly asked to be big.
