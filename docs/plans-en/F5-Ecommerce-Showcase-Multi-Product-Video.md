# F5 · E-commerce Showcase / Multi-Product Video

- **Creative essence**: video + clickable product cards/anchors, browse multiple products in-app, shorten the path to purchase
- **P/B positioning**: strongly P (e-commerce conversion); the Branding play is "a series worldview / lifestyle" used as upper-funnel seeding (the skin of B, the bones of P)
- **Category direction**: home / apparel / beauty accessories, multi-SKU e-commerce
- **Brand references**: MUJI, IKEA, Pandora, GQ Apparel, Shein, Wayfair, Stanley (no brand repeats across the project — avoiding those already used in F1/F3/F4)

## Core scenario

**Channel family: Social Ads (with e-commerce / shopping attributes).**
**Video + clickable product cards/anchors** in the feed: the viewer gets sold by the video, then taps the product card below or the in-video anchor to browse multiple products and even check out in-app. It compresses the path from "seeing an ad" to "placing an order" to the shortest possible, making it the strongest social placement for e-commerce conversion. Heavily dependent on catalog quality and accurate inventory.

## Ad types across platforms

| Platform | Ad type (placement name) | Format | Platform-specific notes |
|---|---|---|---|
| Meta | **Carousel** ([official page](https://www.facebook.com/business/ads/carousel-ad-format) · [Ads Guide specs](https://www.facebook.com/business/ads-guide/update/carousel)) | 2–10 1:1 image/video cards | The first card makes or breaks it, one selling point per card, a unified color scheme; card order can be auto-optimized; creative fatigue sets in fast |
| Meta | **Collection** ([official page](https://www.facebook.com/business/ads/collection-ad-format) · [Ads Guide specs](https://www.facebook.com/business/ads-guide/update/collection)) | Cover video + 3 product images | Instant Experience is mandatory; a lifestyle cover converts better than a plain product shot; cover 1:1–1.91:1 at ≥1080×1080; depends on catalog + Pixel |
| TikTok | **Video Shopping Ads (VSA)** ([getting started](https://ads.tiktok.com/help/article/getting-started-video-shopping-ads) · [best practices](https://ads.tiktok.com/help/article/best-practices-for-video-shopping-ads-with-tiktok-shop)) | 9:16 video + product anchor | TikTok Shop closed-loop checkout; demo/review/unboxing styles perform best; keep anchor text clear of safe zones; inventory must be accurate in real time |
| TikTok | **Collection Ads** ([official page](https://ads.tiktok.com/help/article/collection-ads)) | 9:16 video + Instant Gallery | ⚠️ **Folded into VSA** (Product Sales): no longer available for new creation outside APAC / China cross-border; all new activity goes through VSA |

> Sign-off rule: change `- [ ]` to `- [x]` in front of the 1 Branding + 1 Performing you finally select.

> Shared setup (6 cases, each using a **real, archetypal brand** that fits the play, no repeats): multi-SKU home / apparel / beauty-accessory categories, prompt scene descriptions written in English, **all voiceover / on-screen text / captions in English (overseas media buying)**; TikTok VSA uses **9:16**, Meta Collection covers use **1:1**, Carousel cards are 1:1.
> Durations planned against **Seedance 2.5 (up to 30s in a single generation)**: brand-mood pieces stretch to 20s, multi-SKU sweeps to 24s; plain-spoken conversion pieces (B3/P1/P3) stay at a fast, punchy 12s; P4 Carousel is three ≈5s card videos (the card format is inherently short).
> **Submission method**: the seedance-2-0 skill is used for prompt optimization only, **not for submission**; final generation is submitted by the user on the Lumina side.
> **Caption rule (global)**: Chinese/English captions can stay; for any language other than Chinese and English, add no captions or on-screen text at all.
> **Hard placement constraints**: ① the main video is "the cover of the shelf" — the product card/anchor zone occupies roughly the bottom 20% of frame, so keep key information (on-screen text / product / CTA) out of the bottom; ② multi-SKU content must keep the same person / setting / color scheme consistent across shots; ③ price and offer information must reserve a clean, swappable on-screen text area for batch product/price swaps via local editing.
> ⚠️ Note: naming a real brand directly can cause its logo/packaging to be flagged by content moderation or rendered incorrectly — where accuracy matters, upload a real product photo as reference.

## Reference images (already collected, `/Users/bytedance/demo/Data/Daily-Work/2026-08-06-seedance25-ad-scenarios/refs/F5/`)

When generating, upload the corresponding reference images as image references (on the Lumina side); the prompts already bind entities with `[imageN]` in upload order:

| Case | Reference images (in [imageN] order) | Description |
|---|---|---|
| B1 MUJI | `B1_muji_storage.jpg` | Semi-transparent PP storage boxes (retail display stack, used for the box material) |
| B2 IKEA | None | The Nordic living room is a generic setting the model renders more reliably on its own (the showroom photos found would skew the color palette) |
| B3 Pandora | `B3_pandora_bracelet.jpg` | A real charm bracelet (charm shapes + snake chain) |
| P1 GQ Apparel | None | A plain white slim-fit shirt with no logo — the model renders it more reliably on its own (no suitable white shirt in free stock) |
| P2 Shein | `P2_shein_logo.png` | Official transparent-background logo PNG (for the end-card wordmark) |
| P3 Wayfair | `P3_entryway_clutter.jpg` + `P3_shoe_rack.jpg` + `P3_wayfair_logo.png` | ① the cluttered-entryway pain-point scene; ② the two-tier metal shoe rack product; ③ the official logo |
| P4 Stanley | `P4_stanley_quencher.png` + `P4_stanley_shop.jpg` | ① multi-color in-store array + brand signage (card 1); ② shelf close-up of the tumbler shape (cards 2/3) |

All sourced from Wikimedia, for internal demo reference only.

## Branding

### B1 | "Series worldview / atmosphere" — one use case per scene, soft-selling individual items · Brand: MUJI

- **Brand**: MUJI (the archetype of a minimalist series worldview)
- **Play positioning**: Branding — the main video establishes the tone of the entire storage series, one use case per scene, with no individual-item price push
- **Best placement**: TikTok VSA main video / Meta Collection cover (9:16)
- **Parameters**: ratio 9:16 · duration 20 · generate_audio True
- **Duration math**: 4 shots × ≈5s (morning desk → kitchen counter → wardrobe storage → bedside before sleep, one scene and one action per shot) → about 20s (2.5 single-shot)
- **Seedance 2.5 capabilities**: 50 reference assets (series consistency) + 5 quality pillars (lighting quality)

**Prompt:**

```
A 20-second brand atmosphere film for a storage series with a minimal, quiet Japanese-living worldview: one use case per scene, no individual-item push. Natural wood + off-white palette throughout, soft natural light, clean composition with generous negative space.
Shot 1 (≈5s): Early morning at a natural-wood desk, a hand places scattered stationery piece by piece into an off-white semi-transparent MUJI storage box [image1], the desktop going from cluttered to tidy and open, morning light falling at an angle across the lid. Medium close-up slightly overhead, soft window light. Faint sounds of objects being set down, quiet ambience.
Shot 2 (≈5s): At a kitchen counter, the same pair of hands puts a tea canister and utensils into an off-white acrylic drawer box and pushes the drawer gently shut, leaving only a plain mug on the counter, the frame quiet and restrained. Medium close-up slightly overhead, soft diffused light. A faint sliding drawer sound.
Shot 3 (≈5s): At a wardrobe, the same pair of hands places a folded white sweater into a non-woven storage bin and pushes it gently back onto the shelf, the small MUJI label on the bin flashing past, the wardrobe closing. Medium shot at eye level, slow lateral move, warm white light. Fabric rustle.
Shot 4 (≈5s): At a bedside at night, beside a small warm lamp, hands place glasses and a book into a small bedside tray; the camera pulls back and holds on a tidy, quiet corner of the bedroom, the small English line "Simple. In order." and the MUJI wordmark fading in at the bottom. Slow pull-back, low-level warm light. A soft page turn, a closing instrumental note.
No price and no hard CTA throughout — tone and aspiration come first; 9:16 vertical, keep the bottom 20% of frame clean (reserved for the product card), no watermarks.
```

### B2 | "Lifestyle cover" — warm domestic aspiration · Brand: IKEA

- **Brand**: IKEA (the archetype of home lifestyle)
- **Play positioning**: Branding — a Collection cover video that creates a "I want to live there" domestic scene, soft-selling with the logo left at the end, leaving conversion to the product grid below
- **Best placement**: Meta Collection cover (1:1; lifestyle covers convert better than plain product shots)
- **Parameters**: ratio 1:1 · duration 20 · generate_audio True
- **Duration math**: 4 shots × ≈5s (curtains open and light floods in → arranging the sofa corner → evening lamplight atmosphere → wide hold) → about 20s (2.5 single-shot)
- **Seedance 2.5 capabilities**: 5 quality pillars (lighting quality) + motion rhythm

**Prompt:**

```
A 20-second home lifestyle cover film aiming for the "I want to live there" feeling, with no individual-item push. A Nordic living room, warm wood + cream white + greenery, airy natural light.
Shot 1 (≈5s): A young woman pulls open the linen curtains and afternoon sunlight pours into the living room, falling across a light fabric sofa and a natural-wood coffee table, dust motes drifting in the shafts of light. Medium shot backlit, warm gold palette. Curtains sliding, quiet ambience.
Shot 2 (≈5s): Barefoot, she curls into the corner of the sofa, hugging a yellow cushion, a floor lamp warm beside her, the glass and plant on the coffee table forming a quiet corner. Medium close-up pushing in slowly, warm light and shallow depth of field. Soft fabric sounds, a soothing music bed.
Shot 3 (≈5s): Time shifts to evening — in the same living room she switches on the paper table lamp beside the coffee table, warm light blooming across the wall, the sky outside turning blue-hour, and she opens a book and curls into the sofa. Locked medium shot, contrast between indoor warm light and the blue outside. Soft page turns, the music bed continuing.
Shot 4 (≈5s): The camera pulls slowly back to a wide of the living room — sofa, side table, floor lamp and rug forming a complete IKEA-style space — as she holds a cup and smiles out the window, the IKEA blue-and-yellow wordmark fading in at the bottom right. Locked wide shot, airy warm light. The instrumental resolves.
No price and no hard CTA throughout; 1:1 square composition (Collection cover), leaving safe margins on all four edges, no captions or watermarks.
```

### B3 | "Worn-in-context seeding" — light, shadow and atmosphere that spark desire · Brand: Pandora

- **Brand**: Pandora (the archetype of jewelry seeding through wearing atmosphere)
- **Play positioning**: Branding — sparks desire through real people wearing the pieces in natural light and atmosphere, leaving conversion to the anchor
- **Best placement**: TikTok VSA main video (9:16, jewelry demos perform strongly)
- **Parameters**: ratio 9:16 · duration 12 · generate_audio True
- **Duration math**: 3 shots × ≈4s (lifting a hand in a café → turning the wrist in sunlight → necklace at the throat, hold) → about 12s
- **Revision note**: the original "macro on engraving / zirconia / charms clicking together" is high-difficulty macro work (tiny metallic reflections, zirconia sparkle and bead physics fail easily); switched to **real people wearing the pieces plus natural light and atmosphere**, relying on scene and light rather than macro detail — better output from the model and a better fit for the seeding logic.
- **Seedance 2.5 capabilities**: 5 quality pillars (lighting quality) + human performance

**Prompt:**

```
A 12-second jewelry atmosphere seeding film that sparks desire through real people wearing the pieces in natural light — premium, gentle, lived-in. Warm natural light, shallow depth of field, airy imagery.
Shot 1 (≈4s): By a café window in the afternoon, an elegant woman raises a hand to tuck a strand of hair behind her ear, the Pandora silver charm bracelet [image1] on her wrist sliding naturally with the motion and swaying gently in the window light, throwing off a soft sheen. Medium close-up, warm gold window light from the side, shallow depth of field. Soft ambience, low café chatter.
Shot 2 (≈4s): She lifts her coffee cup, her wrist turning slowly in the sunlight, the charms on the bracelet shifting with it and the sheen flowing between the links, as she looks down and smiles faintly. Primarily a wrist close-up with a hint of her face, warm gold backlight. A faint sound of porcelain.
Shot 3 (≈4s): The camera rises to take her in fully — sitting by the window, the bracelet on her wrist and a matching necklace at her throat answering each other in the light — the frame holding on her relaxed profile, the small English line "Charms that tell your story." and the Pandora wordmark fading in at the bottom. Medium shot with shallow depth of field, warm light. Closing instrumental note.
No price and no hard CTA throughout; 9:16 vertical, the wearing scenes authentic and natural with real texture on the jewelry in the light, the bottom 20% left for the product anchor zone, no watermarks.
```

## Performing

### P1 | "Demo + product card, buy now" — try-on demo → browse and check out · Brand: GQ Apparel

- **Brand**: GQ Apparel (an official TikTok VSA case brand, 5.6x ROAS)
- **Play positioning**: Performing — the main video is a real-person try-on demo of the hero product, guiding viewers to tap the product card and order in-app
- **Best placement**: TikTok VSA (9:16 + product anchor)
- **Parameters**: ratio 9:16 · duration 12 · generate_audio True
- **Duration math**: 3 shots × ≈4s (worn on camera → fabric detail → tap-the-card prompt) → about 12s
- **Seedance 2.5 capabilities**: human performance + 5 quality pillars (photorealistic camera work)

**Prompt:**

```
A 12-second apparel try-on demo performance ad in an authentic review style, conversion-oriented. A bright, simple indoor background, native UGC feel. English throughout.
Shot 1 (≈4s): A young man shows off the slim-fit white shirt he's wearing to camera, turning and adjusting his cuffs, the shirt holding its shape naturally. He says brightly in English: "This shirt? Under thirty bucks.", with matching English on-screen text at the top. Locked medium shot from the front, bright indoor light, authentic without over-lighting.
Shot 2 (≈4s): The camera moves in — fingers pinch the cuff fabric to show its drape and weave, then smooth the front to show the cut lines. English voiceover: "Breathable, wrinkle-free, fits clean." Alternating close-ups and medium close-ups, natural window light. Fabric rustle.
Shot 3 (≈4s): He nods and smiles at the camera, pointing down toward the bottom of frame, with large English text appearing at the top: "Tap the card to shop", English voiceover: "Tap below, check it out." Locked medium shot, bright light. Closing beat sound effect.
English voiceover and English on-screen text throughout, 9:16 vertical; he points downward, but the on-screen text and key information stay clear of the bottom 20% anchor zone, no watermarks.
```

### P2 | "Multi-SKU sweep" — fast cuts of best sellers + price cards · Brand: Shein

- **Brand**: Shein (the archetype of multi-SKU fast fashion)
- **Play positioning**: Performing — fast cuts across many best sellers, one price caption per item, browsing by scrolling; the hook and price areas are swappable modules for batch product swaps via local editing
- **Best placement**: TikTok VSA / Meta Carousel first card (9:16)
- **Parameters**: ratio 9:16 · duration 24 · generate_audio True
- **Duration math**: 8 beats × ≈3s (opening hook + 7 items in fast cuts) → about 24s (2.5 single-shot doubles the multi-SKU capacity)
- **Seedance 2.5 capabilities**: local editing (batch product/price swaps) + motion rhythm
- **Consistency**: same model, same studio background, only the outfit and the price caption change

**Prompt:**

```
A 24-second multi-SKU fast-cut performance ad in which the same model changes through 7 outfits, one price caption per look, cut briskly on the beat. Solid studio background (cream), composition consistent throughout. English throughout.
Shot 1 (≈3s): Opening hook — a young female model stands squarely to camera and claps once, with large English on-screen text at the top: "7 outfits under $20". Locked medium shot, bright studio lighting. The beat-driven music starts.
Shot 2 (≈3s): Outfit change ① on the beat — a floral dress; she spins lightly in place and the skirt flares out, on-screen text at the top right: "$12.99". Same camera position and composition. Beat sound effect.
Shot 3 (≈3s): Outfit change ② on the beat — a denim jacket + white tee; she poses side-on with both hands in her pockets, on-screen text at the top right: "$15.99". Same camera position. Beat sound effect.
Shot 4 (≈3s): Outfit change ③ on the beat — a knit cardigan set; she raises a hand to sweep her hair back and smiles, on-screen text at the top right: "$18.99". Same camera position. Beat sound effect.
Shot 5 (≈3s): Outfit change ④ on the beat — an athletic set; she jumps, lands and flashes a V sign, on-screen text at the top right: "$9.99". Same camera position. Beat sound effect.
Shot 6 (≈3s): Outfit change ⑤ on the beat — a long trench coat; she pulls up the collar and glances back over her shoulder, on-screen text at the top right: "$19.99". Same camera position. Beat sound effect.
Shot 7 (≈3s): Outfit change ⑥ on the beat — a slip dress + straw bag; one hand on her hip, the other swinging the bag, on-screen text at the top right: "$14.99". Same camera position. Beat sound effect.
Shot 8 (≈3s): Outfit change ⑦ on the beat — an oversize hoodie set; she makes a heart with both hands then opens her arms wide, with large English text appearing at the top: "Swipe & shop all" alongside the Shein wordmark [image1], and on-screen text at the top right: "$11.99". Same camera position. The music resolves.
Same model and same background throughout, with only the outfits and price captions changing (the price captions are a swappable module); English on-screen text throughout, 9:16 vertical, text clear of the bottom 20% anchor zone, no watermarks.
```

### P3 | "Pain-point solution conversion" — pain point → product solves it → order via anchor · Brand: Wayfair

- **Brand**: Wayfair (the archetype of home e-commerce conversion)
- **Play positioning**: Performing — opens on a small-space storage pain point, demos the product solving it, closes on ordering via the anchor
- **Best placement**: TikTok VSA (9:16)
- **Parameters**: ratio 9:16 · duration 12 · generate_audio True
- **Duration math**: 3 shots × ≈4s (the messy pain point → assembly and storage → tidy comparison + CTA) → about 12s
- **Seedance 2.5 capabilities**: 5 quality pillars (physical interaction) + local editing (product variants)

**Prompt:**

```
A 12-second home pain-point-to-solution performance ad, fast-paced demo, conversion-oriented. A real apartment setting, bright and lived-in. English throughout.
Shot 1 (≈4s): Pain-point opening — a cramped entryway [image1] piled with scattered shoes and bags; a woman comes in and nearly trips, throwing up her hands in resignation and looking at camera, complaining in English: "My entryway? A disaster.", with matching English on-screen text at the top. Medium shot with a slight handheld shake, natural indoor light.
Shot 2 (≈4s): Fast-cut demo — she quickly assembles and stands up a narrow Wayfair entryway shoe rack [image2], lines the shoes up in two rows and hangs bags on the side hooks, her movements crisp with a brisk cutting rhythm. English voiceover: "This rack fixed it in five minutes." Fast cuts of medium close-ups from multiple angles, bright light. Assembly clicks.
Shot 3 (≈4s): Comparison close — a wide of the tidy entryway; she leans against the door with satisfaction and gives an OK sign, with large English text appearing at the top: "Tap to shop the fix" alongside the Wayfair wordmark [image3], English voiceover: "Small space? Sorted. Tap below." Locked medium shot, bright light. Closing beat sound effect.
English voiceover and English on-screen text throughout, 9:16 vertical, text and key action clear of the bottom 20% anchor zone, no watermarks.
```

### P4 | "Carousel three-card story in steps" — the first card makes or breaks it, one selling point per card · Brand: Stanley

- **Brand**: Stanley (multi-color insulated tumblers, naturally multi-SKU card material, a TikTok breakout product)
- **Play positioning**: Performing — **designed specifically for the Meta Carousel format**: 3 standalone 1:1 card videos telling the story in steps (hook mini-billboard → selling-point demo → full range + CTA), each card able to carry its own link; a unified color scheme and set keeps the swipe coherent
- **Best placement**: Meta Carousel (2–10 1:1 cards, the first card makes or breaks it)
- **Parameters**: 3 separate generations · ratio 1:1 · duration 5 · generate_audio True (3 submissions total)
- **Duration math**: one shot and one beat per card ≈5s × 3 cards
- **Seedance 2.5 capabilities**: 50 reference assets (same set / color consistency across the three cards) + 5 quality pillars (small-object physical interaction: ice cubes / droplets)
- **Consistency constraint**: all three cards share the same beige studio tabletop set and the same lighting position; cross-reference the three cards during generation to keep the color scheme unified

**Prompt (card 1 | first card hook · mini-billboard):**

```
Carousel first card, a 5-second 1:1 mini-billboard: on a beige studio tabletop, seven Stanley large-capacity insulated tumblers [image1] in different colors are arranged in an arc; the camera sweeps slowly across the colorful bodies, the matte finish and handle details of each tumbler crisp, and settles with a slight push-in on the cream-colored hero tumbler in the middle, with large English text appearing at the top: "Which color is you?". Slow lateral move into a push-in, bright even studio lighting, saturated color. An upbeat rhythm track starts. 1:1 square composition, on-screen text in the upper third, no watermarks.
```

**Prompt (card 2 | selling-point demo):**

```
Carousel second card, a 5-second 1:1 selling-point demo: on the same beige studio tabletop, a cream-colored Stanley tumbler [image1] sits centered; a hand lifts it and tips it — ice cubes and ice water pour into a clear glass, the cubes tumbling and clinking as frost and condensation instantly bloom on the glass wall — with English on-screen text appearing at the top: "Ice for 48 hours". Locked medium close-up slightly overhead, bright studio lighting, authentic cold-fog texture. Crisp clinking ice. 1:1 square composition, same set and color scheme as the first card, on-screen text in the upper third, no watermarks.
```

**Prompt (card 3 | full range + CTA):**

```
Carousel third card, a 5-second 1:1 close: on the same beige studio tabletop, three Stanley tumblers in different colors stand side by side; a hand gently turns the middle one square to camera so the Stanley bear mark faces front, with large English text appearing at the top: "Free shipping this week" and a small CTA line at the bottom: "Shop now". Medium close-up with a slight push in, bright studio lighting. Closing beat sound effect. 1:1 square composition, same set and color scheme as the first two cards, no watermarks.
```
