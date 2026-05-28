# Handoff: Lumen Hub — Cinematic Editorial Redesign

## Overview

Redesign of **Lumen Hub** (`Simon-ZSM/lumen-hub`), a self-hosted AI image & video studio built on BytePlus ModelArk (Seedream 5.0 Lite + Seedance 1.5 Pro / 2.0). The redesign replaces the current generic dark gradient UI with a **cinematic editorial** aesthetic — think arthouse film journal, not SaaS dashboard. Black paper, large Instrument Serif display type, monospace meta, numbered sections, hot orange accent, film grain overlay.

Target repo: **Next.js 16 + React 19 + Tailwind v4 + Radix UI + lucide-react** (already set up).

---

## About the Design Files

The files in `prototype/` are **design references created in HTML** — a working React-in-HTML prototype demonstrating the intended look and behavior. **Do not copy them directly** into the Next.js app. Instead, **recreate these designs in the existing codebase** using its established stack:

- React components in `components/`
- Tailwind v4 (with `@theme inline` tokens in `globals.css`)
- Radix primitives (`@radix-ui/react-tabs`, `-select`, `-label`, etc.)
- `lucide-react` icons
- `cn()` helper in `lib/utils.ts`
- `class-variance-authority` for button variants

The `lib/byteplus.ts`, `app/api/**` server code, and `components/video-generator.tsx` polling logic **must not change** — only swap the UI layer.

## Fidelity

**High-fidelity.** Pixel-perfect intent for colors, typography, spacing, and interactions. All tokens below are final values. The HTML prototype uses inline styles and a single `<style>` block for speed — when porting, convert these to the project's Tailwind v4 `@theme` tokens + utility classes.

---

## Visual Direction

**Mood:** Arthouse film journal. Dim room. Nothing loud. Typography carries the identity.

**Do:**
- Use Instrument Serif at display sizes (64–220px) for headlines
- Let monospace meta (10–11px, ALL CAPS, 0.12–0.16em letter-spacing) do the labeling work
- Keep backgrounds near-black (`#05050a` / `#07070d`)
- Use a single hot accent — **arc-lamp orange** `oklch(0.72 0.22 35)` — sparingly
- Add film-grain overlay (fixed, `mix-blend-mode: overlay`, opacity 0.04)
- Use numbered section plates (§01, §02…) and figure labels ("Fig. 01 ·")
- Mix italic + roman in the same headline for editorial rhythm

**Don't:**
- Bright purple→pink→amber gradients (the old hero)
- Drop shadows beyond 1px subtle borders
- Rounded cards everywhere — use crisp corner ticks (see `.corner`)
- Emoji or icons-in-circles as primary decoration — use letterform glyphs (α β γ φ ψ Ω Λ ☉) from the serif instead

---

## Design Tokens

### Colors (CSS custom properties)

```css
:root {
  --bg: #05050a;                                  /* app background */
  --ink: #f2f0e8;                                 /* warm paper foreground */
  --ink-dim: #8a8880;                             /* secondary text, meta */
  --ink-mute: #4a4a45;                            /* disabled / tertiary */
  --line: rgba(242, 240, 232, 0.09);              /* default border */
  --line-strong: rgba(242, 240, 232, 0.20);       /* hover / active border */
  --panel: #0a0a10;                               /* input bg */
  --panel-2: #0f0f17;                             /* raised panel bg */
  --accent: oklch(0.72 0.22 35);                  /* arc-lamp orange */
  --accent-soft: oklch(0.72 0.22 35 / 0.15);      /* accent tint */
  --accent-ink: #05050a;                          /* ink on accent surfaces */
}
```

Map these into Tailwind v4's `@theme inline` block in `app/globals.css` so you can use `bg-background`, `text-foreground`, `border-border`, `text-accent`, etc.

### Accent variants (Tweaks — optional for production)

```css
[data-palette="cyan"]  { --accent: oklch(0.82 0.14 220); }
[data-palette="lime"]  { --accent: oklch(0.88 0.20 130); }
[data-palette="ghost"] { --accent: #f2f0e8; }
```

### Typography

Load via `next/font/google` in `app/layout.tsx`:

```ts
import { Instrument_Serif, Inter_Tight, JetBrains_Mono } from "next/font/google";

const serif = Instrument_Serif({ subsets:["latin"], weight:["400"], style:["normal","italic"], variable:"--font-serif" });
const sans  = Inter_Tight({ subsets:["latin"], weight:["300","400","500","600","700"], variable:"--font-sans" });
const mono  = JetBrains_Mono({ subsets:["latin"], weight:["400","500"], variable:"--font-mono" });
```

Add to `@theme inline`:

```
--font-serif: var(--font-serif);
--font-sans:  var(--font-sans);
--font-mono:  var(--font-mono);
```

### Type scale

| Role | Family | Size | Line-height | Letter-spacing | Notes |
|---|---|---|---|---|---|
| **Mega display** | Instrument Serif | `clamp(64px, 13vw, 220px)` | `1.02` | `-0.02em` | Hero headline. Mix italic + roman. |
| **Display H1** | Instrument Serif | `clamp(40px, 6vw, 80px)` | `0.95` | `-0.02em` | Studio page title |
| **Section H2** | Instrument Serif | `clamp(32px, 4.4vw, 56px)` | `1.0` | `-0.02em` | Numbered sections |
| **Instrument name** | Instrument Serif | `64px` | `0.95` | `-0.025em` | Capability card title |
| **Wordmark** | Instrument Serif | `26px` | `1` | `-0.02em` | "Lumen" in header |
| **Body** | Inter Tight 400 | `14–15px` | `1.5–1.6` | default | Descriptions |
| **UI label / button** | Inter Tight 500 | `12–13px` | `1` | `0.01em` | Buttons, inputs |
| **Plate / meta** | JetBrains Mono 400 | `10–11px` | `1` | `0.12–0.16em` | UPPERCASE. Section plates, tile labels, status. |
| **Tile glyph** | Instrument Serif italic | `clamp(56px, 14vw, 180px)` | `1` | — | Letterform placeholder centerpiece |

**Critical:** All-caps mono labels must always have ≥0.1em letter-spacing, or they look cramped.

### Spacing

Stick to Tailwind's default scale but favor: `12 14 16 18 20 24 28 36 48 64 80 96 120` (px).

### Border radius

- Inputs / chips / buttons: `10–12px` (buttons use `999px` for pill shape)
- Panels / cards: `14–16px`
- Tiles (media): `12px`
- No radius > 16px except pills.

### Borders

All borders are single-pixel `var(--line)`. On hover / active, promote to `var(--line-strong)` — never draw thicker lines.

### Film grain overlay

```css
body::before {
  content: "";
  position: fixed; inset: 0;
  pointer-events: none; z-index: 100;
  opacity: 0.04;
  mix-blend-mode: overlay;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' seed='3'/><feColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 1 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>");
}
```

---

## Screens / Views

### 1. Landing (`app/page.tsx`)

**Purpose:** Marketing index that sells the tool and sends user to `/generate`.

**Max width:** `1440px`, horizontal padding `28px`.

**Sections (in order):**

#### §01 — Top meta rail
Three-column grid, all JetBrains Mono 11px, uppercase, `letter-spacing: 0.12em`, color `--ink-dim`:
- Left: `Vol. 04 · 2026`
- Center: `A Studio for Synthetic Cinema`
- Right: `SEEDREAM × SEEDANCE`

#### §02 — Mega hero headline
Centered. Two lines:
```
Direct <span class="accent">light</span>
into <span class="italic">motion.</span>
```
- "light" in `var(--accent)`, roman
- "motion." in italic, `--ink` color
- Line-height `1.02` (descenders must not collide)
- `<br />` between the two lines

#### §03 — Three-column CTA row
Grid `1fr auto 1fr`, aligned to baseline, `gap: 24px`, bottom-bordered:
- **Left:** supporting paragraph (max-width 360px, body size, `--ink-dim`): *"Lumen Hub is a self-hosted atelier for generative imagery & video. Seedream renders stills at four-thousand pixels. Seedance stages ten-second shots with native motion."*
- **Center:** two pill buttons side-by-side — primary (`var(--accent)` bg, `var(--accent-ink)` text) labeled `Enter the studio →`, and outline labeled `Watch reel`
- **Right:** stacked mono meta, right-aligned: `LATEST FRAME` / `task_ff29a1 · 07s ago`

#### §04 — Mosaic grid (12-col)
`display: grid; grid-template-columns: repeat(12, 1fr); gap: 12px`:
- **Col-span 5:** one large tile, aspect `4/5`, hue 28 (warm)
- **Col-span 4:** stacked rows of two tiles, hues 64 + 210
- **Col-span 3:** stacked rows of two tiles, hues 190 + 10

Each tile is a **PlaceholderTile** (see Components).

#### §05 — Figure footnote rail
Four-column mono row under the mosaic:
`Fig. 01 · cinematic-wide` / `Fig. 02 · handheld-loose` / `Fig. 03 · anamorphic-2.39` / `Fig. 04 · tripod-static`

#### §06 — Ticker marquee
Full-width band, `1px` borders top+bottom, `14px` vertical padding, auto-scrolling (CSS keyframes, 42s linear infinite). Mono 11px, uppercase. Items duplicated for seamless loop. Number prefix (`01`, `02`…) in `var(--accent)`, then copy. Dots between.

#### §07 — `§01 INSTRUMENTS` section
Section header with numbered plate, large serif subheading. Two side-by-side instrument cards (50/50 split inside each — left: copy, right: full-bleed placeholder tile).

Card content:
- Card A (Seedream 5.0 Lite, "Still images") — bullets: Text → Image, Image editing, Multi-image fusion, Up to 4K
- Card B (Seedance 1.5 Pro / 2.0, "Moving images") — bullets: Text → Video, Image → Video, First + last frame, Multi-reference · audio (2.0)

#### §08 — `§02 METHOD` section
Three-column row (no borders between — just a `1px` left border separating cols 2 and 3):
- i. Prompt, directed
- ii. Async by design
- iii. Keyframe control

Each has a big serif Roman numeral in `var(--accent)` at top, serif 28px title, body copy.

#### §09 — `§03 MANIFEST` band
Background shifts to `#07070d` with top+bottom `1px` borders. Two-column grid:
- Left: mono plate + serif pull-quote (`clamp(28px, 3.4vw, 48px)`, italic mixed with roman)
- Right: two placeholder tiles side-by-side (3/4 aspect)

Quote copy:
> *A studio should feel like a **room** — dim, quiet, attentive. The tools should recede. Only the **picture** should speak.*

#### §10 — `§04 SHOT LIST` grid
Six-column row of 3/4 tiles with labels like `HUMMINGBIRD · MACRO · 5.0`, `TOKYO TUNNEL · i2v · 720P`, etc.

#### §11 — `§05 GO` CTA
Centered. Mega serif: `Your first frame awaits.` ("first frame" in italic `var(--accent)`). Primary button below. Mono meta underneath with `<kbd>` element: `No account · keys stay on your machine · G to skip the tour`.

#### §12 — Footer
Four-column grid: wordmark + tagline / Instruments / Method / Credits. Thin mono copyright bar underneath.

---

### 2. Studio (`app/generate/page.tsx` + `app/generate/tabs.tsx`)

**Purpose:** The working generator. Two tabs (Image, Video) sharing a session.

**Max width:** `1440px`. Padding `28px 28px 120px`.

#### Studio header (three-column grid, aligned baseline)
- Left: `§ STUDIO · SESSION 0421` plate + `Direct a new shot.` display title (italic "shot.")
- Center: pill-rail tabs (Image / Video) with a 6px dot that lights `var(--accent)` when active
- Right: mono hint `⌘ return to render · ⌘K presets`

#### Preset rail
Horizontal scrolling row of chips below the header. Label `STYLE PRESETS` (mono, uppercase), then chips:
`Kodak Vision3 250D · Anamorphic 2.39 · Studio Polaroid · Handheld 16mm · IMAX Reverie · Neon Noir · Golden Macro · Brutalist Still · Liminal Mall`
Plus a `+ save current` chip in accent color on the right.

#### Two-column body: `380px / 1fr` (image) or `420px / 1fr` (video)

**Left = sticky control aside** (`position: sticky; top: 80px`). Wrap each control group in a **Panel** component:
- Panel header: mono section label (e.g. `§ 01 PROMPT`) on left, italic serif number (`01`) on right, `1px` bottom border
- Body: `14px` padding

**Right = results canvas**

#### Panels — image tab (in order)
1. **§ 01 Prompt** — textarea (5 rows, min-height 110px), chips for "try #1, #2, #3" below
2. **§ 02 Engine** — ModelList: one button per model, active state `border-color: var(--accent)` + `background: var(--accent-soft)`, tiny dot (8px) turns accent when active
3. **§ 03 Format** — Size select + Seed/Count row

Then a primary full-width button `Render image ↵` and a mono footnote.

#### Panels — video tab (in order)
1. **§ 01 Engine** — ModelList (Seedance 1.5 Pro / Seedance 2.0)
2. **§ 02 Mode** — 3 or 4 ModeBtns (`Text → video`, `Image → video`, `First+Last keyframes`, +`Ref multimodal` for 2.0). When `i2v` or `first_last`, reveal FrameSlot(s). When `reference`, reveal ReferencePanel.
3. **§ 03 Prompt** — textarea + chips
4. **§ 04 Parameters** — Res / Duration / Ratio selects in a 3-col row; Seed below; two Toggles at bottom (`Fixed camera`, and for 2.0 only `Generate audio`)

Primary button `Render video ↵`.

#### Results panel
Ledger header: mono label `Session ledger · image|video` on left; three Stat blocks on right (serif 22px number, mono 9px uppercase label). Labels: `In queue`, `Rendered`, `Total`.

**Image gallery:** 2-column grid of figures. Each figure shows PlaceholderTile (aspect = `W/H` from size) + caption row with mono meta + prompt + action chips (↓ save, ↻ remix, ⋯ more).

**Video queue:** 1-column stack of cards. Each card: media on top (PlaceholderTile if succeeded; a progress state otherwise — see below) + 16px footer row with status dot + status + id + timeAgo + prompt + mono parameter summary + action chips.

**Pending video state:** Full-bleed canvas with a subtle `80×80` grid pattern, centered SVG progress ring (44px, `stroke="var(--accent)"`, `strokeDasharray` based on 0–1 progress), mono status label below (`queued · 6%`). Corner ticks in all four corners. Progress animates every ~600ms.

**Empty state:** Dashed `1px` border box, 80px padding. Giant watermark "lumen" in `Instrument Serif italic 140px`, `rgba(242,240,232,0.06)`, positioned absolute at top-center. Relative content: mono `§ awaiting input` plate, serif 40px `The page is blank.` ("blank." italic), body copy.

#### Studio footer
Thin row with mono meta: `Session persists locally · nothing uploaded` | `Press ? for bindings · ⌘↵ render`

---

### 3. Header (`components/site-header.tsx`)

Sticky top, `rgba(5,5,10,0.65)` bg, `backdrop-blur: 14px`, `1px` bottom border.

Three-column: wordmark / center nav (Index / Studio / Reels / Log as `railtab` buttons, the current route highlighted with `background: var(--ink); color: var(--bg);`) / right cluster: mono `● ENGINE ONLINE` (green dot `oklch(0.8 0.18 145)`), a small `⌘K` button, and primary `Enter Studio →`.

**Wordmark:** 24px circle SVG with a filled accent circle inside + small bg dot, then serif "Lumen" + mono "HUB".

---

## Components (to build in `components/`)

### `PlaceholderTile`
A visual placeholder for unrendered media. Props: `label`, `meta`, `hue` (OKLCH hue), `ratio` (e.g. "3/4", "16/9"), `kind` ("stripes" | "duotone" | "scan"), `glyph` (single letterform character).

Structure:
- Relative container with `aspect-ratio`, `overflow: hidden`, `12px` radius, `1px` border
- Background determined by `kind`:
  - **stripes:** `repeating-linear-gradient(100deg, oklch(0.16 0.06 HUE) 0 18px, oklch(0.11 0.05 HUE) 18px 36px)`
  - **duotone:** two radial gradients (warm top-left, cool bottom-right using `(hue+180)%360`) over a vertical linear
  - **scan:** linear gradient + scanline overlay (`repeating-linear-gradient(0deg, transparent 0 2px, rgba(0,0,0,0.35) 2px 3px)`)
- Gradient dim overlay at bottom
- Four corner ticks (`.corner.tl/.tr/.bl/.br` — 10px, `1px` border, only two edges each)
- Centered italic serif glyph (e.g. "α")
- Label bottom-left (mono 10px, uppercase, 0.14em tracking)
- Meta top-right (mono 10px, 0.1em tracking, `rgba(242,240,232,0.55)`)

### `Button` variants (extend the existing `button.tsx`)
- `default` — outline pill, `1px var(--line-strong)` border, transparent bg
- `primary` — `bg var(--accent)`, `text var(--accent-ink)`, `border var(--accent)`
- `ghost` — no border
- Sizes: `sm` (6×10px, 11px), default (10×16px, 13px), `lg` (14×22px, 14px)
- All use `border-radius: 999px`. Hover: `translateY(-1px)`, promote border to `--ink`.

### `Chip`
Small pill (`4×10px`, `11px`, mono), outline, `--ink-dim` text, hover promotes text+border. Active state (`aria-pressed="true"`): `background: var(--ink); color: var(--bg); border-color: var(--ink)`.

### `ModeBtn`
Flex-column button, 12px padding, 12px radius. Big serif glyph at top (26px), then label (12px 500) + sub (mono 9px uppercase). Active: `border-color: var(--accent); background: var(--accent-soft)`; glyph color → accent.

### `Toggle`
Row: label + hint on left, custom switch on right (28×16px track, 12px knob). Track bg `rgba(242,240,232,0.15)` → `var(--accent)` when pressed. Knob translates 12px.

### `Select` (use Radix)
Reskin `@radix-ui/react-select` with `fld` styling: `1px var(--line)` border, `#0c0c14` bg, 10px radius, focus ring → `var(--accent)`. Dropdown: `#0c0c14` bg, `1px var(--line-strong)` border, 10px radius, drop-shadow `0 20px 60px rgba(0,0,0,0.6)`. Selected item: `var(--accent-soft)` background.

### `Ticker`
Marquee with CSS `@keyframes mq { from: translateX(0) to: translateX(-50%) }`, `42s linear infinite`. Track has items duplicated to achieve seamless loop.

### `Panel`
Bordered card with a mono+italic-serif header bar. See Studio section above.

---

## Interactions & Behavior

### Landing
- Hero words animate in with `riseIn` keyframe (12px translateY + opacity, `0.7s ease`), staggered 80ms
- Ticker continuously scrolls (pure CSS)
- Buttons: hover = `translateY(-1px)` + brighter border (150ms)
- All CTAs route to `/generate` (variants push `?tab=video` for the "video" CTA)

### Studio
- Tab switch persists via Radix `<Tabs>` controlled state. Current URL should sync `?tab=image|video`.
- Prompt chips populate the textarea on click.
- Model switch on Video: if switching **away from** Seedance 2.0, force-reset `duration` if it's 15 or -1 back to 5, and force-reset `mode` if it's `reference` back to `t2v`.
- Mode change: show/hide FrameSlot(s) and ReferencePanel.
- FrameSlot: file input, reads as data URL, shows preview; remove button top-right.
- Generate:
  - **Image:** POST `/api/image` (unchanged). While pending, render a shimmer tile. On success, prepend to gallery.
  - **Video:** POST `/api/video`. Push a `{status: "queued"}` job card at top. Existing polling loop (3s interval, 200 max tries) updates the card through `running → succeeded/failed`. Render the SVG progress ring driven by `progress` (derive from elapsed time or BytePlus progress field if available).

### Edit-mode / Tweaks
Optional for production. If keeping, wire three `data-*` attributes on `<html>`:
- `data-palette="arc|cyan|lime|ghost"` — swaps `--accent`
- `data-density="editorial|compact"` — compact variant tightens: `.mega` scale 52–160 instead of 64–220, inputs `8×10px`, buttons `lg` → 11×18px, chips `3×8px`, sections padding 12px
- `data-hero="stripes|duotone|scan"` — switches PlaceholderTile default kind

### Animations

```css
@keyframes riseIn    { from { opacity: 0; transform: translateY(12px) } to { opacity: 1; transform: none } }
@keyframes shimmer   { 0% { background-position: -200% 0 } 100% { background-position: 200% 0 } }
@keyframes stripeMove{ from { background-position: 0 0 } to { background-position: 32px 0 } }
@keyframes marquee   { from { transform: translateX(0) } to { transform: translateX(-50%) } }
@keyframes pulse     { 0%,100% { opacity: 1 } 50% { opacity: 0.4 } }
```

All UI transitions are `150ms ease` for colors/borders, `700ms ease` for entry animations.

---

## State Management

Keep existing state shapes in `components/image-generator.tsx` and `components/video-generator.tsx`. Only the render output changes. Specifically preserve:
- Image: `prompt, model, size, seed, loading, error, images[]`
- Video: `model, mode, prompt, resolution, duration, ratio, seed, cameraFixed, audio, firstFrame, lastFrame, references[], audioUrl, generateAudio, jobs[], submitting, error`
- All `fetch()` calls and the `useEffect` polling loop — **unchanged**
- `SUGGESTIONS` and `MODELS` arrays — **unchanged** (optionally adopt the expanded preset list from the prototype)

---

## Assets

No external image assets required. All media in the prototype is CSS-generated (stripes / radial gradients / scanlines) with serif letterform glyphs as centerpieces. This is intentional — it reads as "placeholder, awaiting real render" while still looking finished. When the real Seedream/Seedance output lands, swap the PlaceholderTile for an `<img>` or `<video>` at the same aspect ratio, keeping the corner ticks, label, and meta overlays on top.

---

## Files to modify in the target repo

| File | What to do |
|---|---|
| `app/layout.tsx` | Swap fonts to Instrument Serif + Inter Tight + JetBrains Mono via `next/font/google`. Add their CSS variables to `<html className=…>`. |
| `app/globals.css` | Replace CSS variables with the palette above. Add grain overlay, keyframes, utilities (`text-gradient-brand` can be removed). Wire `@theme inline` to expose tokens to Tailwind. |
| `app/page.tsx` | Rewrite to the Landing structure above. |
| `app/generate/page.tsx` | Keep route; restyle header strip. |
| `app/generate/tabs.tsx` | Restyle `TabsList`/`TabsTrigger` as the pill rail; add the preset rail row beneath. |
| `components/site-header.tsx` | Rewrite with the wordmark + editorial nav. |
| `components/image-generator.tsx` | Keep logic. Rebuild the JSX using Panel / ModelList / Chip / Select primitives. Results → ImageGallery with PlaceholderTile while loading. |
| `components/video-generator.tsx` | Keep logic (including polling). Rebuild JSX; replace shimmer block with the SVG progress ring. Restyle ModeButton, FrameUpload, ReferencePanel, JobCard, VideoEmptyState. |
| `components/ui/button.tsx` | Add `primary` variant with accent bg; ensure `lg` size matches spec. |
| `components/ui/select.tsx`, `tabs.tsx`, `label.tsx`, `textarea.tsx` | Reskin to match `fld` / `railtab` specs. |
| `components/ui/placeholder-tile.tsx` | **New** — port from prototype. |
| `components/ui/ticker.tsx` | **New** — port from prototype. |
| `components/ui/panel.tsx` | **New** — port from prototype. |

---

## Reference files in this bundle

- `prototype/Lumen Hub.html` — entry document with tokens, grain, fonts, tweak wiring
- `prototype/app/primitives.jsx` — Header, Wordmark, PlaceholderTile, Ticker, SectionHead
- `prototype/app/landing.jsx` — the full Landing page
- `prototype/app/studio.jsx` — Image + Video studios, all panels, all field primitives
- `prototype/app/app.jsx` — route shell

Open `Lumen Hub.html` in a browser and use the Tweaks panel (bottom-right toggle, if surfaced by the host) to explore palette / density / hero variants.

---

## Definition of done

- [ ] `npm run dev` compiles without TypeScript errors
- [ ] Both `/` and `/generate?tab=image|video` render pixel-close to prototype
- [ ] All existing `fetch()` and polling behavior preserved
- [ ] Keyboard: `Tab` reaches every control in a sane order; `Enter` submits prompts
- [ ] Mobile: below 768px, aside collapses above the results canvas; hero mega scales down cleanly
- [ ] Lighthouse perf ≥ 90 on landing (no blocking fonts — use `display: swap`)
