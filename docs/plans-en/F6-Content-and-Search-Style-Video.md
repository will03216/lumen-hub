# F6 · Content-Style / Search-Style Video

- **Creative essence**: looks like "content" rather than a hard ad, or answers search intent directly; driven by thumbnail + title/keywords, mid-funnel
- **P/B positioning**: mainly P / mid-funnel (a content-led play — the more it looks like an ad, the more the click-through rate collapses); Branding = documentary-style deep content that builds trust
- **Category direction**: content / knowledge / efficacy products (tutorials, reviews, Q&A)
- **Brand references**: Patagonia, Oral-B, Le Creuset, HexClad, StriVectin, Dyson (no brand repeats across the project; the GoPro from the stub is already used in F3, replaced by Patagonia)

## Core scenario

**Channel family: Video/Native Ads (content-style) + Search Ads (TikTok search).**
Two "active exploration" scenarios: one where the user **actively opens a video that interests them from the home feed / discovery page** (thumbnail + title decide the click, so the ad must look like content rather than a hard sell); and one where the user **actively searches a keyword** and the ad appears in the search results (so it has to match the search intent). What they share is a more active user intent, sitting in the mid-funnel "learn / compare" stage — well suited to tutorial, review and Q&A content. **The user clicked in on their own, so you can go long — this is the home turf of Seedance 2.5's 30s single-shot generation.**

## Ad types across platforms

| Platform | Ad type (placement name) | Ratio · duration | Platform-specific notes |
|---|---|---|---|
| YouTube | **In-feed video ads (formerly Discovery)** ([official page](https://support.google.com/google-ads/answer/6227733) · [format overview](https://support.google.com/google-ads/answer/2375464)) | 16:9 / any length | Thumbnail + title decide the click; make "content", not a hard sell; an audio track is mandatory; the TrueView brand has been retired |
| TikTok | **Search Ads** ([official page](https://ads.tiktok.com/help/article/about-search-ads-campaign) · [creative guidance](https://ads.tiktok.com/help/article/search-ads-creative)) | 9:16 / short video | Tailor creative per keyword group, don't just reuse the brand film; the system selects creative by query–keyword–asset relevance; high-intent traffic |

> Sign-off rule: change `- [ ]` to `- [x]` in front of the 1 Branding + 1 Performing you finally select.

> Shared setup (6 cases, each using a **real, archetypal brand** that fits the play, no repeats): content / knowledge / efficacy-product categories, prompt scene descriptions written in English, **all voiceover / narration / on-screen text / captions in English (overseas media buying)**; YouTube In-feed uses **16:9**, TikTok Search uses **9:16**.
> Durations planned against **Seedance 2.5 (up to 30s in a single generation)**: documentary / tutorial / behind-the-scenes pieces max out at 25–30s (this chapter is the home turf of long content), while search Q&A / expert answers stay short and punchy at 15s. Shot-count tiers: 30s → 5–6 shots, 25s → 5 shots, 15s → 3 shots.
> **Submission method**: the seedance-2-0 skill is used for prompt optimization only, **not for submission**; final generation is submitted by the user on the Lumina side.
> **Caption rule (global)**: Chinese/English captions can stay; for any language other than Chinese and English, add no captions or on-screen text at all.
> **Hard placement constraints**: ① YouTube requires an audio track; ② content feel comes first — don't shout selling points at the open, ease in like content; ③ TikTok Search assets must be built around one clear search question (the title *is* the search term).
> ⚠️ Note: naming a real brand directly can cause its logo/product appearance to be flagged by content moderation or rendered incorrectly — where accuracy matters, upload a real product photo as reference.

## Reference images (already collected, `/Users/bytedance/demo/Data/Daily-Work/2026-08-06-seedance25-ad-scenarios/refs/F6/`)

When generating, upload the corresponding reference images as image references (on the Lumina side); the prompts already bind entities with `[imageN]` in upload order:

| Case | Reference images (in [imageN] order) | Description |
|---|---|---|
| B1 Patagonia | `B1_patagonia_jacket.jpg` | Orange Nano-Puff jacket + chest logo tag (the prompt has been changed to an orange jacket to match the reference) |
| B2 Oral-B | `B2_oralb_toothbrush.jpg` | Pro 3 round-head electric toothbrush, Oral-B logo clear on the handle |
| B3 Le Creuset | None | Only an old brown model (no logo) could be found, which would contaminate the flame-orange primary color, so it was dropped; the cast-iron pot shape is generic enough to render directly |
| P1 HexClad | None | No free image source; the hexagonal honeycomb texture is a distinctive describable feature, so it renders from text alone |
| P2 StriVectin | None | No free image source; the bottle renders from the generic description "white tube + small brand name text" |
| P3 Dyson | `P3_dyson_supersonic.jpg` | Real Supersonic shot (the signature grey-and-pink hollow nozzle), already rotated upright |

All sourced from Wikimedia, for internal demo reference only.

## Branding

### B1 | "Deep brand story" — documentary-style storytelling · Brand: Patagonia

- **Brand**: Patagonia (the benchmark for brand-documentary content marketing, the Worn Wear repair culture)
- **Play positioning**: Branding — tells the story of "a shell jacket that has been repaired many times" like a documentary, conveying the brand's anti-consumerist spirit
- **Best placement**: YouTube In-feed (16:9, users click in to watch a story on their own)
- **Parameters**: ratio 16:9 · duration 30 · generate_audio True
- **Duration math**: 6 shots × ≈5s (mountain landscape → detail of the old jacket → repair close-up → putting it on and heading out → looking back from the summit → manifesto hold) → about 30s (2.5 single-shot)
- **Seedance 2.5 capabilities**: 30s single-shot + human performance + 5 quality pillars (photorealistic camera work)

**Prompt:**

```
A 30-second documentary-style brand story film about "a jacket that has been repaired many times": it doesn't sell a new product, it conveys a brand spirit of companionship and durability. Natural light on location, filmic grain, handheld documentary camera work, steady pacing. English narration throughout, calm and sincere in tone. The same grey-haired outdoorsman and the same faded orange lightweight Patagonia jacket [image1] carry through the whole film.
Shot 1 (≈5s): Thin mist in a mountain valley at dawn; by the window of a wooden cabin, a faded orange Patagonia jacket [image1] hangs over the back of a chair, morning light raking across the worn texture of the fabric. Slow push-in, cool-toned morning light. English narration: "This jacket is twenty years old." Wind, birdsong.
Shot 2 (≈5s): Close-up — three patches of different colors on the sleeve, a zipper pull worn white, the stitching detail, as a deeply wrinkled hand runs over the patches. Slow macro lateral move, soft window light. Narration: "Every patch has a story."
Shot 3 (≈5s): The old man sits at a workbench, carefully stitching a new tear at the elbow with needle and thread, his expression focused and calm. Locked medium close-up, warm yellow desk lamp light. Narration: "We fix things here. We don't throw them away." Stitching sounds.
Shot 4 (≈5s): He pulls on the jacket, shoulders his pack and pushes the door open into the mountains, the camera following from inside the cabin to outside as the daylight opens up. Follow shot, natural light. Footsteps, wind rising.
Shot 5 (≈5s): On a ridge he pauses and looks back at the valley, wind lifting the hem of his jacket, the patches clearly visible in the sunlight, distant ranges layered behind him. Extreme wide shot into a medium, warm gold backlight. Narration: "Buy less. Wear it longer."
Shot 6 (≈5s): Fade into black, small white text appearing: "Worn Wear — Patagonia", with a line of English below: "Better than new." Quiet resolution, the wind lingering.
No price and no CTA throughout, documentary texture over advertising feel; 16:9 landscape, an audio track is mandatory, no watermarks.
```

### B2 | "Expert answer" — a creator answering earnestly to build trust · Brand: Oral-B

- **Brand**: Oral-B (the archetype of professional trust in oral care)
- **Play positioning**: Branding — like a dentist creator earnestly answering "how should you actually brush with an electric toothbrush", building professional authority without selling
- **Best placement**: YouTube In-feed / TikTok Search (16:9 as the main version)
- **Parameters**: ratio 16:9 · duration 15 · generate_audio True
- **Duration math**: 3 shots × ≈5s (opening question → demonstration and explanation → key-point summary) → about 15s
- **Seedance 2.5 capabilities**: human performance (credibility of the explanation) + multilingual

**Prompt:**

```
A 15-second expert-answer content piece, like a dentist creator earnestly answering a common question — professional and credible, not a sales pitch. A bright, clean clinic background, an unhurried explanatory pace. English throughout.
Shot 1 (≈5s): A female dentist in a white coat sits in the clinic and opens with a smile to camera, asking in English: "Are you brushing too hard? Most people are.", with a small English title at the top: "Ask a dentist". Locked medium close-up, bright soft clinic lighting, professional and authentic.
Shot 2 (≈5s): She picks up an Oral-B round-head electric toothbrush [image1] and demonstrates on a dental model — resting it lightly against the tooth surface and moving slowly rather than scrubbing back and forth, the head's rotation clearly visible. English explanation: "Let the round head do the work. Just guide it, tooth by tooth." Alternating close-ups and medium close-ups, bright light. A faint motor hum.
Shot 3 (≈5s): She holds up two fingers to camera to sum up, two English key points appearing on the right side of frame: "Light pressure ✓ Two minutes ✓", and closes with a smile: "Gentle and slow — that's it." Locked medium close-up. A light closing sound.
English voiceover and English key-point text throughout, expertise over advertising feel, no price and no CTA; 16:9 landscape, an audio track is mandatory, no watermarks.
```

### B3 | "Craft / behind-the-scenes reveal" — high-quality content on how a product is born · Brand: Le Creuset

- **Brand**: Le Creuset (the archetype of a century of cast-iron craftsmanship)
- **Play positioning**: Branding — reveals the birth of a cast-iron pot: molten iron → casting → enameling → out of the kiln, using the aesthetics of craft to build brand premium
- **Best placement**: YouTube In-feed (16:9; craft reveals are a classic content-style subject)
- **Parameters**: ratio 16:9 · duration 30 · generate_audio True
- **Duration math**: 6 shots × ≈5s (pouring molten iron → demolding and grinding → enamel dip → kiln → out of the kiln in rows → finished-product hold) → about 30s (2.5 single-shot)
- **Seedance 2.5 capabilities**: 30s single-shot + 5 quality pillars (lighting quality + photorealism) + motion rhythm

**Prompt:**

```
A 30-second craft-reveal content piece on the birth of an enameled cast-iron pot, where industrial texture and the warmth of handwork coexist. Shot on location in a foundry, dark environment + firelight highlights, documentary camera work, steady and powerful pacing. English narration throughout.
Shot 1 (≈5s): In a dim foundry, orange-red molten iron pours slowly from a ladle into a sand mold, sparks flying, heat waves distorting the air. Medium side shot, the molten iron's glow lighting the frame. The roar of the pour. English narration: "It starts at 1,500 degrees."
Shot 2 (≈5s): The moment of demolding — a rough cast-iron pot blank is lifted out of the sand mold, a gloved worker turning it over to inspect it, casting texture still on the surface. Medium close-up follow, cool-warm light contrast. Metal clanging. Narration: "One mold. One pot. Then the mold is broken."
Shot 3 (≈5s): At the grinding station, sparks arc off the grinding wheel along the pot's rim as the body gradually reveals a smooth profile. Close-up, sparks backlit. Grinding sounds.
Shot 4 (≈5s): Enameling — the pot body is dipped into orange-red enamel slip and lifted slowly out, the enamel draining evenly, the signature flame-orange gradient emerging. Slow-motion close-up, bright work lights. Enamel dripping. Narration: "Two coats of enamel, sprayed and fired."
Shot 5 (≈5s): The kiln door opens and a row of orange cast-iron pots is pushed out in the kiln's glow, the enamel surfaces taking on a warm sheen under the lights. Medium shot, slow lateral move, warm gold kiln light. Narration: "Eight hundred degrees seals the color for life."
Shot 6 (≈5s): Finished-product hold — a flame-orange cast-iron pot stands on a dark wooden table, the Le Creuset lettering cast into the lid crisp, steam escaping gently from under the lid. Slow push-in, warm light. Narration: "Made once. Used for generations." The instrumental resolves.
No price and no CTA throughout, craft aesthetics over advertising feel; 16:9 landscape, an audio track is mandatory, no watermarks.
```

## Performing

### P1 | "Tutorial-led purchase" — a how-to that brings in the product naturally + CTA · Brand: HexClad

- **Brand**: HexClad (hybrid non-stick pans, the archetype of tutorial-style content commerce, an In-feed case brand)
- **Play positioning**: Performing — a "perfect steak in three steps" tutorial where the pan appears naturally as a tool, with a CTA at the end
- **Best placement**: YouTube In-feed (16:9; tutorials are among the highest click-through subjects on In-feed)
- **Parameters**: ratio 16:9 · duration 30 · generate_audio True
- **Duration math**: 6 shots × ≈5s (finished-dish hook → heating the pan → laying in the steak → flip and butter → slicing to show → product + CTA) → about 30s (2.5 single-shot)
- **Seedance 2.5 capabilities**: 30s single-shot + 5 quality pillars (small-object physical interaction: oil spatter / butter) + human performance

**Prompt:**

```
A 30-second cooking-tutorial commerce piece — "steakhouse steak in 3 steps" — putting the tutorial value first, weaving the product in naturally, and closing on a CTA. Shot on location in a bright modern kitchen, appetite appeal maxed out. English voiceover throughout, in the tone of a cooking creator.
Shot 1 (≈5s): The hook — a thick-cut steak sliced open, the cross-section pink and juicy with juices seeping out, extreme close-up, with an English title text at the top: "Steakhouse steak, 3 steps". Warm light, steam curling. English voiceover: "Restaurant steak at home? Three steps."
Shot 2 (≈5s): Step one — a HexClad frying pan with hexagonal texture heats on the burner, a droplet of water dancing and skittering across its surface. Overhead close-up, the pan's texture crisp. Voiceover: "Step one: get the pan ripping hot." The hiss of the droplet.
Shot 3 (≈5s): Step two — the thick-cut steak hits the pan with a loud sizzle, oil spattering lightly, tongs pressing the edges down as the crust forms. Side close-up, warm light. Voiceover: "Step two: sear, don't touch it." Searing sounds.
Shot 4 (≈5s): Step three — after the flip, a knob of butter and rosemary go in; the pan is tilted and a spoon is used to baste the steak repeatedly with the melted butter. Close-up, the butter foaming golden. Voiceover: "Step three: butter, baste, done." Butter sizzling.
Shot 5 (≈5s): The rested steak is sliced open — a perfect pink cross-section, the knife parting the meat as juices pool into a thin stream on the board. Slow-motion close-up, warm light. Voiceover: "Look at that. Every single time."
Shot 6 (≈5s): The close — the HexClad pan stands on the cooktop, its hexagonal texture catching the light crisply, with a large English CTA at the bottom: "Shop HexClad", voiceover: "The pan that does it — link below." Medium shot with a slight push in, bright product lighting. Closing beat.
English voiceover and English on-screen text throughout, tutorial value first and advertising feel second; 16:9 landscape, an audio track is mandatory, no watermarks.
```

### P2 | "Answer exactly what was searched" — respond to the search term directly + CTA · Brand: StriVectin

- **Brand**: StriVectin (an official TikTok Search Ads case brand, neck-line care)
- **Play positioning**: Performing — answers the search term "how to get rid of neck lines" directly: answer → demo → CTA, where the asset *is* the search answer
- **Best placement**: TikTok Search Ads (9:16, the title *is* the search term)
- **Parameters**: ratio 9:16 · duration 15 · generate_audio True
- **Duration math**: 3 shots × ≈5s (search term opening → application demo → before/after + CTA) → about 15s
- **Seedance 2.5 capabilities**: multilingual + 5 quality pillars (photorealistic camera work)

**Prompt:**

```
A 15-second search-answer performance ad that answers the search term "how to get rid of neck lines" directly — answer first, fast demo, CTA to close. A bright home vanity setting, authentic UGC feel. English throughout.
Shot 1 (≈5s): Answer from the first frame — a middle-aged woman turns her head to the side to show her neck to camera, with English on-screen text at the top restating the search term: "How to fix neck lines?", and she answers directly in English: "Neck lines? Here's what actually works." Medium close-up with a handheld feel, bright natural light, authentic skin texture.
Shot 2 (≈5s): The demo — she squeezes out StriVectin neck cream and applies it from the collarbone up to the jawline with an upward lifting motion, the balm spreading into a nourishing film. English voiceover: "Apply upward, twice a day.", with small on-screen text at the side: "Upward strokes ✓". Close-up, bright light. Soft application sound.
Shot 3 (≈5s): She turns her head to the side again, the skin of her neck looking smoother and firmer, the frame holding on the product bottle centered with a large English CTA at the bottom: "Shop now", voiceover: "Real results in weeks. Tap to try it." Medium close-up, bright product lighting. Closing beat.
English voiceover and English on-screen text throughout, the answer coming first; 9:16 vertical, text clear of the top and bottom UI safe zones, no over-smoothing of skin, no watermarks.
```

### P3 | "Head-to-head review" — a product review that feels like content · Brand: Dyson

- **Brand**: Dyson (Supersonic hair dryer, the archetype of review-style content; the hair-dryer category avoids the dust/small-particle failure cases sidestepped back in F3)
- **Play positioning**: Performing — like a tech creator running a real "regular hair dryer vs Supersonic" comparison, driving purchase through data and felt experience
- **Best placement**: YouTube In-feed (16:9; reviews are classic mid-funnel content)
- **Parameters**: ratio 16:9 · duration 25 · generate_audio True
- **Duration math**: 5 shots × ≈5s (opening question → regular dryer test → Dyson test → results comparison → conclusion + CTA) → about 25s (2.5 single-shot)
- **Seedance 2.5 capabilities**: 30s single-shot + photorealistic camera work + human performance

**Prompt:**

```
A 25-second head-to-head review commerce piece, like a tech creator testing "a regular hair dryer vs the Dyson Supersonic" — data and felt experience weighted equally, the conclusion driving purchase. A bright, simple review workbench setting. English voiceover throughout, objective in tone like a review channel.
Shot 1 (≈5s): Opening question — a male reviewer sits at the workbench with two hair dryers standing side by side in front of him (a regular black dryer on the left, the Dyson Supersonic [image1] on the right); he picks both up to weigh them against each other, opening in English: "Is it really worth five times the price? Let's test.", with an English title at the top: "Dryer vs Dryer". Locked medium close-up, bright review lighting.
Shot 2 (≈5s): Regular dryer test — an assistant model's long hair is dried with the regular dryer, the hot air roaring, strands frizzing and flying up, the reviewer frowning at the timer. Intercut medium shots and timer close-ups, English voiceover: "Standard dryer: loud, hot, eight minutes." Heavy wind noise.
Shot 3 (≈5s): Dyson test — the same long hair is dried with the Supersonic [image1] instead, the airflow focused and noticeably quieter, strands falling smooth and sleek, the reviewer raising an eyebrow and nodding. Matching camera position and composition, voiceover: "The Supersonic: quieter, cooler, under four." Soft airflow.
Shot 4 (≈5s): Results comparison — split screen: frizzy ends on the left, smooth strands on the right, in close-up; two lines of English data text appear below: "8 min / 92dB" vs "3.5 min / 78dB". Split-screen close-up, bright light. Voiceover: "Half the time. Half the noise. Smoother ends."
Shot 5 (≈5s): Conclusion — the reviewer puts the Supersonic back on its stand and shrugs to camera as he delivers the verdict, with a large English CTA appearing at the bottom: "Full review & link below", voiceover: "Expensive? Yes. Worth it? For daily use — absolutely." Locked medium shot. Closing beat.
English voiceover and English data text throughout, review objectivity first and advertising feel second; 16:9 landscape, an audio track is mandatory, no watermarks.
```
