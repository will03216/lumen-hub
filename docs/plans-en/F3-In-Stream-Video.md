# F3 · In-Stream Video

- **Creative essence**: pre-roll / mid-roll inside a video player, high viewer attention, room to tell a fairly complete story
- **P/B positioning**: B-leaning, can work as P&B (YouTube skippable is the workhorse)
- **Category direction**: brand / tech / FMCG (in-stream viewers have patience)
- **Brand references**: Apple, Samsung, Coca-Cola, P&G

## Core scenario

**Channel family: Video Ads (in-stream, inside the player).**
The user is **already watching a video, and the ad plays inside the player** (before or mid-roll). Because the viewer is already in "watching video" mode and has some patience, these ads can tell a more complete brand story or feature demo than feed ads. They split into "skippable" (needs a strong hook in the first 5–10s to prevent skips) and "non-skippable" (a fixed ≤15s that must say everything). Predominantly 16:9 landscape, this is the home turf of brand TVCs and product explainers.

## Ad types across platforms

| Platform | Ad type (placement name) | Ratio · duration | Platform-specific notes |
|---|---|---|---|
| YouTube | **Skippable in-stream** | 16:9 / 12–60s | Strong hook in the first 5–10s to prevent skips + an explicit CTA; the workhorse general placement |
| YouTube | **Non-skippable** | 16:9 / ≤15s | Must say everything in a fixed duration, no remarketing possible; brand-reach leaning |
| Meta | **In-Stream (Facebook Watch)** | 16:9 or 1:1 / 5–15s | **Does not support 9:16 vertical** — vertical gets rejected; keep duration under 15s |

> General: YouTube ads must have an audio track or they get rejected. "30s single-shot" can carry a complete narrative and "multilingual" can produce multi-market versions.

> Sign-off rule: change `- [ ]` to `- [x]` in front of the 1 Branding + 1 Performing you finally select.

> Shared setup (6 cases, each using a **real, archetypal brand** that fits the play, no repeats): tech/FMCG categories (in-stream viewers have patience and can absorb complete information), prompt scene descriptions written in English, **all voiceover / narration / captions in English (overseas media buying)**; ratio **16:9 landscape** (Meta In-Stream also accepts 1:1; neither supports 9:16).
> Durations planned against **Seedance 2.5 (up to 30s in a single generation)**: brand-led narratives stretch to 20–30s, the non-skippable tier compresses to ≤15s.
> **Caption rule (global)**: Chinese/English captions can stay (rendering is fairly reliable); **for any language other than Chinese and English, add no captions or on-screen text at all** (small-language captions have a high error rate) — the information moves to voiceover + visuals + the product logo instead.
> Prompts have been optimized per the seedance-2-0 skill spec (Shot-N multi-shot syntax + verb physics + 3-beat timing + anti-plastic materials + atmosphere reliability + duration math).
> **Shot-count tiers (2.5 now supports 30s in a single generation, breaking the old skill's "≤3 shots" limit)**: 30s → 5–6 shots, 20s → around 4 shots, 15s → 3 shots; open it up as the narrative requires rather than padding (more shots means each one is more rushed and cross-shot consistency risk goes up).
> ⚠️ Notes: ① YouTube ads must have an audio track; ② naming a real brand directly can cause its logo/product appearance to be flagged by content moderation or rendered incorrectly — where accuracy matters, switch to "generic description + upload a real product photo as reference"; ③ the current seedance-2-0 submission script caps duration at 15s (2.0), so 30s must go through the 2.5 API with separate parameters.

## Branding

### B1 | "30s brand story" — a manifesto film with a full emotional arc · Brand: adidas

- **Brand**: adidas (the benchmark for emotional brand story films, the Impossible Is Nothing athletic-inspiration narrative)
- **Play positioning**: Branding — carries the brand spirit through a small inspirational story of an ordinary person persevering, with the running shoe woven in naturally rather than pushed
- **Best placement**: YouTube skippable in-stream (16:9, viewers have the patience for a full narrative)
- **Parameters**: ratio 16:9 · duration 30 · generate_audio True
- **Duration math**: 6 shots × ≈5s (setback → looking up → pushing off → charging the hill → reaching the top → release, one beat/action per shot, taking the max of action and camera) → about 30s, using the full 2.5 single-shot capability
- **Seedance 2.5 capabilities**: 30s single-shot + human performance + motion rhythm
- **Shot count**: 30s tier → 6 shots (breaking the old 3-shot limit for a more complete narrative)

**Prompt:**

```
A 30-second adidas brand story film about an ordinary runner's moment of "I can't go on, but I won't quit" — sincere, powerful emotion, with the running shoes woven in naturally rather than pushed. Cinematic lighting, cool-toned pre-dawn shifting to warm golden daybreak, shallow depth of field, pacing that builds from heavy to soaring. English throughout (where there is narration). The same ordinary middle-aged runner in black-and-white three-stripe adidas running shoes carries through the whole film, consistent in appearance.
Shot 1 (≈5s): On a city street before dawn, the runner labors through the rain, footfalls heavy, each step kicking up spray, breath coming fast and visible as white mist. Medium side-angle follow shot, cool blue morning light, rain slanting through the beams of the street lamps. Rapid footfalls, panting, rain.
Shot 2 (≈5s): At the foot of a long hill he slows, hands braced on his knees, gasping, looking up at the steep long climb, brows tight, hesitation in his eyes. Medium close-up, cool blue light, shallow depth of field. Panting, distant rain.
Shot 3 (≈5s): Close-up — the three-stripe adidas shoes stop on the slick road surface, water dripping off the uppers; cut to a close-up of his face as he wipes the rain away, jaw set, drawing a deep breath. Hard side light. One heavy inhale, an inspirational string line rising faintly.
Shot 4 (≈5s): He steps off again, charging up the hill, the adidas shoes driving into the ground, the tread pattern clearly gripping the road, body pitched forward, arm swing widening. Low-angle follow shot rising slowly, the sky brightening. Footfalls shifting from heavy to quick, strings building.
Shot 5 (≈5s): He crests the hill just as dawn breaks on the horizon, golden morning light washing over him; he stops, hands on his hips, breathing hard. Slow medium orbit, warm gold backlight. Panting, strings pushing toward the peak.
Shot 6 (≈5s): A relieved, resolute smile lifts the corner of his mouth as he looks out at the distant city skyline; the frame holds on his silhouette and the three-stripe adidas shoes at his feet, the English slogan "Impossible Is Nothing" and the adidas three-stripe mark fading in at the center. Medium close-up hold, warm gold morning light. Strings resolve.
No price and no hard CTA throughout — emotion and brand spirit come first; 16:9 landscape, human performance and movement authentic and natural, no superimposed captions, no watermarks.
```

### B2 | "Product aesthetics film" — light and shadow across the car body, pure brand tone · Brand: Mercedes-Benz

- **Brand**: Mercedes-Benz (the archetype of premium automotive brand aesthetics)
- **Play positioning**: Branding — no voiceover, no price, no CTA; builds a premium brand aura through body surfaces and moving light bands
- **Best placement**: YouTube skippable in-stream / Meta In-Stream (16:9)
- **Parameters**: ratio 16:9 · duration 20 · generate_audio True
- **Duration math**: 4 shots (dark set lighting up / light band sweeping the body / wheel close-up / driving reveal, ≈5s each, taking the minimum of camera motion) → about 20s
- **Revision note**: the original B&O speaker's honeycomb grille and precision perforation is a high-density perforated structure that models tend to render as messy voids; switched to **a car body surface + light bands** (large solid reflective surfaces), a direction models handle well and a classic, highly reliable brand-film approach.
- **Seedance 2.5 capabilities**: 5 quality pillars (lighting quality) + motion rhythm
- **Shot count**: 20s tier → 4 shots

**Prompt:**

```
A 20-second automotive brand aesthetics film: minimal, premium, no voiceover, no text — building the Mercedes-Benz premium aura purely through body surfaces and moving light. A dark studio background transitioning outdoors, cinematic lighting, shallow depth of field, pacing that builds from heavy to soaring.
Shot 1 (≈5s): In a pitch-dark studio, the front end of a matte dark Mercedes-Benz sedan gradually lights up out of the darkness — first the slim LED daytime running lights, then the main headlamps blazing on — the three-pointed star emblem emerging clearly in the light. Locked medium close-up, a single hard light source, strong light-and-shadow contrast. A low-frequency engine ignition sound rising.
Shot 2 (≈5s): A soft strip of light sweeps slowly along the flowing surface of the car's flank, tracing the dimensional shoulder line and sheen of the matte paint, the reflection flowing across the finish. Slow lateral move following the light band, dark palette. Low-frequency ambience continuing.
Shot 3 (≈5s): Close-up — a multi-spoke wheel turns slowly, the metallic highlights on its edges and the details of the brake caliper crisp; the camera then rises across the crisp three-pointed star emblem on the door. Slow macro lateral move, hard side light. Fine tire and metal sounds.
Shot 4 (≈5s): Cut outdoors to a coastal highway at dusk, the sedan cruising steadily, its body bathed in warm golden sunset, the wheels spinning into motion blur; the frame finally holds on a full side profile of the vehicle, emblem crisp. Medium side-angle follow shot rising slowly, warm gold backlight. Driving wind, the instrumental building to a peak and resolving.
No voiceover, no price and no CTA throughout, 16:9 landscape, paint and metal textures authentic and premium, the brand name presented naturally through the emblem, no superimposed captions, no watermarks.
```

### B3 | "15s complete message" — non-skippable, everything said once · Brand: Coca-Cola

- **Brand**: Coca-Cola (the archetype of FMCG brand reach / emotional resonance)
- **Play positioning**: Branding — built for the non-skippable tier, telling a complete emotional brand arc tightly within 15s
- **Best placement**: YouTube non-skippable in-stream (16:9 / ≤15s)
- **Parameters**: ratio 16:9 · duration 15 · generate_audio True
- **Duration math**: 3 shots × ≈5s (gathering → opening and drinking → toast hold, one beat each) → about 15s
- **Seedance 2.5 capabilities**: 30s single-shot + motion rhythm + 5 quality pillars (physical interaction)

**Prompt:**

```
A 15-second non-skippable brand film, briskly paced and warm in feeling, about "the happy moment of sharing a Coke". Warm summer dusk light, filmic texture, airy imagery. English throughout (where there is narration).
Shot 1 (≈5s): A group of young friends gather on a rooftop; a hand lifts a glass Coca-Cola bottle beaded with ice and condensation out of an ice bucket, droplets sliding down the bottle. Medium shot pushing in, warm gold dusk light, shallow depth of field. Laughter and summer ambience.
Shot 2 (≈5s): The cap pops off with a hiss, bubbles surging up instantly as the Coke pours into a glass full of ice, the amber liquid tumbling and fizzing. Close-up, backlight making the bubbles glisten. A crisp bottle-opening sound and fizzing.
Shot 3 (≈5s): The friends clink glasses and burst into laughter; the frame holds on the splashing bubbles at the moment of the toast, with the English slogan "Taste the feeling." and the classic Coca-Cola red logo fading in at the center. Medium shot, warm light. Upbeat music driving to a beat and resolving.
No price and no hard CTA throughout — emotional resonance comes first; 16:9 landscape, bubble and droplet physics authentic, no captions or watermarks.
```

## Performing

### P1 | "Anti-skip hook in the first 5s" — strong benefit → demo → CTA · Brand: Samsung Galaxy

- **Brand**: Samsung Galaxy (the archetype of tech performance advertising and feature hooks)
- **Play positioning**: Performing — skippable tier, using a strong benefit in the first 5s to avoid the skip, then demoing selling points before the CTA
- **Best placement**: YouTube skippable in-stream (16:9)
- **Parameters**: ratio 16:9 · duration 20 · generate_audio True
- **Duration math**: 4 shots (0–5s strong hook ≈5s; night-mode demo ≈5s; waterproof demo ≈5s; CTA ≈5s) → about 20s
- **Seedance 2.5 capabilities**: 5 quality pillars + English captions
- **Shot count**: 20s tier → 4 shots

**Prompt:**

```
A 20-second skippable performance ad that must grab attention in the first 5 seconds to avoid the skip, stating the tech selling points plainly. Bright, crisp, high-tech imagery, fast-cut editing. English throughout.
Shot 1 (≈5s): The hook — a hand raises a Samsung Galaxy phone and shoots the distant stage at a pitch-dark concert; on the screen, the far-away singer is instantly magnified with every detail crisp. Emphatic English voiceover: "Zoom in. See everything.", with matching English on-screen text at the top. Extreme close-up on the phone screen, cool stage lighting. Crowd cheers.
Shot 2 (≈5s): Night-mode demo — the same phone shoots a dim street, the image on screen instantly turning bright and clear with the noise gone. English voiceover: "Night mode turns dark into bright." Alternating medium close-ups and screen close-ups, dark-toned street lighting.
Shot 3 (≈5s): Waterproof demo — the phone is placed in clear water and keeps shooting with the screen lit, droplets rolling across the body, the display crisp and unaffected. English voiceover: "Built tough, water-ready." Close-up, cool-toned water light. Crisp water sounds.
Shot 4 (≈5s): The Samsung Galaxy phone hovers centered, rotating slowly, with a large English CTA at the bottom: "Shop now", English voiceover: "Get yours today." Medium shot with a slight push in, bright product lighting. Closing beat sound effect.
English voiceover and English captions throughout, 16:9 landscape, no watermarks.
```

### P2 | "Feature demo to purchase" — core features demonstrated clearly · Brand: GoPro

- **Brand**: GoPro (action cameras, the archetype of feature-demo performance advertising)
- **Play positioning**: Performing — demonstrates the core features (stabilization / waterproofing / wide angle) with striking action footage, paired with selling points and a CTA
- **Best placement**: YouTube skippable in-stream / Meta In-Stream (16:9)
- **Parameters**: ratio 16:9 · duration 20 · generate_audio True
- **Duration math**: 4 shots (stabilization hook demo ≈5s; waterproof dive ≈5s; wide-angle POV ≈5s; selling point + CTA ≈5s) → about 20s
- **Revision note**: the original Dyson vacuum's cyclone bin, dust pickup and crevice cleaning are small-particle physics demos with a high model failure rate; switched to GoPro action footage (stabilization / waterproofing / wide angle), where the footage *is* the selling point and the model performs well.
- **Seedance 2.5 capabilities**: 5 quality pillars + motion rhythm + English captions

**Prompt:**

```
A 20-second GoPro feature-demo performance ad that states the camera's selling points plainly through striking, authentic action footage. Bright, airy outdoor sports settings, fast-cut editing. English throughout.
Shot 1 (≈5s): The hook — a mountain biker wearing a GoPro charges down a rugged trail, the POV footage violently jolted yet still stable and smooth, dirt and gravel spraying from under the wheels. Emphatic English voiceover: "Rough ride. Smooth footage.", with English on-screen text at the top. Alternating POV and follow shots, bright daylight. Tires grinding over dirt, wind.
Shot 2 (≈5s): A surfer carrying a GoPro dives into a blue wave, the camera plunging underwater with them, bubbles churning, the image staying crisp and bright with no water intrusion. Underwater POV, cool blue translucent water light. Water and bubble sounds.
Shot 3 (≈5s): A skateboarder leaps on a city rooftop, the GoPro ultra-wide angle capturing the entire skyline and the airborne moment together, with slight fisheye tension at the edges. Low-angle wide follow shot, warm gold sunset. The board landing.
Shot 4 (≈5s): A GoPro camera hovers centered, rotating slowly, the waterproof rubber body and lens details crisp, with a large English CTA at the bottom: "Shop now", English voiceover: "Capture it all. Get yours." Medium shot with a slight push in, bright product lighting. Closing beat sound effect.
English voiceover and English captions throughout, 16:9 landscape, action footage authentic and full of tension, no watermarks.
```

### P3 | "Limited-time offer / free trial stated plainly" — hook → benefit → CTA · Brand: Spotify

- **Brand**: Spotify (digital subscription, the archetype of free-trial conversion)
- **Play positioning**: Performing — the most typical skippable performance ad: the hook states "free trial" plainly, benefits are covered fast, and a strong CTA at the end drives conversion
- **Best placement**: YouTube skippable in-stream (16:9)
- **Parameters**: ratio 16:9 · duration 15 · generate_audio True
- **Duration math**: 3 shots (hook voiceover ≈4s; benefit demo ≈6s; CTA ≈5s) → about 15s
- **Seedance 2.5 capabilities**: 5 quality pillars + English captions
- **Note**: the multilingual / multi-market showcase is already covered by F1 P3 (the Nivea 30s compilation), so it isn't repeated here; this piece focuses on plain-spoken conversion in a single English-speaking market.

**Prompt:**

```
A 15-second skippable performance ad that states the "Premium free trial" plainly in a three-part hook—benefit—CTA structure, clearly conversion-oriented. Bright, youthful, high-tech imagery, brisk pacing. English throughout.
Shot 1 (≈4s): The hook — a young person puts on headphones and opens the Spotify interface; a bold "3 months free" pops up on the screen. Their eyes light up, they nod gently to the beat and look into the camera, saying in English: "Three months of Premium, free.", with matching English on-screen text at the top. Medium close-up, bright airy light, shallow depth of field. Clear ambience with a low music bed.
Shot 2 (≈6s): A fast benefit demo — playlists scroll smoothly on the phone screen, one tap skips a track, no ads interrupt; the frame then cuts to commuting, running and home settings, all with seamless listening. English voiceover: "Millions of songs, zero ads, offline anywhere." Alternating medium close-ups and screen close-ups, bright light.
Shot 3 (≈5s): The green Spotify interface sits centered, with a large English CTA at the bottom: "Start your free trial", English voiceover: "Start today, cancel anytime." Medium shot with a slight push in, bright product lighting. Closing beat sound effect.
English voiceover and English captions throughout, 16:9 landscape, no watermarks.
```
