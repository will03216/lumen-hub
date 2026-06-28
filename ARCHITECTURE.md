# Lumen Hub Architecture

Lumen Hub is a local-first creative workstation built on Next.js 16. It combines:

- marketing and discovery surfaces (`/`, `/showcase`, `/reels`)
- creation surfaces (`/generate`, `/compare`, `/studio`)
- asset management (`/library`)
- Clerk-backed identity with per-user encrypted API key storage
- server-side adapters to multiple AI providers (BytePlus, fal.ai, MiniMax)

At a high level, the system is designed so that the UI works on a fresh clone with only local browser storage, while external APIs and cloud sync progressively add capability.

## 1. System Overview

```text
Browser UI
  |- Landing / Showcase / Reels
  |- Generate / Compare / Studio / Library
  |- localStorage stores (scoped per Clerk user ID)
  |- useSyncExternalStore snapshots
  v
Next.js App Router
  |- Server-rendered route entries
  |- Client shells for interactive tools
  |- API routes under /app/api/*
  v
Auth & Key Resolution
  |- Clerk  -> identity, session, onboarding gate
  |- /api/user/keys -> per-user encrypted API keys (CRUD)
  |- lib/server/user-keys.ts -> key resolution per request
  v
Service Adapters
  |- BytePlus  -> images, video, captioning
  |- fal.ai    -> GPT Image 2
  |- MiniMax   -> video + TTS
  v
Persistence
  |- Browser localStorage (user-scoped keys)
  |- public/library-cache/ mirrored media on disk
  |- PostgreSQL (user_api_keys, assets, studio_projects)
```

## 2. Architectural Principles

### Local-first by default

The app works without a database or any cloud database configuration. The main persisted state lives in browser `localStorage`:

- Library assets: `lib/library/assets.ts`
- Studio projects: `lib/studio/projects.ts`
- Compare saved pairs: `lib/compare/saved-pairs.ts`
- transient render queues: module-level memory in `lib/library/in-flight.ts`

Since v2, all localStorage keys are scoped per Clerk user ID (`u_<userId>:<base>`) via `lib/storage-user.ts`. This prevents data leakage between accounts on shared devices.

### Thin route layer, richer adapters

The App Router API handlers mostly validate input, select the upstream provider, and normalize errors. Provider-specific request/response logic lives in:

- `lib/byteplus.ts`
- `lib/fal.ts`
- `lib/minimax.ts`

That separation keeps UI code provider-agnostic.

### Per-user key resolution

Each route handler that calls an upstream provider calls `getUserKeys()` from `lib/server/user-keys.ts` first. That function:

1. reads the caller's Clerk user ID from the server session
2. queries `user_api_keys` in Postgres and decrypts the stored keys
3. returns an empty object if `DATABASE_URL` or `KEY_ENCRYPTION_SECRET` is absent (dev mode)

Adapters fall back to their respective env-var credentials when no per-user key is found. This means the server env vars act as shared defaults, while per-user keys take precedence.

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
3. if signed in and `DATABASE_URL` is set, mirror metadata to Postgres via `/api/library/sync`

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

### Auth and account surfaces

- `/sign-in/[[...sign-in]]`: Clerk-hosted sign-in (catchall for OAuth callbacks)
- `/sign-up/[[...sign-up]]`: Clerk-hosted sign-up
- `/onboarding`: post-sign-in gate — checks for BytePlus keys, redirects to `/settings?setup=1` if missing
- `/settings`: per-user API credential management (BytePlus API key, AK, SK)

### Service routes

- `/api/image`: image generation
- `/api/video`: async video task creation
- `/api/video/[id]`: async video task polling
- `/api/audio`: text-to-speech generation
- `/api/caption`: image-to-prompt captioning
- `/api/library/mirror`: remote BytePlus asset -> local disk mirror
- `/api/library/sync`: upsert/delete Library asset records in Postgres
- `/api/media`: same-origin media proxy for BytePlus CDN assets
- `/api/user/keys`: CRUD for per-user encrypted API keys
- `/api/health`: liveness probe

## 4. Frontend Layer

## 4.1 App Router composition

The app uses the Next.js App Router with a mostly server-entered, client-shell architecture:

- page entry points under `app/*/page.tsx` are small and compositional
- large interactive surfaces live in client components such as:
  - `app/generate/tabs.tsx`
  - `app/compare/compare-shell.tsx`
  - `app/library/library-shell.tsx`
  - `app/studio/studio-canvas.tsx`

`app/layout.tsx` mounts the `ClerkProvider` globally and renders `StorageUserInit` to scope localStorage keys as soon as Clerk resolves the session.

## 4.2 UI state model

There are three main UI state categories:

- route/query state: deep links, presets, compare params
- local persistent state: assets, projects, saved pairs
- transient execution state: in-flight renders, polling, node status

The app intentionally avoids a single global state manager. Instead it uses small domain stores with `useSyncExternalStore` compatibility. That keeps domain boundaries clear and preserves stable snapshot references.

## 4.3 Domain stores

### Library store

`lib/library/assets.ts` persists asset metadata in `localStorage` under a user-scoped key derived from `lib/storage-user.ts`.

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

`lib/studio/projects.ts` persists project envelopes in `localStorage` under a user-scoped key.

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
4. `app/api/image/route.ts` calls `getUserKeys()` to resolve credentials, then inspects the selected model
5. Route dispatches to:
   - `lib/byteplus.ts` for Seedream-family models
   - `lib/fal.ts` for `openai/gpt-image-2`
6. Normalized image URLs return to the client
7. The success path stages assets through `lib/library/auto-save.ts`
8. `stageGeneratedImage()` writes to the Library store
9. `lib/library/mirror.ts` optionally starts the mirror job
10. if signed in and DB is configured, `lib/cloud/asset-sync.ts` upserts the asset metadata to Postgres

Error behavior:

- route handlers preserve upstream HTTP status where possible
- client hooks classify failures through `lib/compare/error-class.ts`
- short transient failures auto-retry once
- missing API key returns `{ error: 'missing_api_key', settingsUrl: '/settings' }` with HTTP 402

## 5.3 Generate video workflow

Purpose: submit async video tasks and poll them to completion.

Flow:

1. User fills the video generator form (supports first-frame, last-frame, and reference-image modes)
2. Client uses `lib/compare/use-video-render.ts`
3. Hook `POST`s to `/api/video`
4. `app/api/video/route.ts` calls `getUserKeys()`, then dispatches by model provider:
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
7. If signed in and DB is configured, `lib/cloud/asset-sync.ts` calls `/api/library/sync` to upsert the record to Postgres

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

### Studio node types

Node types are registered in `app/studio/nodes/registry.ts`. Current built-in nodes:

| Type | Description |
|---|---|
| `urlInput` | Paste one or more URLs (one per line); outputs `url` (first) and `urls` (all) |
| `videoGen` | Video generation with support for first-frame, last-frame, and reference-image input modes |
| image/audio/other | (see registry) |

The `urlInput` node is useful for wiring existing hosted media into generation nodes without a local upload step.

The `videoGen` node supports three optional image input modes: first frame only, last frame only, and a reference image. These correspond to BytePlus Seedance's `first_frame_image`, `last_frame_image`, and `reference_image` parameters.

## 5.9 Sign-in, onboarding, and settings workflow

Purpose: add Clerk-backed account identity, per-user API key storage, and an onboarding gate.

Flow:

1. `lib/cloud/auth.tsx` wraps Clerk's `useUser`/`useClerk` in a stable `{ status, user, signOut }` interface
2. Clerk is configured with an after-sign-in redirect to `/onboarding`
3. `/onboarding` is a server component that calls `getUserKeys()`:
   - if the user already has a BytePlus key saved, it redirects to `/`
   - otherwise it redirects to `/settings?setup=1`
4. `/settings` shows the API credential form (BytePlus API key, Access Key, Secret Key)
5. Saving calls `POST /api/user/keys`, which encrypts and upserts each key into `user_api_keys`
6. On subsequent sign-ins the user is forwarded directly past onboarding

Per-user key resolution on API requests:

- Every generation route calls `getUserKeys()` from `lib/server/user-keys.ts`
- That function queries Postgres, decrypts stored keys, and returns them
- Adapters fall back to server env-var credentials when no per-user key exists
- If a required key is missing entirely, the route returns HTTP 402 with `{ error: 'missing_api_key', settingsUrl: '/settings' }`

When `DATABASE_URL` or `KEY_ENCRYPTION_SECRET` are absent (local dev), `getUserKeys()` returns an empty object and the app falls back to env-var credentials silently.

## 6. Storage and Database Layer

## 6.1 Browser storage

The browser is the primary system of record for day-to-day interaction.

### localStorage-backed domains

- Library assets
- Studio projects
- Compare saved pairs
- legacy drafts compatibility

All keys are namespaced per Clerk user ID via `lib/storage-user.ts` (`u_<userId>:<base>`). The `StorageUserInit` component in the root layout sets the active user ID as soon as Clerk resolves the session.

Why localStorage:

- no setup required
- instant synchronous reads during hydration
- enough capacity because records mainly store metadata and URLs, not binary data

Tradeoff:

- writes are synchronous and O(n) for serialized store updates
- large-scale asset counts would eventually justify moving to IndexedDB

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

## 6.3 PostgreSQL

The database schema lives in `supabase/pg-schema.sql`. It targets plain PostgreSQL (no Supabase-specific extensions or RLS). `lib/db.ts` creates a singleton `pg.Pool` keyed to `DATABASE_URL`.

Tables:

| Table | Purpose |
|---|---|
| `assets` | Cloud mirror of Library asset records |
| `studio_projects` | Cloud mirror of Studio project envelopes |
| `user_api_keys` | Per-user encrypted provider credentials |

Design choices:

- `assets` and `studio_projects` store the full domain record in `payload jsonb`
- `user_api_keys` stores AES-encrypted key ciphertext plus a 4-char hint for display
- `user_id` is a Clerk user ID string (e.g. `user_2abc…`)
- no Supabase RLS — access is enforced at the route handler layer via Clerk's `auth()`
- `updated_at` indexes support recency queries per user

The database is optional. When `DATABASE_URL` is absent, all cloud sync routes return graceful errors and the app remains fully functional on local storage alone.

## 7. Service Layer

## 7.1 Route handlers as boundary layer

The route handlers in `app/api/*` serve five jobs:

1. validate and normalize incoming client payloads
2. resolve per-user API credentials via `getUserKeys()`
3. select the upstream provider from the chosen model
4. preserve meaningful HTTP error semantics
5. return provider-agnostic response shapes

The routes are intentionally not the place where provider specifics accumulate.

## 7.2 Provider adapters

### BytePlus

`lib/byteplus.ts` handles:

- image generation
- video generation and polling (including first/last frame and reference image parameters)
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

### API secrets and per-user keys

Provider API keys stay on the server and are only used in route handlers or server-side adapters. Per-user keys are stored AES-encrypted in Postgres and decrypted only inside `getUserKeys()` on the server. Plaintext credentials never leave the server tier; the client only receives 4-char hints.

### SSRF protection

`lib/server/url-guard.ts` exports `assertSafeUrl()`, which is called before any outbound fetch of a user-supplied URL. It blocks:

- loopback addresses (`127.*`, `::1`)
- RFC 1918 private ranges (`10.*`, `172.16-31.*`, `192.168.*`)
- link-local and cloud metadata addresses (`169.254.*`, `metadata.google.internal`, etc.)
- CGNAT range (`100.64-127.*`)
- IPv4-mapped IPv6 equivalents

### Trusted remote media hosts

Two routes enforce host allowlists:

- `/api/library/mirror`
- `/api/media`

Both only accept trusted BytePlus/Volcengine-style media hosts to avoid becoming open proxies or arbitrary downloaders.

### Route-level auth enforcement

All routes that touch Postgres call Clerk's `auth()` server-side and return 401 if no session exists. There is no shared table-level RLS; the route layer is the access boundary.

### Local-first privacy stance

Without a database configuration, user data stays in browser storage and local disk cache only.

## 12. Deployment

### Docker

`Dockerfile` builds a production Next.js image. `docker-compose.yml` composes the app with a Postgres container. `docker-compose.local.yml` is a local development variant.

Required environment variables for a full-featured deployment:

- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY`: Clerk credentials
- `DATABASE_URL`: Postgres connection string
- `KEY_ENCRYPTION_SECRET`: AES key for encrypting user API keys at rest
- `BYTEPLUS_API_KEY` (optional fallback if users don't save their own key)

The app degrades gracefully if any of these are absent — see §2 and §6.3.

## 13. Known Gaps and Future Evolution

- Studio project cloud sync is provisioned in schema and the library sync route pattern exists, but active browser-initiated project sync to Postgres is not yet wired
- `public/library-cache` needs replacement with object storage for serverless production durability
- localStorage-backed stores may eventually move to IndexedDB as volume grows
- compare and generator surfaces continue to normalize more multi-provider capabilities
- the `user_api_keys` table currently covers BytePlus, fal, and MiniMax; adding new providers requires a new `provider` constant in the route and adapter

## 14. Practical Mental Model

If you need to understand the system quickly, the most useful mental model is:

- `Reels` defines reusable creative starting points
- `Generate` turns prompts into assets
- `Compare` renders the same intent through multiple engines
- `Library` is the shared durable catalog
- `Studio` orchestrates multi-step pipelines on top of the same generation primitives
- `API routes + adapters` isolate provider complexity; every generation route resolves per-user keys first
- `localStorage (user-scoped) + mirror cache + optional Postgres` provide layered persistence
- `Clerk` handles identity; `/onboarding` + `/settings` handle first-run credential setup

In other words, Lumen Hub is not just a prompt box. It is a local-first media workflow system with a unified asset catalog, pluggable provider backends, and per-user credential storage.
