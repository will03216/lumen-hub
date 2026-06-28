---
name: seedance
description: Generate videos with BytePlus Seedance 2.0 — text-to-video, image-to-video, prompt optimization, shot design, audio/lip-sync, asset management, and task tracking.
version: 2.3.0
---

# Seedance Video Generation

Use this skill to generate AI videos with BytePlus Seedance 2.0 directly from Claude Code.

> **🚨 MANDATORY PRE-FLIGHT RULE #1 — Prompt optimization**
>
> Before calling `seedance_generate`, you **MUST** rewrite the user's input
> through the optimization pipeline in
> [`references/prompt-guidance.md`](references/prompt-guidance.md):
>
> 1. Capture intent → 2. Fill the 6-component scaffold (Subject + Action +
>    Environment + Camera + Lighting + Style) → 3. Compile to one paragraph
>    → 4. Anti-slop pass → 5. Length check → 6. Final integrity check.
>
> **Submit the optimized prompt, never the raw user input.** Show the user the
> optimized prompt before submission so they can confirm or tweak it.
>
> **If references are passed** (`--image`, `--video`, `--audio-ref`),
> the optimized prompt **MUST tag every reference** as `[image1]`, `[image2]`,
> `[video1]`, `[audio1]`, etc. (1-indexed, in argument order) next to the
> entity it represents. Without these tags, Seedance cannot bind references to
> subjects and falls back to using the first image as a literal first-frame —
> which is wrong for character / object / style references.
>
> (`--audio-ref` passes a **reference audio clip** for lip-sync / beat / pacing.
> The separate `--audio` flag is a boolean that asks Seedance to *generate* a
> matching audio track — it is not a reference and is not tagged.)
>
> The only opt-out: the user explicitly says "use this prompt as-is" *and* the
> input already follows the 6-component framework *and* (if refs are passed)
> already contains the `[imageN]` / `[videoN]` / `[audioN]` tags. Even then,
> run the integrity check (step 6) before submission.

> **🚨 MANDATORY PRE-FLIGHT RULE #2 — Real or virtual human portraits**
>
> If **any** input image contains a real or virtual human portrait (face / full-body / character reference):
>
> - **Automatic path**: use `seedance_generate` — it auto-uploads *every* plain-HTTPS image reference to the asset library before submitting (there is no portrait detector; it uploads unconditionally, which is exactly why portraits are always safe). Refs already in `asset://` form are passed through untouched.
> - **Manual path**: call `seedance_create_asset_group` → `seedance_upload_asset` → use the returned `asset://` URL.
>
> **Do NOT** pass raw HTTP URLs for human portraits to `seedance_image_to_video` directly — they trigger `InputImageSensitiveContentDetected.PrivacyInformation`.
>
> Non-human references (backgrounds, storyboards, objects, scenery) can use plain URLs as before.
>
> **Local files**: generation APIs need a public URL, not a local path. When the user has a local image file, call `seedance_upload_image_to_tos` to push it to a TOS bucket and get a public URL. If they haven't said which bucket, call `seedance_list_tos_buckets` first and ask which one to use (TOS accounts can have multiple buckets).
>
> **See [`references/assets.md`](references/assets.md) for the full Assets API workflow.**

> **🚨 MANDATORY PRE-FLIGHT RULE #3 — The Director's Card**
>
> Before every `seedance_generate` (MCP) / `seedance generate` (CLI) call,
> print a **Director's Card** to the user and get confirmation. The card is the
> proof-of-work that the reference docs were actually applied — its fields
> cannot be filled without them:
>
> ```text
> 🎬 Director's Card
> Mode: T2V | I2V | R2V | V2V        Ratio: 16:9   Audio: on/off
> Shots:
>   1. [size + move] — [action]            ≈Xs  (basis: e.g. 9 words ÷ 2.5 + 1.5)
>   2. …                                   ≈Xs  (basis: e.g. 2 beats × 1.2 + 0.5)
> Duration: Σ = Ns  (4–15 ✓, shot budget ✓)        ← duration-calculus.md
> Refs: [image1]=hero card (asset://…) · [image2]=scene · …  ← all URLs tagged
> Performance: [entry → trigger → exit, if any face emotes]  ← performance-direction.md
> Continuity: [axis / preamble / FLF chain, if multi-clip]   ← continuity-and-editing.md
> Prompt: """
>   <the exact, full prompt string that will be submitted>
>   """                                              ← prompt-guidance.md + prompt-prose-craft.md
> Checklist: slop ✓ lighting named ✓ tags ✓ safety ✓
> ```
>
> A card with a guessed duration (no basis math), untagged refs, a missing
> Prompt field, or an emotion adjective in the action line is invalid — go back
> to the docs.

## Conditional MUST-READ table

`seedance.md` alone is **not enough to submit**. Resolve this table
top-to-bottom for every request; read what matches **before** drafting the
prompt:

| If the request involves… | MUST read first |
|---|---|
| any submission (always) | [prompt-guidance](references/prompt-guidance.md) + [duration-calculus](references/duration-calculus.md) + [prompt-prose-craft](references/prompt-prose-craft.md) |
| spoken lines / lip-sync / music | [audio](references/audio.md) |
| a face that emotes | [performance-direction](references/performance-direction.md) |
| a recurring character, or any multi-clip project | [character-card](references/character-card.md) + [continuity-and-editing](references/continuity-and-editing.md) |
| a story bigger than one clip (commercial, episode, montage) | [narrative-design](references/narrative-design.md) |
| color as story (palette, motif color, grade arc) — any quality-led shot | [color-design](references/color-design.md) |
| a recognizable genre look (horror, noir, romance, thriller, doc, commercial) | [genre-grammar](references/genre-grammar.md) |
| meaning carried by the frame (motif, symbolism, POV, blocking, depth, aspect-as-emotion) | [visual-language](references/visual-language.md) |
| environment/props/period/world-state as story | [production-design](references/production-design.md) |
| ratio choice, multi-crop campaigns, delivery versions | [aspect-ratio](references/aspect-ratio.md) |
| editing rhythm, montage, cut grammar (J/L, 30°, match, Kuleshov), pacing curve | [continuity-and-editing](references/continuity-and-editing.md) |
| any human portrait in the refs | [assets](references/assets.md) |
| camera/lighting/style choices beyond the quick tables | [shot-design](references/shot-design.md) |
| copyright, public figures, filter blocks | [safety](references/safety.md) |

Resolve the table top-to-bottom, **read every matched doc before drafting**
(when 6+ match, read the relevant section of each conditional doc rather than
every doc end-to-end to stay within context), then cite one concrete rule you
applied from each doc in the Director's Card. A doc you cannot cite a rule from
is a doc you did not read.

## Prerequisites

Install and configure before first use (run from the repo root):

```bash
git clone https://github.com/mittulmadaan/byteplus-seedance-mcp
cd byteplus-seedance-mcp
pip install packages/seedance-sdk packages/seedance-mcp -e packages/seedance-cli
seedance auth login        # stores credentials in ~/.seedance/credentials
seedance skill install     # wires up MCP server into Claude Code & Claude Desktop
```

Then restart Claude Code/Desktop.

---

## Loading map

- **Read [prompt-guidance](references/prompt-guidance.md) on EVERY submission** — mandatory 6-component optimization pipeline, reference indexing, multi-shot `Shot N:` grammar, anti-slop checklist, integrity checklist, and worked rewrites. Run the user's input through it before calling `seedance_generate`.
- **Read [prompt-prose-craft](references/prompt-prose-craft.md) on EVERY submission** — the language-level writing guide: verb physics, temporal phrasing, sensory compression, causal connectors, material anti-plastic vocabulary, atmosphere reliability, contrast pairs, and anti-patterns (negation, nested clauses, past tense). Governs HOW each component is phrased after the 6-component structure is filled.
- **Read [duration-calculus](references/duration-calculus.md) on EVERY submission** — `duration` is computed from dialogue word count, action beats, performance arcs, and camera minimums, then clamped to 4–15. Never guess it.
- Read [narrative-design](references/narrative-design.md) when the request is bigger than one shot — story, commercial, episode, montage. It produces the beat sheet and shot list the pipeline consumes.
- Read [character-card](references/character-card.md) whenever a character recurs across shots or clips — identity is a card (turnaround + expression strip + written identity block), never a single headshot.
- Read [performance-direction](references/performance-direction.md) for any shot with a face that emotes — micro-expression vocabulary, the entry→trigger→exit arc, and shot-size performance scaling.
- Read [continuity-and-editing](references/continuity-and-editing.md) for multi-clip projects — continuity ledger, 180°/30° rules, screen direction, first/last-frame chaining, cut grammar (J/L cuts, match-on-action, Kuleshov, montage), pacing curve, and what to unify in post.
- Read [color-design](references/color-design.md) when color should carry story — palettes, color script across beats, color-as-character motif, temperature arcs.
- Read [genre-grammar](references/genre-grammar.md) to load a genre's codified visual look (lighting/camera/color/staging conventions).
- Read [visual-language](references/visual-language.md) for the frame's meaning — motif & image systems, symbolism, motivated camera, depth staging, blocking/proxemics, POV, aspect-ratio-as-emotion.
- Read [production-design](references/production-design.md) when the world tells the story — props/set as backstory, texture as the anti-CGI lever, period detail, space-as-character.
- Read [aspect-ratio](references/aspect-ratio.md) for ratio-as-emotion plus delivery containers and multi-crop campaign matrices.
- Read [workflow](references/workflow.md) when the user needs ideation, genre routing, or I2V/T2V decision rules.
- Read [shot-design](references/shot-design.md) for the deep vocab on camera, composition, lens psychology, blocking, lighting, dialogue coverage, characters, style, and VFX.
- Read [audio](references/audio.md) for the four-layer sound model, dialogue, music, lip-sync, and beat-sync.
- Read [safety](references/safety.md) for copyright, content filters, anti-slop rewrites, and troubleshooting.
- **Read [assets](references/assets.md) whenever the input includes a real or virtual human portrait** — the Assets-upload flow is mandatory before generation.
- Read [examples](references/examples.md) for genre templates and Chinese examples.
- Read [vocabulary-zh](references/vocabulary-zh.md) when the user wants prompt-ready Chinese film language.
- Read [platform](references/platform.md) for operational constraints, asset budgets, and API key setup.

---

## Core rules

1. **Always optimize before submission.** Run the user's input through [`references/prompt-guidance.md`](references/prompt-guidance.md) (the 6-component pipeline + anti-slop pass + integrity check). Submit the optimized prompt, not the raw user input. Show the optimized prompt to the user before submitting.
2. Intent over micromanagement. Tell the model what happens and how it should feel.
3. References beat description. **If the reference is a human portrait → `seedance_generate` handles upload automatically. Other references can use direct URLs.**
4. In I2V, describe motion and camera only. Do not restate the image.
5. One primary camera move per shot. One primary action verb per shot.
6. Always name a lighting source — it is the highest-leverage single quality lever.
7. Keep prompts dense. Default target: 30–100 Chinese chars or one compact paragraph (50–120 English words). Past 150 words the model averages.
8. Use async submission only. Submit → return `task_id` → poll `seedance_check_task` on demand. No blocking, no `time.sleep`.
9. If the user wants to submit but no `ARK_API_KEY` is configured, run `seedance auth login` or see [platform](references/platform.md). Do not assume a key already exists.
10. **Watermark defaults to off.** Never enable watermark unless the user explicitly asks.
11. **Resolution defaults to `720p`.** Never fall back to `480p` silently. Use `1080p` only when the user explicitly requests it.
12. **Tag every reference in the prompt.** When `--image`, `--video`, or `--audio` are passed, the optimized prompt MUST tag each reference inline as `[image1]`, `[image2]`, `[video1]`, `[audio1]`, etc. (1-indexed, in argument order). Coverage rule: every passed reference must appear at least once as a tag; if you don't tag it, drop it from the call.
13. **Multi-shot prompts use `Shot N:` labels (中文: `镜头1:`) as the skeleton** — labels are the model's cut points; bare timestamp blocks are weaker and long unlabeled prose renders as one take. Shot budget: ≈4–6s per shot, max 3 shots per call; 4+ shots → split into chained calls. For an unbroken take, declare "single continuous take, no cuts". See [`references/prompt-guidance.md`](references/prompt-guidance.md) → "Multi-shot".
14. **Compute `--duration`, never guess it.** Dialogue word count, action beats, performance arcs, and camera-move minimums each have rates — sum per shot, clamp to 4–15, split calls when over. Report the math to the user ("3 shots → 13s"). See [`references/duration-calculus.md`](references/duration-calculus.md).
15. **Recurring characters need a character card, not a headshot** — turnaround + expression strip + written identity block, uploaded as `asset://`, bound with `[imageN]` and reused verbatim across every call of a project. See [`references/character-card.md`](references/character-card.md).
16. **Emotion is directed as physical behavior** — entry state → on-screen trigger → exit state, with micro-expression cues scaled to shot size. Emotion adjectives ("sad", "emotional") are slop. See [`references/performance-direction.md`](references/performance-direction.md).
17. **Prompt prose is craft, not filler.** Every verb encodes visible physics + consequence; temporal progression uses "first/then/by the end" markers; environment phrases compress material + condition + light interaction; present tense only; no negation (rewrite as positive); no nested who/which/that chains. See [`references/prompt-prose-craft.md`](references/prompt-prose-craft.md).

---

## Generate a video

Invoke with `/seedance generate <prompt>` or just describe what you want — the skill triggers automatically.

**Text-to-video:**
```
/seedance generate a silver espresso machine on a modern kitchen counter,
morning light cuts in, steam rises slowly, camera slowly pushes in
```

**Image-to-video (portrait / reference image):**
```
/seedance generate [image1] smiles softly, camera slowly pushes in --image https://example.com/portrait.jpg
```

**Full options:**
```
/seedance generate <prompt>
  --image <url>          Reference image (auto-uploaded to asset library for portraits)
  --video <url>          Reference video — motion/camera rhythm, or a clip to extend. Repeatable, max 3. Tag [video1]…
  --audio-ref <url>      Reference audio — lip-sync / beat / pacing (MP3/WAV). Repeatable, max 3. Tag [audio1]…
  --first-frame <url>    Pin the exact starting frame
  --last-frame <url>     Pin the ending frame (requires --first-frame)
  --ratio 9:16           Aspect ratio: 21:9 | 16:9 | 4:3 | 1:1 | 3:4 | 9:16 | adaptive
  --duration 6           Length in seconds (4–15)
  --resolution 1080p     Quality: 480p | 720p | 1080p
  --audio                GENERATE a matching audio track (boolean — not a reference)
  --fast                 Use faster/cheaper model variant
  --seed 42              Reproducible results
  --camerafixed          No camera movement (product shots)
```

**All-round reference (image + video + audio):**
```
/seedance generate the singer [image1] performs on the neon stage, dance timing and
camera rhythm follow [video1], cuts land on the beats of [audio1]
  --image https://example.com/singer.jpg
  --video https://example.com/dance-ref.mp4
  --audio-ref https://example.com/track.mp3
```

**Video extension (continue an existing clip):** there is no separate extend
endpoint — pass the previous output as a `--video` reference and describe the
continuation. Keep character, scene, and lighting locked.
```
/seedance generate extend [video1] backward by 5 seconds; the woman keeps walking
down the same corridor, character, background, and lighting unchanged
  --video https://.../previous-output.mp4
```
For dramas longer than ~15s, prefer **segmented splicing**: generate each
10–13s beat independently with the *same* reference set + template, then splice
in an editor. Use extension for single continuous takes (dialogue, one-path
movement); use splicing for scene changes and fast action.

The MCP tool `seedance_generate` handles everything automatically:
1. Creates an asset group and uploads every plain-HTTPS `--image` reference to the BytePlus asset library (any non-`asset://` URL — not just portraits); `asset://` refs are passed through untouched
2. Passes any `--video` / `--audio-ref` references through (URL-only, not uploaded) — bound by content role and matched to `[video1]` / `[audio1]` tags
3. Submits the generation job
4. Returns `task_id` — poll `seedance_check_task` every 10–15 seconds until `status == "succeeded"`

---

## Check task status

```
/seedance status <task_id>
```

Returns `status` (queued | running | succeeded | failed | cancelled) and `video_url` when done.

---

## List recent tasks

```
/seedance list
/seedance list --status succeeded
/seedance list --limit 20
```

---

## Upscale / enhance an existing video

Standalone capability — **independent of `seedance_generate`**. Takes a publicly accessible
video URL (e.g. a Seedance output URL) and runs AI enhancement (denoise, color, artifact
removal, super-resolution up to 4K) via BytePlus AI MediaKit.

- Requires `MEDIAKIT_API_KEY` (separate from `ARK_API_KEY`; created in the AI MediaKit console).
- Async, two-step like generation: submit → poll. Terminal status is `completed` | `failed`
  (note: **not** `succeeded`), so poll with `byteplus_check_upscale_task`, not `seedance_check_task`.
- **Idempotent**: identical parameters reuse the same task for 24h. Pass `force_new=True` (or a
  distinct `client_token`) to force a fresh task on identical input.
- Output `video_url` is valid for **24 hours** — download promptly.

MCP:
```
byteplus_upscale_video(video_url="https://.../output.mp4", tool_version="standard", resolution="1080p")
→ { task_id: "amk-tool-enhance-video-xxxx", status: "submitted" }

byteplus_check_upscale_task(task_id="amk-tool-enhance-video-xxxx")
→ { status: "completed", video_url: "https://...", resolution: "1080p", fps: 60 }
```

CLI:
```bash
seedance upscale https://.../output.mp4 --resolution 1080p --watch
seedance upscale-status <task_id>
```

Key options: `--tool-version standard|professional`; `--resolution 240p..1080p|2k|4k`
(mutually exclusive with `--resolution-limit <128..2160>`); `--scene` (standard only:
`common|ugc|short_series|aigc|old_film`); `--bitrate-level low|medium|high`; `--fps 15..120`.

---

## Asset library (for portraits / sensitive images)

Plain HTTPS image URLs for human faces return `InputImageSensitiveContentDetected`.
`seedance_generate` (MCP) and `seedance generate` (CLI) handle this automatically.

For manual control or reusing assets across multiple generations:

```bash
seedance asset group create my-portraits       # one-time per project
seedance asset upload https://... --group <id> # returns asset://asset-xxx
seedance generate --image "asset://asset-xxx"  # skip re-upload
```

See [`references/assets.md`](references/assets.md) for the full API reference,
best practices for splitting portrait references, and failure recovery.

---

## MCP tools reference

| Tool | Description |
|---|---|
| `seedance_generate` | Full pipeline: upload portraits + submit + return task_id (preferred) |
| `seedance_check_task` | Poll status, get video_url when succeeded |
| `seedance_text_to_video` | Fine-grained T2V — returns task_id |
| `seedance_image_to_video` | Fine-grained I2V with multiple refs — returns task_id |
| `byteplus_upscale_video` | Upscale/enhance an existing video (AI MediaKit, up to 4K) — returns task_id |
| `byteplus_check_upscale_task` | Poll an upscale task; get enhanced video_url when completed |
| `seedance_list_tasks` | Browse generation history |
| `seedance_cancel_task` | Cancel a queued or running job |
| `seedance_create_asset_group` | Create asset group (manual flow) |
| `seedance_upload_asset` | Upload image, poll until Active (manual flow) |
| `seedance_get_asset` | Check asset status |
| `seedance_list_tos_buckets` | List TOS buckets (call before asking which bucket to upload to) |
| `seedance_upload_image_to_tos` | Upload a **local** image file to a TOS bucket → public URL |
| `seedance_list_models` | Show available models and capabilities |
| `seedance_ping` | Verify credentials and connectivity |

---

## Troubleshooting

**`InputImageSensitiveContentDetected`** — Use `seedance_generate` (auto-uploads to asset library) instead of passing the raw URL to `seedance_image_to_video`.

**`ARK_API_KEY not configured`** — Run `seedance auth login` or `export ARK_API_KEY=...`.

**MCP timeout** — Never use blocking generation. Always use the two-step pattern: submit → poll `seedance_check_task`.

**Output jitter or drift** — Shorten the prompt, enforce One-Move Rule (one camera move per shot), add explicit lighting source.

**Character identity drift** — Re-upload identity references as separate assets (face / outfit / three-view). See [`references/assets.md`](references/assets.md) → Best practice section.

**Prompt blocked by content filter** — Rewrite using production language: name the shot size, camera move, lighting source, and surface detail. See [`references/safety.md`](references/safety.md).

**Reinstall after update:**
```bash
pip install --upgrade "seedance-cli[mcp]"
seedance skill install
```
