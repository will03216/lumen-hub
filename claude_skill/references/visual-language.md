# Visual Language — telling the story with the frame, not the dialogue

The invisible craft: what the frame *means* independent of what's said. Motif,
symbolism, where the camera's allegiance lies, how depth and distance encode
power, whose eyes we see through, and how the frame's shape itself feels.
Every principle below maps to plain prompt language.

---

## 1. The frame shape (aspect ratio as emotion)

Ratio is a creative choice before it's a delivery container. State the ratio
*and* its reason; compose to it.

| Ratio | Reads as | Compose for |
|-------|----------|-------------|
| **2.39:1** scope | epic scale, isolation, horizontal sweep | wide negative space dwarfing the subject; keep the hero large enough to survive generation |
| **1.85:1** | modern theatrical, balanced | room for performance without scope's extremity |
| **16:9** | web/broadcast default | strongest general cinematic frame |
| **4:3 / 1.33** | boxed-in, vintage, trapped | tight verticals, more headroom, the frame closing in |
| **1:1** | symmetrical, product, social grid | centered, balanced |
| **9:16** vertical | subjective phone-POV, faces, height | center the hero, simplify camera moves, avoid edge-critical action |

> 2.39:1 anamorphic scope, the figure tiny against a vast desert horizon, wide
> empty sky pressing down — composed to make him small.

For multi-crop campaign delivery (9:16 + 1:1 + textless versions), keep faces
and products away from edges and add text in post — full matrix in
[`aspect-ratio.md`](aspect-ratio.md).

## 2. Motifs & image systems

A **motif** is any element that gains meaning by repetition; an **image
system** is a patterned set of them. Plan one, plant it, repeat it subtly.

> Water motif: each turning point quietly features water — a dripping pipe,
> rain on glass, a half-full glass on the table — tied to memory.

> Image system of circles vs lines: the protagonist framed by circles
> (windows, wheels, rings); the antagonist by hard verticals (fences, towers).

Track the motif in the continuity ledger so it actually recurs across calls.

## 3. Visual symbolism (consistent, not on-the-nose)

Encode meaning in staging, not captions:

> When she lies, place her behind vertical bars in the environment — a chair
> back, stair rails, a window frame — suggesting self-imprisonment.

> After each moral compromise, lower the camera so the ceiling presses into
> frame, a weight bearing down.

## 4. Motivated vs unmotivated camera

A **motivated** move is driven by character or story (follows a glance, a
walk). An **unmotivated** move feels like an outside presence — use it
deliberately.

- Default: `camera moves only when motivated by the character's movement or
  eyeline; otherwise locked.`
- For dread/the supernatural: `unmotivated floating drift that moves even when
  the characters are still, as if the room is watching.`

Decide per shot whether the camera is the character's ally, a neutral
observer, or an intruding force.

## 5. Depth staging (foreground / midground / background)

Three active planes turn a frame into a relationship diagram — and it's the
single cheapest way to look "expensive" (see composition in
[`shot-design.md`](shot-design.md)).

- Foreground can frame or imprison: `out-of-focus wine glasses in the
  foreground, the couple arguing in midground, a door ajar in the background
  hinting at the exit.`
- Background can contradict foreground: `she smiles for the camera up front
  while, deep behind her, the movers carry the furniture out.`
- Power shifts via depth: `as she takes control, she moves to a large
  foreground while the boss recedes small into the background.`

## 6. Blocking & proxemics (distance = relationship)

Where bodies stand and how close they are *is* the subtext.

| Scheme | Reads as | Prompt |
|--------|----------|--------|
| Shared frame, bodies angled toward each other | intimacy, alliance | `the couple within arm's reach, in one frame, angled together` |
| Divided frame, opposite edges, a barrier between | conflict, disconnection | `a table edge between them, each pinned to opposite sides of the frame` |
| One stands, one sits; stander looms in foreground | dominance | `he stands looming in foreground, she sits small below` — invert later to flip power |

## 7. Point of view (alignment & suspense)

| POV | Effect | Prompt |
|-----|--------|--------|
| **Subjective / literal** | we become the character | `camera at her eye level and position; her hand enters frame; breathing audible` |
| **Objective** | detached observer | `neutral eye-level coverage, balanced framing, no privileged information` |
| **Omniscient** | dramatic irony — we know more than they do | `high overhead / surveillance angle revealing the trap she can't see` |

Restrict POV to build suspense (show only what the hero knows), then break to
omniscient at the twist.

---

## How this enters the prompt

These are **planning layers**, not extra paragraphs. For each shot, the
director decides: frame shape, any motif to plant, camera motivation, depth
plan, blocking, POV — then folds the *visible result* into the normal
6-component prompt as concrete nouns and staging. Never write the theory word
("symbolism", "Kuleshov") into the prompt; write what the camera sees.
