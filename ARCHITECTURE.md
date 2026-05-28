# Lumen Hub Architecture

Lumen Hub is a local-first creative workstation built on Next.js 16. It combines:

- marketing and discovery surfaces (`/`, `/showcase`, `/reels`)
- creation surfaces (`/generate`, `/compare`, `/studio`)
- asset management (`/library`)
- optional cloud identity and sync (Supabase)
- server-side adapters to multiple AI providers (BytePlus, fal.ai, MiniMax)

At a high level, the system is designed so that the UI works on a fresh clone with only local browser storage, while external APIs and cloud sync progressively add capability.

## 1. System Overview

```text
Browser UI
  |- Landing / Showcase / Reels
  |- Generate / Compare / Studio / Library
  |- localStorage stores
  |- useSyncExternalStore snapshots
  v
Next.js App Router
  |- Server-rendered route entries
  |- Client shells for interactive tools
  |- API routes under /app/api/*
  v
Service Adapters
  |- BytePlus  -> images, video, captioning
  |- fal.ai    -> GPT Image 2
  |- MiniMax   -> video + TTS
  |- Supabase  -> auth + optional cloud mirror
  v
Persistence
  |- Browser localStorage
  |- public/library-cache/ mirrored media on disk
  |- Supabase Postgres tables (optional)
```

## 2. Architectural Principles

### Local-first by default

The app works without Supabase or any cloud database configuration. The main persisted state lives in browser `localStorage`:

- Library assets: `lib/library/assets.ts`
- Studio projects: `lib/studio/projects.ts`
- Compare saved pairs: `lib/compare/saved-pairs.ts`
- transient render queues: module-level memory in `lib/library/in-flight.ts`

This makes the app usable immediately in local development and on single-device installs.

### Thin route layer, richer adapters

The App Router API handlers mostly validate input, select the upstream provider, and normalize errors. Provider-specific request/response logic lives in:

- `lib/byteplus.ts`
- `lib/fal.ts`
- `lib/minimax.ts`

That separation keeps UI code provider-agnostic.

### Unified client contracts

Even though the app talks to multiple upstream providers, the client mostly sees one normalized shape:

- images return BytePlus-style `{ data: [{ url }] }`
- video creation returns `{ id, model, status }`
- video polling returns `{ id, status, content?.video_url }`

This is why Generator, Compare, and Studio nodes can reuse the same render hooks.

### Best-effort durability upgrades

Generated assets are saved immediately into the local Library, then upgraded asynchronously:

1. save metadata to local store
2. attempt local media mirroring to `/public/library-cache`
3. if signed in, mirror metadata to Supabase

The render success path does not block on those upgrades.

## 3. Route Map

### Discovery and editorial surfaces

- `/`: landing page and editorial framing
- `/showcase`: case studies and proof-of-work
- `/showcase/[caseId]`: detailed case page
- `/reels`: curated template library by industry and model family

These routes primarily explain or seed creation flows. They are mostly static or lightly interactive.

### Creation surfaces

- `/generate`: prompt-first generator for image, video, and audio
- `/compare`: side-by-side engine comparison
- `/studio`: project dashboard for node-graph workflows
- `/studio/[id]`: graph editor and runner
- `/library`: saved renders and references
- `/sign-in`: optional auth and cloud-sync entry point

### Service routes

- `/api/image`: image generation
- `/api/video`: async video task creation
- `/api/video/[id]`: async video task polling
- `/api/audio`: text-to-speech generation
- `/api/caption`: image-to-prompt captioning
- `/api/library/mirror`: remote BytePlus asset -> local disk mirror
- `/api/media`: same-origin media proxy for BytePlus CDN assets

## 4. Frontend Layer

## 4.1 App Router composition

The app uses the Next.js App Router with a mostly server-entered, client-shell architecture:

- page entry points under `app/*/page.tsx` are small and compositional
- large interactive surfaces live in client components such as:
  - `app/generate/tabs.tsx`
  - `app/compare/compare-shell.tsx`
  - `app/library/library-shell.tsx`
  - `app/studio/studio-canvas.tsx`

`app/layout.tsx` mounts the `AuthProvider` globally so every client component can read auth state without prop drilling.

## 4.2 UI state model

There are three main UI state categories:

- route/query state: deep links, presets, compare params
- local persistent state: assets, projects, saved pairs
- transient execution state: in-flight renders, polling, node status

The app intentionally avoids a single global state manager. Instead it uses small domain stores with `useSyncExternalStore` compatibility. That keeps domain boundaries clear and preserves stable snapshot references.

## 4.3 Domain stores

### Library store

`lib/library/assets.ts` persists asset metadata in `localStorage` under `lumen.library.assets.v1`.

Each asset can represent:

- generated image
- generated video
- generated audio
- uploaded/imported reference

The record includes:

- canonical URL
- optional mirrored same-origin URL
- generation metadata such as prompt, model, ratio, duration
- organization metadata such as tags and pin state
- lineage metadata such as `derivedFrom` and `projectId`

### Studio project store

`lib/studio/projects.ts` persists project envelopes in `localStorage` under `lumen.studio.projects.v2`.

Each project stores:

- id, name, timestamps
- optional originating template id
- a canvas snapshot of nodes and edges

Saved canvas data is intentionally lossy: runtime outputs, statuses, and cached run hashes are not persisted across reloads. Only the editable graph structure and form inputs are kept.

### Compare saved pairs

`lib/compare/saved-pairs.ts` persists user-defined engine pairings in `localStorage`. These are lightweight presets for model-vs-model comparisons, not full render jobs.

### In-flight queues

`lib/library/in-flight.ts` holds pending image/video jobs in module memory so the feed can show active renders even if tabs unmount and remount.

## 5. Core Workflows

## 5.1 Reels -> Generate preset workflow

Purpose: turn curated templates into runnable Generator state.

Flow:

1. Reels templates are defined in `lib/reels/templates.ts`
2. A user clicks a template CTA
3. The app navigates to `/generate?preset=<id>`
4. `app/generate/page.tsx` resolves the preset
5. `lib/reels/preset-bridge.ts` converts template data into generator state
6. `GenerateTabs` hydrates the correct tool tab and shows a breadcrumb

Important detail: `preset-bridge.ts` is the translation layer between design-time template data and runtime form state. It handles mismatches like:

- image size shorthand -> concrete dimensions
- prompt prefixes -> explicit video mode
- templates that require user-supplied assets such as first frames or references

## 5.2 Generate image workflow

Purpose: submit image jobs from the generator UI and store the outputs.

Flow:

1. User fills the image generator form
2. Client uses `lib/compare/use-image-render.ts`
3. Hook `POST`s to `/api/image`
4. `app/api/image/route.ts` inspects the selected model
5. Route dispatches to:
   - `lib/byteplus.ts` for Seedream-family models
   - `lib/fal.ts` for `openai/gpt-image-2`
6. Normalized image URLs return to the client
7. The success path stages assets through `lib/library/auto-save.ts`
8. `stageGeneratedImage()` writes to the Library store
9. `lib/library/mirror.ts` optionally starts the mirror job
10. if signed in, `lib/cloud/asset-sync.ts` upserts the asset metadata to Supabase

Error behavior:

- route handlers preserve upstream HTTP status where possible
- client hooks classify failures through `lib/compare/error-class.ts`
- short transient failures auto-retry once

## 5.3 Generate video workflow

Purpose: submit async video tasks and poll them to completion.

Flow:

1. User fills the video generator form
2. Client uses `lib/compare/use-video-render.ts`
3. Hook `POST`s to `/api/video`
4. `app/api/video/route.ts` dispatches by model provider:
   - BytePlus Seedance via `lib/byteplus.ts`
   - MiniMax via `lib/minimax.ts`
5. Client receives a normalized task id
6. Hook polls `/api/video/[id]`
7. Poll route again dispatches by provider
8. Provider adapter returns a normalized terminal state
9. On success, `stageGeneratedVideo()` saves the asset into the Library
10. Mirroring and optional cloud sync run in the background

Provider nuance:

- BytePlus video is task-based and returns a video URL from task polling
- MiniMax video is also task-based, but polling returns a `file_id`; the adapter performs an additional file lookup to convert that into a usable `video_url`

## 5.4 Generate audio workflow

Purpose: synthesize speech and keep the result on same-origin storage.

Flow:

1. User submits text and voice settings in Generator
2. Client calls `/api/audio`
3. Route uses `lib/minimax.ts`
4. MiniMax returns audio bytes inline
5. Route writes bytes directly into `public/library-cache/`
6. Route returns a same-origin URL like `/library-cache/audio-tts-<hash>.mp3`
7. `stageGeneratedAudio()` adds the audio asset to the Library

Unlike video/image mirroring, audio generation creates the durable file directly inside the route because there is no upstream CDN URL to pull from later.

## 5.5 Image captioning workflow

Purpose: turn a dropped image into a cinematic prompt.

Flow:

1. Client sends a data URL or remote HTTPS image to `/api/caption`
2. `app/api/caption/route.ts` validates size and source format
3. `lib/byteplus.ts` sends the image to a BytePlus vision-capable chat model
4. Route returns a single-line prompt
5. The Generator injects that prompt back into the form

This is an assistive workflow rather than a persistence workflow.

## 5.6 Compare workflow

Purpose: render the same brief across two engines with shared controls.

Flow:

1. `/compare` resolves query state through `lib/compare/pairs.ts`
2. The shell hydrates two render panels using shared hooks
3. Both panels call the same normalized image/video render paths as Generator
4. Results are shown side-by-side
5. Pair definitions can be saved to `localStorage`
6. Export helpers in `lib/compare/export.ts` can compose comparison outputs

Compare is intentionally thin: it reuses the same service layer and mostly adds orchestration and display logic.

## 5.7 Library workflow

Purpose: act as the durable catalog of generated and imported media.

Flow:

1. Successful render or import creates/updates an asset record in `lib/library/assets.ts`
2. Library UI subscribes to the asset store with `useSyncExternalStore`
3. Feed aggregation in `lib/library/feed.ts` merges:
   - saved assets
   - pending image jobs
   - pending video jobs
4. If the asset URL points to a BytePlus CDN host, `mirrorAsset()` calls `/api/library/mirror`
5. The route streams the remote media to `public/library-cache/<id>.<ext>`
6. Asset metadata is patched with `mirrorUrl` and `mirrorStatus`

The library is the central handoff surface between Generator, Compare, and Studio.

## 5.8 Studio workflow

Purpose: let users build multi-step media pipelines as a node graph.

Flow:

1. User creates or opens a project from `/studio`
2. Project metadata and graph state are loaded from `lib/studio/projects.ts`
3. The canvas renders through React Flow in `app/studio/studio-canvas.tsx`
4. Nodes are typed and registered via `app/studio/nodes/registry.ts`
5. The runner executes nodes through `app/studio/runner.ts`
6. Execution is topological:
   - upstream inputs are gathered from connected node outputs
   - each node hashes its form + inputs
   - unchanged nodes with cached outputs are skipped
7. Successful nodes persist outputs only in runtime state
8. Any generated image/video/audio may still auto-save into the Library with `projectId` lineage
9. Project graph structure is auto-saved back to the project store through `app/studio/persistence.ts`

Important behavior:

- graph execution is subtree-aware, so one failed branch does not cancel unrelated siblings
- node outputs are cached per run hash to avoid repeated upstream calls
- persisted project snapshots deliberately strip runtime execution artifacts

## 5.9 Sign-in and cloud mode workflow

Purpose: add optional account-backed sync without making the product cloud-dependent.

Flow:

1. `lib/cloud/supabase.ts` checks whether public Supabase env vars exist
2. If absent, auth UI enters "disabled" mode and the app stays local-only
3. If present, `AuthProvider` subscribes to Supabase auth state
4. `/sign-in` offers magic link and Google OAuth
5. After sign-in, asset mutations can mirror into Supabase

Current implementation note:

- Library asset cloud sync is implemented in `lib/cloud/asset-sync.ts`
- Supabase schema includes both `assets` and `studio_projects`
- in the current code snapshot, Studio projects themselves still persist locally through `lib/studio/projects.ts`; a browser-side project sync bridge is not wired yet

That means the product copy and schema are already oriented toward cloud project sync, but the active code path is still local-first for Studio data.

## 6. Storage and Database Layer

## 6.1 Browser storage

The browser is the primary system of record for day-to-day interaction.

### localStorage-backed domains

- Library assets
- Studio projects
- Compare saved pairs
- legacy drafts compatibility

Why localStorage:

- no setup required
- instant synchronous reads during hydration
- enough capacity because records mainly store metadata and URLs, not binary data

Tradeoff:

- writes are synchronous and O(n) for serialized store updates
- large-scale asset counts would eventually justify moving to IndexedDB

The code already documents that migration path.

## 6.2 On-disk media mirror

`public/library-cache/` is a local file cache for durable media URLs.

It exists because provider-hosted media URLs, especially BytePlus CDN outputs, may expire or be unsuitable for same-origin media usage.

Two routes populate it:

- `/api/library/mirror`: downloads remote image/video/audio files from trusted BytePlus hosts
- `/api/audio`: writes newly synthesized audio bytes directly

Benefits:

- same-origin media URLs
- reduced dependence on signed CDN TTLs
- better long-term Library durability on local/dev deployments

Constraint:

- this approach is suitable for local/dev and persistent disk deployments
- on serverless production, `public/` is not a long-lived writable storage tier, so this would need to be swapped for object storage such as S3, R2, or Supabase Storage

## 6.3 Supabase / Postgres

The Supabase schema lives in `supabase/schema.sql`.

Tables:

- `assets`
- `studio_projects`

Design choices:

- each row stores the full domain record in `payload jsonb`
- RLS scopes all access to `auth.uid() = user_id`
- `updated_at` indexes support recency queries per user

Why JSONB payloads:

- fewer schema migrations as app-side object shapes evolve
- preserves local-first flexibility
- treats Supabase as a mirror of app records rather than a heavily normalized relational core

Current state:

- `assets` is actively written via the cloud sync bridge
- `studio_projects` is provisioned in schema but not yet actively mirrored by the browser code shown in this snapshot

## 7. Service Layer

## 7.1 Route handlers as boundary layer

The route handlers in `app/api/*` serve four jobs:

1. validate and normalize incoming client payloads
2. select the upstream provider from the chosen model
3. preserve meaningful HTTP error semantics
4. return provider-agnostic response shapes

The routes are intentionally not the place where provider specifics accumulate.

## 7.2 Provider adapters

### BytePlus

`lib/byteplus.ts` handles:

- image generation
- video generation and polling
- image captioning
- model alias resolution via `BYTEPLUS_MODEL_ALIASES`

Notable design detail:

- logical model ids used in UI can be mapped to provider-specific endpoint ids at the network edge

### fal.ai

`lib/fal.ts` exists specifically to support async queue-based image generation for `openai/gpt-image-2`.

It adapts fal's request lifecycle into the same image response shape used by BytePlus-backed image generation.

### MiniMax

`lib/minimax.ts` handles:

- async video generation
- file-id -> downloadable URL resolution
- text-to-speech generation

The adapter promotes MiniMax's sometimes non-HTTP logical errors into normalized exceptions so downstream error handling remains consistent.

## 7.3 Error and observability layer

`lib/server-log.ts` emits structured metadata-only logs for route failures.

It intentionally does not log:

- raw prompts
- uploaded images
- API keys
- stack traces

This is a privacy-first observability design: enough information to debug providers and route failures, without storing creative content.

## 8. Model and Capability Registry

The project centralizes supported engine metadata in `lib/studio/models.ts`.

This registry defines:

- image models and provider mapping
- video models and provider mapping
- capability matrices such as allowed durations, resolutions, and audio support
- helper functions for finding compatible options

This file is effectively the source of truth for:

- Generator dropdowns
- Compare compatibility
- route dispatch by provider
- preset hydration constraints

## 9. Data Shape and Type Strategy

The project uses TypeScript domain types heavily at the module boundary instead of introducing a separate ORM or schema package.

Examples:

- `Asset`
- `Project`, `ProjectMeta`, `CanvasShape`
- `ImageGenParams`, `VideoParams`
- `VideoTaskStatus`
- `StudioNodeData`, `NodeTypeSpec`

This makes the architecture strongly code-driven:

- domain types live next to the behavior that uses them
- adapters normalize external APIs into those types
- UI surfaces consume stable internal contracts

## 10. Execution Model in Studio

The Studio graph runner is one of the most architecture-heavy parts of the app.

Key behaviors in `app/studio/runner.ts`:

- topological sort with cycle detection
- input gathering from upstream node outputs
- per-node input hashing
- output reuse when hashes match
- subtree failure isolation
- abort-aware execution

That means Studio is not just a visual wrapper around forms. It is a lightweight deterministic workflow engine with memoized node execution.

## 11. Security and Trust Boundaries

### API secrets

Provider API keys stay on the server and are only used in route handlers or server-side adapters.

### Trusted remote media

Two routes enforce host allowlists:

- `/api/library/mirror`
- `/api/media`

Both only accept trusted BytePlus/Volcengine-style media hosts to avoid becoming open proxies or arbitrary downloaders.

### Row-level security

Supabase tables use RLS keyed to the authenticated user id.

### Local-first privacy stance

Without Supabase configuration, user data stays in browser storage and local disk cache only.

## 12. Known Gaps and Future Evolution

The codebase already hints at several next steps:

- Studio project cloud sync is provisioned in schema but not yet fully wired in the browser store layer
- `public/library-cache` needs replacement with object storage for serverless production durability
- localStorage-backed stores may eventually move to IndexedDB as volume grows
- compare and generator surfaces continue to normalize more multi-provider capabilities
- server-side Supabase clients for route handlers/server components are noted as a future step

## 13. Practical Mental Model

If you need to understand the system quickly, the most useful mental model is:

- `Reels` defines reusable creative starting points
- `Generate` turns prompts into assets
- `Compare` renders the same intent through multiple engines
- `Library` is the shared durable catalog
- `Studio` orchestrates multi-step pipelines on top of the same generation primitives
- `API routes + adapters` isolate provider complexity
- `localStorage + mirror cache + optional Supabase` provide layered persistence

In other words, Lumen Hub is not just a prompt box. It is a local-first media workflow system with a unified asset catalog and pluggable provider backends.
