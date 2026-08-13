# F4 · Ultra-Short Bumper / Open-Screen

- **Creative essence**: ≤6s bumper or the prime open-screen slot — one screen, one idea, a strong visual hammer, instant brand memory
- **P/B positioning**: pure B / strongly B (high-frequency memory, mass exposure); Performing appears only as short "drive clicks/traffic" variants
- **Category direction**: major brand product launches / high-frequency memory
- **Brand references**: Duracell, KitKat, Nike, Cheetos, Xbox, McDonald's (no brand repeats across the project: Coca-Cola is already used in F3, so KitKat is used here)

## Core scenario

**Channel family: Video Ads (bumper) + open-screen mass exposure (TikTok TopView / Brand Takeover).**
Two extremely short, high-impact exposure slots: the **6-second non-skippable bumper** inside a YouTube video, and TikTok's **open-screen ad — the first thing you see on opening the app**. What they share is extremely limited time and no room for complex information, so you can only do "one screen, one idea" — burning the brand into memory instantly with one very strong visual hammer or audiovisual punch. Typically used alongside a hero film for high-frequency memory reinforcement, or for a major product launch.

## Ad types across platforms

| Platform | Ad type (placement name) | Ratio · duration | Platform-specific notes |
|---|---|---|---|
| YouTube | **Bumper ads** ([format overview](https://support.google.com/google-ads/answer/2375464) · [Video Reach campaigns](https://support.google.com/google-ads/answer/7159363)) | 16:9 / ≤6s | 6s non-skippable; a single strong concept, one image one line; an audio track is mandatory; mix with 6s/15s/30s hero cuts for memory reinforcement |
| TikTok | **TopView** ([official specs](https://ads.tiktok.com/help/article/tiktok-reservation-topview)) | 9:16 / 5–60s (9–15s officially recommended) | The prime open-screen slot, sound on by default; **no pure white background in the first 3s**; ≥540×960, ≤500MB, bitrate ≥2500kbps; dual safe zones for both open-screen and in-feed states; Reservation booking and review; avoid explosive or shrill screaming openings |
| TikTok | **Brand Takeover** ([real case: Cheetos](https://www.youtube.com/watch?v=x2qUvAObUSs)) | 9:16 / 3s still or 3–5s video | Category exclusivity for the day (100% SOV), can link to a landing page; now folded into the TopView reservation system with no public self-serve spec page — booked through sales |

> Sign-off rule: change `- [ ]` to `- [x]` in front of the 1 Branding + 1 Performing you finally select.

> Shared setup (6 cases, each using a **real, archetypal brand** that fits the play, no repeats): major-brand high-frequency memory / product launch categories, prompt scene descriptions written in English, **all voiceover / on-screen text / captions in English (overseas media buying)**; bumpers use **16:9**, TopView / Brand Takeover use **9:16**.
> Duration: everything in this category is 4–15s (6s/5s/12s), so no special 30s parameters from 2.5 are needed.
> **Submission method**: the seedance-2-0 skill is used for prompt optimization only, **not for submission**; final generation is submitted by the user on the Lumina side.
> **Caption rule (global)**: Chinese/English captions can stay; for any language other than Chinese and English, add no captions or on-screen text at all.
> **Hard placement constraints**: ① YouTube bumpers must have an audio track; ② TikTok TopView forbids a pure white background in the first 3s (open on a dark or brand color), and the opening sound should catch the ear without being an explosion or a scream; ③ open-screen assets must leave UI safe zones at the top and bottom, with the logo/CTA centered and slightly high.
> ⚠️ Note: naming a real brand directly can cause its logo/product appearance to be flagged by content moderation or rendered incorrectly — where accuracy matters, switch to "generic description + upload a real product photo as reference".

## Reference images (already collected, `/Users/bytedance/demo/Data/Daily-Work/2026-08-06-seedance25-ad-scenarios/refs/F4/`)

When generating, upload the corresponding reference images as image references (on the Lumina side); the prompts already bind entities with `[image1]`/`[image2]` in upload order:

| Case | Reference images (in [imageN] order) | Description |
|---|---|---|
| B1 Duracell | `B1_duracell_aa.jpg` | Copper-top AA battery + logo close-up |
| B2 KitKat | `B2_kitkat_wrapper.jpg` + `B2_kitkat_broken.jpg` | ① classic red wrapper / oval logo; ② the cross-section of a snapped wafer |
| B3 Nike | `B3_nike_af1_white.jpg` | White Air Force 1, swoosh clearly visible in profile |
| P1 Cheetos | `P1_cheetos_logo.png` + `P1_cheetos_snacks.jpg` | ① official logo (transparent PNG — no packaging photo could be found in free stock due to copyright, so the bag is rendered by the model from the logo); ② the texture of the corn puffs themselves |
| P2 Xbox | `P2_xbox_seriesx.jpg` + `P2_xbox_controller.jpg` | ① Series X console (including a full view of the controller); ② controller button close-up |
| P3 McDonald's | `P3_mcdonalds_fries.jpg` | Red fry box + golden arches, white background |

All sourced from Wikimedia (including images used in enwiki articles), for internal demo reference only.

## Branding

### B1 | "One visual hammer" — a single strong 6s concept · Brand: Duracell

- **Brand**: Duracell (the 6s bumper champion case certified by Think with Google)
- **Play positioning**: pure Branding — one extremely strong image + the logo, pure memory, reinforced at high frequency alongside a hero film
- **Best placement**: YouTube Bumper (16:9 / ≤6s)
- **Parameters**: ratio 16:9 · duration 6 · generate_audio True
- **Duration math**: a single-shot spectacle (battery lighting up + electric sparks + logo hold) ≈6s, taking the max of the camera push-in and the light-effect beat
- **Seedance 2.5 capabilities**: 5 quality pillars (lighting quality)

**Prompt:**

```
A 6-second YouTube bumper on a single strong concept: shoot the Duracell battery as an "energy totem". Dark studio, copper-gold as the primary color, hard dramatic lighting, one image one line.
Shot 1 (≈6s): A copper-top Duracell battery [image1] stands upright on a dark mirrored surface; a hard light sweeps slowly down from the copper cap, metallic highlights flowing, fine electrical sparks crawling up the battery body and converging at the copper top where they burst into a ring of light; the frame then holds, with the Duracell logo and the small English line "Lasts longer." fading in at the bottom right. Low-angle upward view pushing in slowly, dark background, copper-gold palette, an electrical hum rising, resolving on a crisp "ding".
An audio track is mandatory; no voiceover, no price, no CTA; 16:9 landscape, authentic metallic texture, no captions or watermarks.
```

### B2 | "Sonic-impact opening" — an audiovisual punch in sync · Brand: KitKat

- **Brand**: KitKat (the "snap" of breaking the bar = a classic sonic hammer, with the global slogan Have a break)
- **Play positioning**: Branding — makes good use of the open screen's "sound on by default" with an audiovisual punch in the first second to build brand memory
- **Best placement**: TikTok TopView (9:16, sound on by default)
- **Parameters**: ratio 9:16 · duration 12 · generate_audio True
- **Duration math**: 3 shots × ≈4s (the snap punch → slow-motion cross-section → red-background hold, one beat each) → about 12s (inside the officially recommended 9–15s window)
- **Seedance 2.5 capabilities**: 5 quality pillars (small-object physical interaction: chocolate crumbs) + motion rhythm
- **Placement compliance**: opens on a bright red background (not pure white) ✓; the snap catches the ear without being harsh ✓

**Prompt:**

```
A 12-second TikTok open-screen brand film that uses the crisp "snap" of the bar breaking as an audiovisual hammer in the first second. Bright red KitKat background throughout, brisk pacing.
Shot 1 (≈4s): Against a bright red background, a close-up of two hands snapping a KitKat chocolate wafer bar [image2] in half with a crisp crack — clear and clean, and the very first sound in the film — as tiny chocolate crumbs fly outward to both sides. Extreme close-up, bright frontal light, shallow depth of field.
Shot 2 (≈4s): Slow motion — the two halves separate slowly, the cross-section revealing crisp wafer layers and the chocolate coating in clear relief (cross-section texture per [image2]), crumbs drifting down slowly through the light. Slow macro push-in, warm light tracing the texture of the break. A faint crisp aftertone.
Shot 3 (≈4s): The frame cuts to a pure bright red field with the white oval KitKat logo [image1] centered, the small English line "Have a break, have a KitKat." fading in below, resolving on a light beat. Medium shot hold.
No voiceover, no price and no CTA throughout; 9:16 vertical, opening on a bright red background (no pure white), wafer cross-section and crumb physics authentic, no watermarks.
```

### B3 | "Brand-color flash" — primary color + silhouette + slogan · Brand: Nike

- **Brand**: Nike (the archetype of brand color / swoosh / slogan working as one memory symbol)
- **Play positioning**: pure Branding — a high-impact instant of brand-color light waves plus a product silhouette plus the slogan, burning in a memory within 3–5s
- **Best placement**: TikTok Brand Takeover (9:16 / 3–5s)
- **Parameters**: ratio 9:16 · duration 5 · generate_audio True
- **Duration math**: a single-shot flash sequence (silhouette rotating → swoosh highlight sweep → color burst → black-frame hold) ≈5s
- **Seedance 2.5 capabilities**: motion rhythm + 5 quality pillars (lighting quality)

**Prompt:**

```
A 5-second TikTok Brand Takeover that lands one high-impact brand memory through brand-color flashes and a silhouette. Black + orange-red as the primary colors, fast-cut flash editing.
Shot 1 (≈5s): Against a pure black background, the side silhouette of a sneaker [image1] spins rapidly, a white arc of highlight sweeping across its outline with a whoosh, immediately followed by an orange-red light wave bursting out from the center of frame to fill the screen, then pulling back to a black-frame hold — the white Nike swoosh logo fades in at the center with the small English line "Just Do It." below. Locked camera with fast light-effect editing, a deep bass drum hit plus a whooshing sweep, cutting cleanly to silence on the hold.
No voiceover, no price; 9:16 full-screen vertical, opening on a pure black background (no pure white), logo centered clear of the top and bottom UI zones, no watermarks.
```

## Performing

### P1 | "Punch + tap now" — a strong visual plus a big CTA guiding one screen · Brand: Cheetos

- **Brand**: Cheetos (a real Brand Takeover open-screen case brand)
- **Play positioning**: Performing variant — a punchy visual plus a big CTA compressed into one screen; open-screen ads can link to a landing page to drive traffic directly
- **Best placement**: TikTok Brand Takeover (9:16 / 3–5s, can link to a landing page)
- **Parameters**: ratio 9:16 · duration 5 · generate_audio True
- **Duration math**: a single shot (powder burst → bag springs in → CTA appears) ≈5s
- **Seedance 2.5 capabilities**: 5 quality pillars (small-object physical interaction: powder particles)

**Prompt:**

```
A 5-second TikTok open-screen traffic ad that lands "punchy visual + big CTA" in a single screen. Deep orange background, strong appetite appeal, crunchy pacing.
Shot 1 (≈5s): Against a deep orange background, several Cheetos corn puffs [image2] bounce up into frame from the bottom edge as orange cheese powder bursts across the full screen like fireworks, the powder particles drifting down slowly through the light; an orange bag printed with the Cheetos logo [image1] springs quickly in from deep focus and lands upright at the center of frame, with a large English CTA appearing at the bottom: "Tap to grab yours". Extreme close-up low angle, bright appetizing light, a crunchy snap plus a bouncing beat to resolve.
9:16 full-screen vertical, opening on a deep orange background (no pure white), CTA centered and slightly low but clear of the bottom UI zone; English on-screen text crisp, no watermarks.
```

### P2 | "Launch-day rush" — reveal → limited launch → CTA · Brand: Xbox

- **Brand**: Xbox (the archetype of a console launch with mass exposure)
- **Play positioning**: Performing variant — an open-screen product reveal, with limited-launch information plus a pre-order CTA driving traffic
- **Best placement**: TikTok TopView (9:16, the prime slot for a launch with mass exposure)
- **Parameters**: ratio 9:16 · duration 12 · generate_audio True
- **Duration math**: 3 shots × ≈4s (green ring lights up → console rotates and assembles → logo + CTA hold) → about 12s
- **Seedance 2.5 capabilities**: 5 quality pillars (lighting quality) + motion rhythm
- **Placement compliance**: opens on pure black + green light (not pure white) ✓

**Prompt:**

```
A 12-second TikTok open-screen launch ad that maxes out the reveal before landing on a limited-time pre-order CTA. Pure black background + Xbox fluorescent green as the primary color, hard-edged tech feel. English throughout.
Shot 1 (≈4s): A ring of fluorescent green light comes up slowly at the center of a pitch-black frame, the silhouette of an Xbox console [image1] emerging from the darkness, its matte surface reflecting the green glow. Slow push-in, a low-frequency electrical hum rising.
Shot 2 (≈4s): The console hovers, rotating slowly, as two controllers [image2] fly in from both sides of frame and settle steadily on either side of it, green highlights sweeping across the details of the chassis. Orbiting camera move, English voiceover, low and emphatic: "The new Xbox. Launching now."
Shot 3 (≈4s): The frame cuts to a fluorescent green field with the white Xbox logo centered, large English text appearing below: "Pre-order today" alongside a limited-launch corner badge. Medium shot hold, English voiceover: "Pre-order today.", resolving on a beat.
9:16 full-screen vertical, opening on a pure black background (no pure white), CTA clear of the bottom UI zone; English voiceover and English on-screen text throughout, no watermarks.
```

### P3 | "Single selling point, flash memory" — 6s, one selling point + a CTA reminder · Brand: McDonald's

- **Brand**: McDonald's (the archetype of FMCG promo flash memory used to close out alongside a hero film)
- **Play positioning**: Performing variant — 6s covering one promotional selling point + brand + CTA, used as a conversion reminder alongside a hero film
- **Best placement**: YouTube Bumper (16:9 / ≤6s, mixed in with the hero film)
- **Parameters**: ratio 16:9 · duration 6 · generate_audio True
- **Duration math**: a single shot in two beats (fries bounce up and fall back ≈3s → red-field logo + price CTA hold ≈3s) → about 6s
- **Seedance 2.5 capabilities**: 5 quality pillars (small-object physical interaction: fries / salt grains)

**Prompt:**

```
A 6-second YouTube bumper promo flash that says one selling point in one line. Brisk and appetizing, red-and-gold brand colors. English throughout.
Shot 1 (≈6s): Golden fries bounce lightly up out of a red McDonald's fry box [image1] and fall back in, steam rising, fine salt grains clearly visible in the warm light; the frame then cuts to a pure red field with the golden arches logo centered and large English text appearing on the right: "Fries. $1. Today only." with a small CTA line "Order now". Extreme close-up cutting to a hold, bright warm light, a brisk one-line English voiceover: "One dollar fries. Today only.", resolving on an upbeat beat.
An audio track is mandatory; 16:9 landscape, authentic fry texture, English on-screen text crisp, no watermarks.
```
