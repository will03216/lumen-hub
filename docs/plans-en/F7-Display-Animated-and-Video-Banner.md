# F7 · Display Animation / Video Banner

- **Creative essence**: turning static display banners into video/animation — multi-ratio, multi-size looping motion in a passive browsing environment
- **P/B positioning**: P&B (mainly P; the large sizes skew B)
- **Category direction**: DTC / apps / FMCG / retail / travel
- **Brand references**: Airbnb, Booking.com, Häagen-Dazs, Grammarly, Sephora, Duolingo (no brand repeats across the project; the McDonald's from the stub is already used in F4, replaced by Airbnb / Häagen-Dazs / Sephora)

## Core scenario

**Channel family: Display Ads.**
Banner ads people see **while reading another website or using an app** — "interruptive" passive exposure. **This chapter is image-first**: static banners are **generated directly by Seedream 5.0 Pro** (multi-ratio, multi-size, with English copy rendered inside the image), while the animated/video versions ship as Seedance prompts (3–5s looping motion, generated in Lumina).

## Ad types across platforms

| Platform | Ad type (placement name) | Ratio · size | Platform-specific notes |
|---|---|---|---|
| Google GDN | **Responsive Display Ads (RDA)** ([official page](https://support.google.com/google-ads/answer/6363750) · [official specs](https://support.google.com/google-ads/answer/17090561)) | 1.91:1 / 1:1 / vertical, up to 15 images | 1200×628 and 1200×1200 recommended; use every ratio to win placements; avoid blur, borders and text piled onto the image; ≤5120KB per image |
| Google GDN | **Static / animated banners (uploaded)** ([official specs](https://support.google.com/google-ads/answer/1722096) · [common sizes](https://support.google.com/google-ads/answer/7031480)) | 300×250 / 728×90 / 320×100 / 300×600 / 970×250 | The standard sizes get the most volume; 970×250 skews brand; **static files over 150KB are rejected in review**; GIFs must loop in ≤5s |
| DV360 / RTB | **Programmatic display** ([DV360 product page](https://marketingplatform.google.com/about/display-video-360/)) | Banner size families | Specs vary slightly by DSP and review is strict; measured on viewability/attention; delivered in batches by size family |

> Sign-off rule: change `- [ ]` to `- [x]` in front of the 1 Branding + 1 Performing you finally select.

> Shared setup (6 cases, no brand repeats): **statics = generated directly by Seedream 5.0 Pro (`dola-seedream-5-0-pro-260628`)**, all in-image copy in English (text inside quotation marks is the exact string to render); **animation = Seedance 2.5**, 3–5s looping motion (visuals close to the static version for easy comparison).
> **Size conversion** (5.0 Pro requires ≥1280×720 total pixels with width and height in multiples of 16 — generate scaled up at the delivery ratio, then downscale to the target size and compress under 150KB at delivery): 300×250→1216×1008 · 728×90→2912×368 · 320×100→1920×608 · 970×250→2496×640 · 300×600→1008×2016 · RDA 1.91:1→2432×1280 · 1:1→2048×2048 · 4:5→1664×2080.
> **Submission method**: the Seedream images are generated directly by Claude (output in `generated/F7/`); the Seedance animation prompts are submitted by the user on the Lumina side.
> ⚠️ Note: mascots and logos are rendered by the model from the description — if they come out distorted, upload official assets as reference and retry.

## Branding

### B1 | "Brand visual motif" — an RDA three-ratio set in one visual language · Brand: Airbnb

- **Play positioning**: Branding — derives all three RDA ratios from the same visual motif (coral red + a warm window) to reinforce brand recognition
- **Deliverables**: 3 Seedream statics (2432×1280 / 2048×2048 / 1664×2080)
- **Seedream prompt (same prompt for all three ratios, composition adapts):**

```
Premium minimal brand display ad for Airbnb. A warm coral-red (#FF5A5F) gradient background. At center, a small cozy house silhouette with one glowing warm window at dusk, soft light spilling out, tiny and inviting, flat illustration style with subtle grain. Headline in clean white sans-serif: "Belong anywhere." Small white wordmark "airbnb" at the bottom. Lots of negative space, no button, no other text, elegant brand poster feel.
```

### B2 | "970×250 brand billboard" — an animated billboard · Brand: Booking.com

- **Play positioning**: Branding leaning P — a large format selling travel aspiration, with a brand zone reserved on the right
- **Deliverables**: 1 Seedream static (2496×640) + a Seedance animated version (21:9 · 5s loop)
- **Seedream prompt:**

```
Ultra-wide travel display billboard banner. Left two-thirds: a cliffside infinity pool overlooking a turquoise sea at golden hour, a few white umbrellas, cinematic warm light, photoreal. Right third: a deep royal-blue panel with white text — headline "Find your next stay", below it a small white rounded button reading "Search deals", and the white wordmark "Booking.com" at the bottom right corner. Clean commercial layout, crisp text.
```

- **Seedance prompt (animated version):**

```
A 5-second ultra-wide (21:9) looping animated banner: a cliffside infinity pool overlooking a turquoise sea at golden dusk, sunlight glinting slowly across the water, the fabric of the umbrellas lifting gently in the breeze, the camera pushing forward extremely slowly; in the deep blue panel on the right side of frame, the white English headline "Find your next stay" and the button "Search deals" fade in one after the other, with the white "Booking.com" wordmark persistent in the bottom right corner. First and last frames match for a seamless loop, no voiceover, gentle ocean ambience.
```

### B3 | "Product atmosphere frame" — premium light and shadow with subtle motion · Brand: Häagen-Dazs

- **Play positioning**: Branding — the product "breathing" under premium light and shadow, tone-led
- **Deliverables**: 1 Seedream static (2048×2048) + Seedance subtle motion (1:1 · 4s loop)
- **Seedream prompt:**

```
Luxury ice cream brand display ad, square format. A single Häagen-Dazs vanilla ice cream pint on dark polished marble, lid off, one perfect scoop on top with a soft melting sheen, deep burgundy backdrop, a single warm spotlight from upper left, subtle gold accents, shallow depth of field, ultra-premium food photography. Small elegant gold text at bottom: "Crafted like no other." with the wordmark "Häagen-Dazs". No button, minimal layout.
```

- **Seedance prompt (subtle motion):**

```
A 4-second 1:1 looping subtle animation: against a deep burgundy background, a Häagen-Dazs ice cream pint stands on black marble, the surface of the vanilla scoop on top carrying a slowly flowing melting sheen, a warm light sweeping extremely slowly across the pint from the upper left, and the gold text "Crafted like no other." brightening and dimming in a faint breathing rhythm, with the rest of the frame still. First and last frames match for a seamless loop, no voiceover, quiet atmosphere.
```

## Performing

### P1 | "Selling point + CTA animation" — product demo + large-type selling point · Brand: Grammarly

- **Play positioning**: Performing — the classic display formula: demo + large-type selling point + CTA button
- **Deliverables**: 1 Seedream static (1216×1008 ≈300×250) + a Seedance animation (1:1 · 5s loop)
- **Seedream prompt:**

```
Clean SaaS display ad, medium rectangle layout, white background with soft green accents. Center: a minimal UI card showing a sentence "Their going to love it" with "Their" underlined in red, corrected to "They're" highlighted in green with a small green checkmark. Headline in dark bold sans-serif: "Write with confidence". Below, a bright green rounded CTA button with white text: "Try Grammarly". Small green "Grammarly" wordmark top left. Crisp flat design, generous spacing, sharp legible text.
```

- **Seedance prompt (animated version):**

```
A 5-second 1:1 looping animation: inside a minimal UI card on a white background, the word "Their" in the English sentence "Their going to love it" picks up a red wavy underline, is then auto-rewritten as a green-highlighted "They're" and a green checkmark pops up; the green "Try Grammarly" button below scales up once as a pulse cue. Clean desktop-grade visuals, crisp pacing, first and last frames match for a seamless loop, no voiceover.
```

### P2 | "Dynamic remarketing" — same layout, swapped product + offer hook · Brand: Sephora

- **Play positioning**: Performing — a remarketing layout where the same frame dynamically swaps the product and the offer; two versions (A/B) demonstrate the "product swap"
- **Deliverables**: 2 Seedream statics (1024×1024, same layout: A lipstick / B foundation) + a Seedance product-swap animation (1:1 · 4s)
- **Seedream prompt A (lipstick version; for version B swap the product for a sleek foundation bottle, everything else unchanged):**

```
Retail remarketing display ad, square, black and white striped border frame in Sephora style. Center on soft white: a single luxurious red lipstick standing upright, studio product lighting, slight reflection. Top headline in black elegant sans-serif: "Still thinking it over?" Below the product, a red price tag chip reading "10% off today". Bottom: black rounded CTA button with white text "Shop now", and the black wordmark "SEPHORA" beneath it. Crisp, premium retail layout.
```

- **Seedance prompt (product-swap animation):**

```
A 4-second 1:1 remarketing animated banner: within the Sephora layout with its black-and-white striped border frame, the headline "Still thinking it over?" and the "Shop now" button stay fixed while the product at the center cross-dissolves smoothly from an upright red lipstick to a bottle of foundation, and the red "10% off today" chip gives one small bounce as the swap happens. The layout stays stable throughout with only the product and the chip moving, first and last frames match for a seamless loop, no voiceover.
```

### P3 | "Multi-size asset family" — one master derived into the standard size family · Brand: Duolingo

- **Play positioning**: Performing — one master visual derived into 4 standard banner sizes to feed programmatic / RDA
- **Deliverables**: 4 Seedream statics (2912×368 ≈728×90 / 1920×608 ≈320×100 / 2496×640 ≈970×250 / 1008×2016 ≈300×600)
- **Seedream prompt (same prompt for all four sizes, layout adapts):**

```
Bright app-install display banner for Duolingo. Vivid green (#58CC02) background. A cheerful round green cartoon owl mascot with big eyes waving one wing. Headline in bold white rounded sans-serif: "15 minutes a day". A white rounded CTA button with green text: "Start learning". Small white lowercase wordmark "duolingo". Flat playful vector style, elements arranged to fit the banner proportions naturally, crisp text, no other elements.
```
