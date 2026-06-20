# Character Card — identity is a contract, not a headshot

A single headshot is **not** a character card. It locks the face from one
angle and leaves everything else — body, silhouette, wardrobe, materials,
other angles, other expressions — for the model to guess, differently in
every shot. That guess is where identity drift comes from.

A character card is an **identity contract**: a small set of reference images
plus a written identity block, designed so that every shot in the project can
re-derive the same person.

---

## Card anatomy

For a hero character, build these layers (in priority order):

1. **Turnaround sheet** — full-body, neutral standing pose: front, 3/4, and
   profile (add back view if the costume's back matters). Same outfit, even
   soft light, clean background. This is the single highest-value asset:
   it constrains silhouette and body, not just face.
2. **Expression strip** — neutral + only the 3–5 emotions the story actually
   needs (e.g. restrained smile, suppressed anger, fear, grief, resolve).
   Pulled from the story's beat sheet, not a generic grid.
3. **Signature-detail closeups** — the one garment, accessory, prop, or weapon
   that defines the character, with materials named (brushed steel, cracked
   leather, raw silk).
4. **Palette** — 3–5 color swatches (wardrobe + accent). Reused by the
   colorist layer of the prompt.
5. **Written identity block** — one sentence that travels verbatim into every
   prompt of the project:

```
The [role] [imageN] — [age band / build / silhouette], [feature 1],
[feature 2], [feature 3], wearing [wardrobe lock].
```

> Example: `The courier [image1] — wiry woman in her late 20s, silver bob cut,
> thin scar through the left eyebrow, crimson scarf, knee-length charcoal coat.`

The written block is **redundancy by design** (belt and suspenders): if the
model under-weights the image reference in a given shot, the text catches the
drift — and vice versa.

## The 3-feature rule

Pick exactly three distinguishing features, and pick ones that **render at
medium-shot distance**. Silhouette beats detail.

| ✅ Renders | ❌ Won't survive generation |
|-----------|------------------------------|
| Silver bob cut | Heterochromia |
| Crimson scarf | A thin ring on one finger |
| Scar through the left eyebrow | Embroidered initials on a cuff |
| Asymmetric long coat | A specific tattoo pattern |

If a sub-pixel detail matters to the story, give it its own ECU insert shot —
don't rely on it carrying identity.

---

## Building the card with Seedream

Generate the card before any video work (use the `Seedream` skill):

1. **Hero front view** — T2I or from the user's supplied photo.
2. **Turnaround** — I2I from the front view: *"same character, full-body
   character reference sheet, front view / three-quarter view / profile view,
   neutral standing pose, flat even lighting, plain light-gray background,
   identical outfit in all views."*
3. **Expression strip** — I2I: *"same character, 6-panel expression sheet:
   neutral, restrained smile, suppressed anger, fear, grief, determination.
   Head-and-shoulders, identical lighting, plain background."*
4. Verify consistency between panels **before** spending video budget. A bad
   card poisons every clip downstream.

### Reference-slot budget

`image_urls` accepts up to 9 images — spend them deliberately:

| Character tier | Slots |
|----------------|-------|
| Hero character | 2–3 (turnaround + expression strip, + signature prop if critical) |
| Secondary character | 1 (single combined sheet) |
| Background/crowd | 0 — text description only |

## Upload & binding

- Character cards contain human likenesses → **`asset://` upload is mandatory**
  (see [`assets.md`](assets.md)), even for AI-generated faces.
- Bind with `[imageN]` at first introduction, inside the identity block.
- Re-tag at identity-critical beats (close-ups, scale changes) — see
  [`prompt-guidance.md`](prompt-guidance.md) reference indexing.

## Multi-character scenes

- One card per character, separate slots. Never share a sheet between two
  characters.
- Never use bare pronouns once two characters are in frame — repeat role names
  (`the courier`, `the broker`).
- Fix screen geography in the prompt (`the courier stays frame-left, the
  broker frame-right`) and keep it across shots — see the 180° axis rule in
  [`continuity-and-editing.md`](continuity-and-editing.md).

## Cross-clip reuse

Keep a **character bible** folder per project: card images + the identity
block text. In every call of the project:

- same `asset://` IDs, same argument order where possible;
- identity block pasted verbatim (do not paraphrase it — paraphrase is drift);
- wardrobe state changes (torn sleeve, dirt, injury) tracked in the
  continuity ledger and written as *deltas from the card*: "as in [image1]
  but the coat's left sleeve is torn".
