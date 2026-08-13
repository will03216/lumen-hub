# F2 · Landscape / Square Feed Video

- **Creative essence**: 4:5 or 1:1 feed video, autoplays muted + caption-driven demo, large screen footprint, hook in the first 3s
- **P/B positioning**: P&B (works for both performance and brand)
- **Category direction**: beauty / skincare (the most typical case of muted feed autoplay + a strong demo)
- **Brand references**: L'Oréal, CeraVe, Glossier

## Core scenario

**Channel family: Social Ads.**
Video ads people see while **scrolling the main feed of image and text posts**. Unlike full-screen vertical, video in the feed sits among posts from friends and brands, plays muted by default and gets scrolled past fast — so you need **4:5 / 1:1 to fill the screen + strong captions + a hook in the first 3 seconds** to make the message understandable from the visuals alone. It suits product demos and plainly stated benefits, and it is Meta's most basic, most universal video placement.

## Ad types across platforms

| Platform | Ad type (placement name) | Ratio · duration | Platform-specific notes |
|---|---|---|---|
| Meta (FB/IG) | **Feed video ads** | 4:5 or 1:1 / 15–60s | Muted by default so captions are mandatory; 4:5 gives the largest mobile screen footprint, 1:1 is the safest across placements; safe zones roughly 14% top / 20% bottom; 9:16 gets cropped in the feed |

> Note: landscape/square feed video is primarily a Meta Feed scenario; TikTok and YouTube are vertical-first on mobile (see F1). A single demo film can be derived into multi-caption / multi-market variants for A/B testing using "local editing + multilingual".

> Sign-off rule: change `- [ ]` to `- [x]` in front of the 1 Branding + 1 Performing you finally select.

> Shared setup (6 cases, each using a **real, archetypal brand** that fits the play, no repeats): beauty/skincare category, prompt scene descriptions written in English, **all voiceover / narration / on-screen text / captions in English (overseas media buying)**; ratio **4:5 or 1:1** (feed placement, 9:16 would be cropped), autoplays muted so captions are mandatory, safe zones roughly 14% top / 20% bottom.
> Durations planned against **Seedance 2.5 (up to 30s in a single generation)**: brand-led pieces can stretch to 20–30s, performance-led pieces stay tight.
> **Caption rule (global)**: Chinese/English captions can stay (rendering is fairly reliable); **for any language other than Chinese and English, add no captions or on-screen text at all** (small-language captions have a high error rate) — the information moves to voiceover + visuals + the product logo instead.
> Prompts have been optimized per the seedance-2-0 skill spec (Shot-N multi-shot syntax + verb physics + 3-beat timing + anti-plastic materials + atmosphere reliability + duration math).
> ⚠️ Notes: ① naming a real brand directly can cause its logo/packaging text to be flagged by content moderation or rendered incorrectly — where logo accuracy matters, switch to "generic description + upload a real product photo as reference"; ② the current seedance-2-0 submission script caps duration at 15s (a 2.0 constraint), so 30s must go through the 2.5 API with separate parameters at submission time.

## Branding

### B1 | "The world inside one drop of serum" — texture and atmosphere, no voiceover, pure brand · Brand: Estée Lauder

- **Brand**: Estée Lauder (Advanced Night Repair serum, the archetype of premium texture)
- **Play positioning**: pure Branding — no voiceover, no price, no CTA; builds brand tone through macro texture, light and shadow
- **Best placement**: Meta Feed (4:5 for the largest screen footprint)
- **Parameters**: ratio 4:5 · duration 15 · generate_audio True
- **Duration math**: 3 texture shots (drop / envelopment / rest, ≈5s each, taking the max of macro and camera motion) → about 15s
- **Seedance 2.5 capabilities**: 5 quality pillars (lighting + small-object physical interaction)

**Prompt:**

```
Shot 1 (≈5s): Extreme macro — a drop of amber Estée Lauder serum hangs slowly from the mouth of a glass dropper, breaks away and falls, landing on a still water surface and kicking up a tiny splash and concentric ripples, light passing through the amber liquid and refracting warm gold flecks. Locked macro camera, even diffused light, warm amber palette, shallow depth of field. The crisp fine sound of a droplet hitting water.
Shot 2 (≈5s): The serum diffuses slowly across the water in fine wisps, and the dark brown glass bottle rises slowly into the center of frame, sheen flowing across its frosted glass surface. The camera pushes in extremely slowly, warm gold side light outlining the bottle. Minimal rippling water sound.
Shot 3 (≈5s): The camera pulls slowly back; the Estée Lauder bottle rests centered above its reflection on the water, a highlight sweeping gently across the metal of the dropper, the small words "Estée Lauder" fading in at the bottom. Slow pull-back, quiet and premium. The instrumental resolves on a closing note.
No voiceover, no price and no CTA throughout, 4:5 filling the screen, the frame clean and lyrical, no captions or watermarks.
```

### B2 | "Morning ritual" — lifestyle narrative, emotionally soothing · Brand: Fenty Beauty

- **Brand**: Fenty Beauty (the archetype of a diverse, inclusive tone)
- **Play positioning**: Branding — lifestyle narrative, soft sell, logo left at the end
- **Best placement**: Meta Feed (4:5)
- **Parameters**: ratio 4:5 · duration 20 · generate_audio True
- **Duration math**: 4 morning-routine shots × ≈5s (one skincare action per shot, taking the max of camera follow and action) → about 20s
- **Seedance 2.5 capabilities**: 30s single-shot + human performance

**Prompt:**

```
Shot 1 (≈5s): A young woman with deep skin tone wakes in a bedroom flooded with early sunlight, stretches and walks toward her vanity, morning light through sheer curtains casting soft dappled patches on her skin. Slow medium follow shot, warm gold morning light, airy frame. Gentle ambience and a soothing morning music bed.
Shot 2 (≈5s): She squeezes Fenty Beauty cream onto her fingertips, dots it on her forehead, cheeks and chin, then works it upward in circles with her fingertips; the balm is pushed into a translucent film, her skin showing a natural glow and real pores. Medium close-up, warm side light, shallow depth of field. Soft application sound.
Shot 3 (≈5s): She pats her face to help absorption, smiling naturally into the mirror with relaxed eyes, morning light moving across her face. Medium close-up, natural light. The music bed rises.
Shot 4 (≈5s): She pulls the curtains open to let the sunlight pour in; the frame holds on her relaxed profile and the Fenty Beauty cream on the vanity, the small words "Fenty Beauty" fading in at the bottom. Slow medium pull-back, warm gold backlight. The instrumental resolves.
No hard selling points, no price and no CTA throughout — emotion and tone come first; English captions (if any), 4:5 filling the screen, authentic with no skin smoothing, no watermarks.
```

### B3 | "Texture as proof" — macro realism, brand-grade craft · Brand: La Mer

- **Brand**: La Mer (the archetype of ultra-luxury texture)
- **Play positioning**: Branding — uses extreme macro of real skin texture and the product's film-forming quality to convey an "authentic luxury" brand point of view
- **Best placement**: Meta Feed (1:1 is safest across placements)
- **Parameters**: ratio 1:1 · duration 15 · generate_audio True
- **Duration math**: 3 macro push-ins (texture / scoop / film, ≈5s each) → about 15s
- **Seedance 2.5 capabilities**: 5 quality pillars (lighting + photorealism)

**Prompt:**

```
Shot 1 (≈5s): Extreme macro sweeping slowly across a patch of real skin, natural pores, fine vellus hair and a soft sheen visible, the skin texture authentic with no smoothing. Slow macro lateral move, soft top light, shallow depth of field. Minimal near-silent ambience.
Shot 2 (≈5s): A finger scoops a thick, rich dollop of cream from a cream-white frosted La Mer jar; the balm mounds on the fingertip, its edge collapsing slightly, the fine texture and highlights of the cream clearly visible. Slow macro follow, warm diffused light. Soft tacky sound of the scoop.
Shot 3 (≈5s): The cream is worked slowly across the skin by fingertips into a hydrated thin film, the skin turning from matte to translucent and glowing; the camera then pulls slowly back, the frosted white La Mer jar resting centered, a highlight sweeping across the lid, the small words "La Mer" fading in at the bottom. Slow pull-back. Closing instrumental note.
No voiceover, no price and no CTA throughout, 1:1 composition, texture authentic and premium, no captions or watermarks.
```

## Performing

### P1 | "3-second contrast before/after" — split-screen hook, selling points in captions · Brand: Olay

- **Brand**: Olay (the archetype of anti-aging / firming demos)
- **Play positioning**: Performing — 3s contrast hook, selling point stated plainly, explicit CTA
- **Best placement**: Meta Feed (4:5)
- **Parameters**: ratio 4:5 · duration 15 · generate_audio True
- **Duration math**: 3 shots (split-screen hook + entry ≈3s; demo 3 beats ≈5s; comparison + CTA ≈4s, plus tail) → about 15s (rounded to 15 including entry buffer)
- **Seedance 2.5 capabilities**: 5 quality pillars + local editing for multi-selling-point variants

**Prompt:**

```
Shot 1 (≈4s): The frame splits left and right — on the left a patch of dry, dull cheek skin with fine lines, on the right the same patch hydrated, firm and brightened, a crisp dividing line between them, with large English on-screen text popping up at the top: "7 days. See the difference." Extreme close-up, bright frontal light. A crisp alert sound effect.
Shot 2 (≈6s): The camera cuts to the whole cheek as a hand spreads Olay cream across it; once the balm covers the skin the texture smooths out and a glow gradually comes through, the change on the same area clearly visible. English voiceover at a slightly fast clip: "Olay smooths fine lines and firms in a week." Medium close-up, hard frontal light. Fast application sound.
Shot 3 (≈5s): The Olay bottle sits centered filling 60% of the frame, the left/right before-and-after split screen returning, with a large English CTA at the bottom: "Shop now", English voiceover: "Get yours today." Medium close-up with a slight push in, bright product lighting. Closing beat sound effect.
English voiceover and English captions throughout (readable with sound off), 4:5 filling the screen, no over-smoothing of skin, no watermarks.
```

### P2 | "Pain-point question opening" — pain point → demo → CTA · Brand: Neutrogena

- **Brand**: Neutrogena (the archetype of efficacy-led mass dermo-cosmetics)
- **Play positioning**: Performing — pain-point question as the hook, demo as the solution, price + CTA end card
- **Best placement**: Meta Feed (4:5)
- **Parameters**: ratio 4:5 · duration 15 · generate_audio True
- **Duration math**: 3 shots (pain-point question voiceover + entry ≈4s; brightening demo ≈6s; price + CTA ≈5s) → about 15s
- **Seedance 2.5 capabilities**: multilingual captions + 5 quality pillars

**Prompt:**

```
Shot 1 (≈4s): A young woman examines her dull, tired face in the mirror, brows slightly furrowed, asking in English with resignation: "Still fighting dull, tired skin?", with matching English on-screen text at the top. Medium close-up, natural window light at home, realistic skin texture. Quiet indoor room tone.
Shot 2 (≈6s): She applies Neutrogena cream to her face, pressing and working it upward with her fingertips, the skin gradually brightening from dull and revealing a healthy glow, the change natural and believable. English voiceover: "Neutrogena brightens and hydrates, all day." Medium close-up, bright window light, shallow depth of field. Soft application sound.
Shot 3 (≈5s): The Neutrogena bottle sits centered, a price tag and a large English CTA "Shop now" appearing beside it, the woman smiling with satisfaction into the mirror, English voiceover: "Try it today." Medium close-up with a slight push in, bright product lighting. Closing beat sound effect.
English voiceover and English captions throughout, 4:5 filling the screen, authentic with no over-smoothing, no watermarks.
```

### P3 | "One master, many captions for A/B" — multiple hook variants on the same film · Brand: Garnier

- **Brand**: Garnier (mass-market FMCG, the archetype of variant testing)
- **Play positioning**: Performing — the same demo master paired with several different hook on-screen texts/captions for A/B testing, reserving space for batch derivation via local editing
- **Best placement**: Meta Feed (4:5, launched with multiple assets under Advantage+)
- **Parameters**: ratio 4:5 · duration 15 · generate_audio True (hook on-screen text swapped later via local editing)
- **Duration math**: 3 shots (hook text + entry ≈3s; demo + voiceover ≈7s; CTA ≈5s) → about 15s
- **Seedance 2.5 capabilities**: local editing (batch hook swaps) + multilingual

**Prompt:**

```
Shot 1 (≈3s): A hand picks up the green-packaged Garnier cream and holds it toward the camera, a clean area reserved at the top of frame where the English hook text "Hydration that lasts." fades in (this area is a swappable module used for multiple A/B hook versions). Locked medium close-up, bright airy frontal light. Clear indoor room tone.
Shot 2 (≈7s): She works the cream into her cheek in circles, the balm pushed into a translucent film and the skin revealing a hydrated glow, intercut with close-ups of the fingertip scoop and the application. English voiceover: "Melts in fast, keeps skin fresh all day." Alternating medium close-ups and close-ups, bright window light. Soft application sound.
Shot 3 (≈5s): The Garnier bottle sits centered filling 60% of the frame, with a large English CTA at the bottom: "Shop now", the woman nodding with satisfaction. English voiceover: "Grab yours." Medium close-up with a slight push in, bright product lighting. Closing beat sound effect.
The top hook text and the voiceover are swappable modules, making it easy to derive multiple A/B versions via local editing; English captions throughout, 4:5 filling the screen, no over-smoothing of skin, no watermarks.
```
