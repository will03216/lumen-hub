# F1 · Vertical Feed Short Video

- **Creative essence**: 9:16 full-screen immersive short video, native UGC feel, strong hook in the first 1–3s, stop the scroll
- **P/B positioning**: works for both P&B (the main battleground of social feeds)
- **Category direction**: beauty / personal care / food & beverage (demo-driven best sellers)
- **Brand references**: e.l.f., CeraVe, Oreo, Gymshark

> **Runnable version**: Studio → New project → **F1 · Vertical Feed Ad** (`vertical-feed-ad` in `lib/studio/templates.ts`) builds this plan as a canvas — upload a product photo, get a 9:16 key visual plus one Branding cut (B1, 20s) and one Performing cut (P1, 12s) on Seedance 2.5, at the plan's own durations. One deviation: brands are described generically rather than named, per the ⚠️ moderation note.

## Core scenario

**Channel family: Social Ads.**
Short-form video ads people see while **scrolling vertically with one thumb on a phone**. This is the most attention-dense environment on mobile — and also the easiest to scroll past — so the creative has to **look like native content rather than an ad from the very first frame**, holding the viewer with an extremely fast hook and a sense of authenticity. It is the single biggest placement on social platforms: highest volume, fastest iteration, effective across the whole funnel from awareness to conversion, and the scenario with the highest demand for Seedance assets.

## Ad types across platforms

| Platform | Ad type (placement name) | Ratio · duration | Platform-specific notes |
|---|---|---|---|
| Meta (IG/FB) | **Reels ads** | 9:16 / 15–30s | Mimic native Reels, trending audio + fast cuts; bottom safe zone ~35%; watermarks from other platforms strictly forbidden |
| Meta (IG/FB) | **Stories ads** | 9:16 / ≤15s | Ephemeral feel, stickers can be used for interaction; safe zones: 14% top / 20% bottom / 6% left and right |
| TikTok | **In-Feed Ads** | 9:16 / 9–15s | 1s hook, music is mandatory, imitating native UI is forbidden; safe zones: 150px top / 440px bottom / 150px right |
| TikTok | **Spark Ads** | Inherits the original post / no duration limit | Boosts an organic creator post, comes with built-in social proof, requires an authorization code |
| YouTube | **Shorts ads** | 9:16 / <60s | Native mobile vertical, grab attention within 3s; safe zones: 250px top / 340px bottom / 65px on each side; an audio track is mandatory |

> General: on sound, Meta/YouTube autoplay muted so captions are required, while TikTok plays with sound on by default so music is required; a single 9:16 master can be derived into cross-platform / cross-market variants using "multilingual + local editing".

> Sign-off rule: change `- [ ]` to `- [x]` in front of the 1 Branding + 1 Performing you finally select.

## Branding — the minority approach, and it plays differently: it runs on Reach & Frequency and Video Views objectives, aiming purely at exposure and brand memory rather than conversion. Think new-product teasers (Apple-style), but distinct from a traditional TVC (slow pace, pure atmosphere) — here it must wear the skin of a "native short video": still grab attention in the first 3 seconds, still vertical-native, still rhythmic; it just doesn't push selling points or hard CTAs, focusing instead on emotional resonance and brand memory.

> Shared setup (6 cases, each using a **real, archetypal brand** that fits the play, no repeats): all in the face-cream category, prompt scene descriptions written in English, **all voiceover / narration / on-screen text / captions in English (overseas media buying)**; all 9:16 vertical, native short-video texture, no platform watermarks. **All three Branding pieces: no price, no discount, no hard CTA like "buy now" — emotion and memory come first.**
> Durations planned against **Seedance 2.5 (up to 30s in a single generation)**: brand-led narratives stretch to 20–30s, performance-led pieces stay tight.
> **Caption rule (global)**: Chinese/English captions can stay (rendering is fairly reliable); **for any language other than Chinese and English (Arabic, Malay, Indonesian, Spanish, Japanese, etc.), add no captions or on-screen text at all** — small-language captions have a high error rate, so the information moves to voiceover + visuals + the product logo instead.
> Prompts have been optimized per the seedance-2-0 skill spec (Shot-N multi-shot syntax + verb physics + 3-beat timing + anti-plastic materials + atmosphere reliability + duration math).
> ⚠️ Notes: ① naming a real brand directly can cause its logo/packaging text to be flagged by content moderation or rendered incorrectly — where logo accuracy matters, switch to "generic description + upload a real product photo as reference"; ② the current seedance-2-0 submission script caps duration at 15s (a 2.0 constraint), so 30s must go through the 2.5 API with separate parameters at submission time.

### B1 | "Blending into native trends" — build affinity with a low ad-feel · Brand: Glossier

- **Brand**: Glossier (the archetype of native UGC / clean-girl tone)
- **Best placement**: TikTok In-Feed / Spark Ads (the native creator context fits best)
- **Parameters**: ratio 9:16 · duration 20 · generate_audio True
- **Duration math**: 4 slice-of-life shots × ≈5s (each shot ≈2 beats of voiceover/action + entry; taking the ≈5s minimum for a follow shot) → about 20s
- **Seedance 2.5 capabilities**: human performance + photorealism + 30s single-shot (long-take consistency)

**Prompt:**

```
Shot 1 (≈5s): A young woman with no makeup sits in front of the bathroom mirror, scooping a small dollop from a frosted Glossier tube of face cream with her fingertip, looking into the mirror and saying softly in English: "This is my no-makeup go-to." Medium close-up handheld with slight shake, early-morning side light slicing in through the window, skin showing natural pores and a soft glow, a matte ceramic sink with a toothbrush cup casually placed on it. Warm tone of voice, quiet early-morning room tone.
Shot 2 (≈5s): The same woman works the cream into her cheek in circles; the balm first mounds on the skin surface, then is pushed by her fingertips into a translucent film. She blinks naturally, corners of her mouth lifting, not looking at camera as if filming herself. Medium close-up follow shot, warm morning light, shallow depth of field. Soft rubbing sound of application.
Shot 3 (≈5s): She pulls on a jacket and tosses the Glossier cream into her canvas bag, tidying up while smiling into the camera and saying in English: "So easy to reapply on the go." Medium follow shot, indoor warm light transitioning to natural daylight at the doorway. Zipper sound, soft rustle of the bag.
Shot 4 (≈5s): She opens the door and walks toward the street, backlight turning her into a silhouette, strands of hair lifted by the wind; the frame finally settles on her relaxed profile with the frosted Glossier tube visible in her hand, and the small word "Glossier" gently fades in at the bottom right. Slow medium follow shot, warm golden backlight. Street ambience, a light lo-fi music bed underneath.
English voiceover and English captions throughout; overall a vertical native vlog texture, clean and airy imagery, no prices, no buy buttons, no watermarks from other platforms.
```

### B2 | "Product × natural elements mood film" — lyrical empty shots, pure brand tone · Brand: L'Oréal

- **Brand**: L'Oréal (the archetype of mass-market skincare with a premium feel)
- **Play positioning**: pure Branding — no voiceover, no price, no CTA; builds brand tone through lyrical imagery of the product with natural elements (petals / water / morning light)
- **Best placement**: Reels / TikTok In-Feed (mood-led mass reach)
- **Parameters**: ratio 9:16 · duration 15 · generate_audio True
- **Duration math**: 3 lyrical empty shots (falling petals / emergence from water / morning-light hold, ≈5s each, taking the max of camera and element motion) → about 15s
- **Revision note**: the original ASMR macro of cream stringing and spreading was too hard for the model (stringy/sticky textures and balm physics fail easily); switched to **highly reliable render elements** like water surfaces, petals and morning light for a much more stable output.
- **Seedance 2.5 capabilities**: 5 quality pillars (lighting quality) + motion rhythm

**Prompt:**

```
Shot 1 (≈5s): Pink-white petals drift down slowly from the top of frame, passing through a shaft of soft slanting morning light, spiraling gently as they fall, against a clean pale-beige background. The falling petals stir up tiny specks of light. Locked medium shot, soft morning side light, shallow depth of field, warm tone. Soothing instrumental and gentle ambience.
Shot 2 (≈5s): The petals drift down toward a still, shallow pool of water; the instant they touch it, rings of tiny ripples spread outward, and a white L'Oréal bottle with a gold cap rises slowly from the center of the water as the ripples expand, droplets sliding down the bottle and refracting warm gold light. The camera pushes in extremely slowly, soft light reflected on the water. The crisp sound of petals meeting water and rippling waves.
Shot 3 (≈5s): The camera slowly pulls back; the white L'Oréal bottle with the gold cap rests above its reflection on the water, morning light drawing a moving highlight across the metal cap, a few scattered petals floating around, the frame quiet and lyrical. Slow pull-back, warm gold morning light. The instrumental resolves on a closing note. The brand name appears only as the natural printing on the bottle packaging.
No spoken lines and no superimposed captions throughout, no price and no CTA, pure imagery and brand tone, 9:16 vertical, no watermarks.
```

### B3 | "Brand exposure film" — minimalist product silhouette, pure memory exposure · Brand: Apple AirPods

- **Brand**: Apple AirPods (the classic reference for brand awareness / exposure, Reach & Frequency / Video Views objectives)
- **Play positioning**: pure Branding — no feature specs, no hard CTA; builds brand memory and tone with minimalist visuals + a product silhouette + a single slogan (Apple's signature brand-film language)
- **Best placement**: Reels / Shorts / YouTube (brand-led mass reach)
- **Parameters**: ratio 9:16 · duration 30 · generate_audio True
- **Duration math**: one continuous minimalist camera move for a brand film (product entrance → orbit → light and shadow unfold → slogan end card), using the full 30s single-shot capability of 2.5
- **Seedance 2.5 capabilities**: 5 quality pillars (lighting quality) + 30s single-shot

**Prompt:**

```
A 30-second vertical brand exposure film: minimalist, premium, with room to breathe — no voiceover, no feature explanation, no price throughout, building brand memory purely through the product, light and shadow. Pure seamless background shifting from white to a soft gradient, cinematic lighting, shallow depth of field, unhurried pacing.
Opening (≈6s): A pair of white wireless earbuds (AirPods form factor) rotates slowly into view at the center of a pure background, matte and specular highlights flowing over the rounded housings, the surfaces flawless, camera pushing in extremely slowly. Minimal near-silent ambience, just one crisp entrance tone.
Development (≈10s): The background color transitions slowly from pure white into a soft brand gradient (mint green into pale lavender into warm orange), the earbuds rotating slowly as the camera orbits, light drawing flowing highlight bands across the housings; the charging case then opens slowly and both earbuds float weightlessly out, the motion clean and precise, hovering mid-air. A low-frequency electronic music pulse rises.
Climax (≈8s): Rings of translucent soundwave patterns ripple outward from around the earbuds, pulsing to the beat, the colors of the frame breathing along with them — visually pure and striking without being noisy. The music builds toward a bright beat drop.
End card (≈6s): All elements gather back in, the earbuds and charging case return to rest at the center of the frame, the background settling into pure color; the English slogan "Listen. Simply." fades in at the center, followed by the Apple logo and the word "AirPods" rendered crisply and held. The music resolves on a clean closing note.
No dialogue, no captions, no price, no CTA and no watermarks throughout; the product form stays consistent and flawless from start to finish.
```

> ⚠️ Submission note: 30s must go through the Seedance 2.5 API; naming Apple/AirPods directly means the logo and product appearance may be flagged by content moderation or rendered incorrectly — where accuracy matters, switch to "generic wireless-earbud description + upload a real product photo as reference".

## Performing — the main stage, all about performance and conversion

> Shared setup as above (each case uses a real, archetypal brand that fits). **All three Performing pieces: strong hook in the first 3 seconds, selling points stated plainly, an explicit CTA at the end, readable with sound off (captions included).** Prompts have been optimized per the skill spec.

### P1 | "1-second hook + selling point stated plainly" — extreme opening → demo → CTA · Brand: CeraVe

- **Brand**: CeraVe (dry skin / barrier repair, the archetype of an emergency-fix selling point)
- **Best placement**: TikTok In-Feed (the 1s hook fits best here)
- **Parameters**: ratio 9:16 · duration 12 · generate_audio True
- **Duration math**: 3 shots (hook 1s + entry ≈3s; demo 3 beats ×1.2 + 0.5 ≈4s; comparison + CTA voiceover 6 words ÷4 + tail ≈4s) → about 12s
- **Seedance 2.5 capabilities**: 5 quality pillars + multilingual captions

**Prompt:**

```
Shot 1 (≈3s): A hand slaps a large dollop of CeraVe cream onto the back of a dry, flaking hand with visible texture (realistic skin, visible fine lines and flakes); large English on-screen text pops up at the top of frame: "Dry-skin savior? Let's test it". Extreme close-up, bright clear frontal light. A crisp light slapping sound.
Shot 2 (≈4s): Fingertips quickly spread the cream out; the balm first covers, then is worked in evenly, the dry lines filled and the skin turning hydrated and translucent — the before-and-after change on the same patch of skin clearly visible. English voiceover at a slightly fast clip: "One swipe and the dry lines are gone." Extreme close-up, hard frontal light. Fast rubbing sound of application.
Shot 3 (≈4s): The white CeraVe jar with the blue lid sits centered filling 60% of the frame, with a left/right split screen showing the same patch of skin rough before and hydrated after, and large English on-screen CTA text at the bottom: "Shop now", English voiceover: "Grab yours before it's gone." Medium close-up with a slight push in, bright product lighting. Closing beat sound effect.
English voiceover and English captions throughout (readable with sound off), vertical native texture, no over-smoothing of skin, no watermarks.
```

### P2 | "Real-person test, real contrast" — authentic review, selling points in captions · Brand: The Ordinary

- **Brand**: The Ordinary (the archetype of ingredient-focused / everyday-person testing)
- **Best placement**: TikTok In-Feed / Spark Ads (everyday-person authenticity converts well)
- **Parameters**: ratio 9:16 · duration 15 · generate_audio True
- **Duration math**: 3 shots (hook voiceover 8 words ÷4 + entry ≈3s; demo + voiceover ≈7s; closing voiceover + CTA ≈5s) → about 15s
- **Seedance 2.5 capabilities**: human performance + photorealism

**Prompt:**

```
Shot 1 (≈3s): An ordinary-looking young woman films herself close to her face, no makeup, real pores and slight dullness visible, brows slightly furrowed, saying in English with resignation: "Is my tired skin beyond saving?", with English on-screen text at the top: "Real test · Day 7". Handheld selfie medium close-up, natural window light at home, the frame carrying a real lived-in feel. Quiet indoor room tone.
Shot 2 (≈7s): She applies The Ordinary's minimalist white dropper bottle / white tube of cream to her face while explaining; the frame splits left/right to compare day-one dullness and roughness against day-seven brightness and refinement, the improvement natural and believable rather than exaggerated. English voiceover: "Twice a day, and by day seven my tone looks even and it doesn't cake." Selfie medium close-up, natural window light, natural human performance (natural blinking, nodding while talking).
Shot 3 (≈5s): She smiles confidently at the camera, eyes bright, holding The Ordinary white tube up to her chest, with large English on-screen CTA text at the bottom: "Tap the link, glow with me", the English voiceover repeating the same line. Selfie medium close-up, natural window light. A light upbeat music bed to close.
English voiceover and English captions throughout, authentic with no skin smoothing, no influencer filters, no watermarks.
```

### P3 | "One 30s multi-market compilation" — one video showing multiple languages/ethnicities in sequence · Brand: Nivea

- **Brand**: Nivea (a globalized mass-market brand, the archetype of multi-market media buying)
- **Best placement**: Reels / TikTok / Shorts across platforms and markets (one film that showcases global coverage directly)
- **Parameters**: ratio 9:16 · duration 30 · generate_audio True
- **Duration math**: 2s opening + four market segments at ≈6s each (one line of voiceover ≈2.5s + demo action ≈2 beats + entry) + 4s close → about 30s, using the full 30s single-shot capability of 2.5
- **Seedance 2.5 capabilities**: 30s single-shot + multilingual (multiple languages in one film) + human performance + multi-asset/ethnicity consistency
- **Note**: this is no longer a "master awaiting localization" but **one finished film that runs through four markets back to back**, ending on a unified brand end card — a direct demonstration of "generate once, run globally".
- **Language selection rationale (top GSB gains for 2.5 multilingual)**: English +59%, Arabic +38%, Malay +37%, Indonesian +36% — the four languages with the biggest gains in 2.5, the most natural pronunciation/pauses/intonation, and the most complete caption text rendering (Malay and Portuguese rendering improved especially sharply; here we take Malay + Indonesian as the Southeast Asia priority markets).

**Prompt:**

```
A 30-second vertical global-market compilation ad in which the same Nivea deep-blue tub of face cream is used by different people across four different markets, with different languages, people and settings, briskly paced and cut on the beat, showing universal global appeal. 9:16 vertical, bright and airy, native short-video texture. **No superimposed captions or on-screen text anywhere in the film** — all information carried by voiceover, visuals and product presence.

Opening (≈2s): A hand sets the Nivea deep-blue tub gently down on a light-colored countertop, the camera pushing quickly in on the logo on the tub before pulling into the first scene. No text overlay.

Market one · North America, English (≈6s): A blonde white woman in a bright apartment bathroom works Nivea cream into her cheek in circles, the balm pushed by her fingertips into a translucent film; she looks at camera and says in English: "Melts right in." Medium close-up, morning side light, shallow depth of field. Soft application sound. No captions.

Market two · Middle East, Arabic (≈6s): A Middle Eastern woman wearing a headscarf at a beige marble vanity spreads Nivea cream evenly over the back of her hand and strokes it in, her movements elegant, saying in Arabic: "ترطيب يدوم طويلاً" (long-lasting hydration). Medium close-up, soft premium lighting, realistic pore texture. No captions.

Market three · Southeast Asia, Malay (≈6s): A Malay woman by a bright airy window at home scoops cream with her fingertip, dots it onto her cheek and works it upward in circles, her skin taking on a hydrated glow; she looks at camera, smiles and says in Malay: "Lembap sepanjang hari." (hydrated all day). Medium close-up, warm natural light. No captions.

Market four · Southeast Asia, Indonesian (≈6s): A young Indonesian woman in a simple warm-toned room pats the cream in to help absorption, her skin translucent without redness, saying softly in Indonesian: "Cepat meresap, kulit segar." (absorbs fast, skin feels fresh). Medium close-up, clear warm light. No captions.

Close (≈4s): Quick collage flashbacks of all four women, then a unified hold on the Nivea deep-blue tub centered in frame, the brand logo on the tub natural and crisp (the printing on the packaging itself, not a superimposed caption). Bright product lighting, closing beat sound effect.

The four people are of four different ethnicities in four separate settings; the product appearance stays consistent throughout; each segment's spoken language matches its person with natural lip sync; **no superimposed captions, no on-screen text and no watermarks anywhere in the film**, the brand name appearing only as the natural printing on the packaging, vertical native texture, no over-smoothing of skin.
```

> ⚠️ Submission note: this 30s piece must go through the Seedance 2.5 API; the current seedance-2-0 script caps duration at 15s (2.0), so it needs to be submitted with 2.5 parameters. Switching between multiple languages within a single film carries some lip-sync risk — if a given segment's lip sync is unstable, it can degrade to "no voiceover in that segment, application demo + product presence only" (still with no captions).
