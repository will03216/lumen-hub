# Lumen — AI Image & Video Studio

A self-hostable, Higgsfield-style studio for generating images and videos with
**BytePlus ModelArk** (Seedream + Seedance), plus optional MiniMax and fal.ai
providers. Built on **Next.js 16 + React 19 + Tailwind v4 + Radix**.

- **Image Generator** (Seedream) — text-to-image with size / seed / watermark controls
- **Video Generator** (Seedance) — text-to-video, image-to-video, first+last frame
  keyframes, 480p/720p/1080p, 5s/10s, multiple aspect ratios, fixed-camera toggle,
  native audio (2.0), automatic async polling
- **Compare**, **Library** (with optional cloud sync), **Studio** canvas, and a
  **Story / reels** pipeline (shot generation → prompts → stitch with audio)
- Dark, cinematic UI

---

## Architecture overview

Lumen is a single Next.js app that serves the UI and a set of server-side API
routes proxying the model providers. It depends on three things at runtime:

| Dependency | Role | Required? |
|------------|------|-----------|
| **PostgreSQL** | Stores users, encrypted per-user API keys, Studio canvases, library metadata | ✅ (for auth/persistence; optional for pure local dev — see below) |
| **Clerk** ([clerk.com](https://clerk.com)) | Authentication | ✅ |
| **AI provider keys** | Image/video generation | ⚙️ Per-user (BYOK), not server-wide |

> **Strict BYOK (bring-your-own-key).** Provider credentials are **not** set as
> server env vars. Each signed-in user enters their own keys in **Settings**;
> they're encrypted with `KEY_ENCRYPTION_SECRET` and stored per-user in the DB.
> There is **no env fallback** — if a required key is missing, the API returns
> `402 missing_api_key` pointing the user to `/settings`
> (see `lib/server/user-keys.ts`).

For a full breakdown of routes, workflows, and the storage/service layers, see
[`ARCHITECTURE.md`](ARCHITECTURE.md).

---

## Quick start (local development)

Requires **Node.js 20+**.

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.local.example .env.local
#    Then edit .env.local — at minimum set the Clerk keys and KEY_ENCRYPTION_SECRET.
#    Generate the secret with:  openssl rand -hex 32

# 3. Run the dev server
npm run dev
```

Open <http://localhost:3000>.

You'll be routed through Clerk sign-in, then **Settings**, where you paste your
own BytePlus (and optionally MiniMax / fal.ai) keys to start generating.

> **One-time Clerk setup is required** for sign-in and onboarding to work
> (custom session token claims). See
> [`CUSTOMER_DEPLOY.md` §3](CUSTOMER_DEPLOY.md) for the exact steps.

### Running with Docker (app + database, one command)

To run a self-contained stack (app **and** a bundled PostgreSQL) without
installing Node or a DB locally:

```bash
cp .env.local.example .env        # set Clerk keys + KEY_ENCRYPTION_SECRET
docker compose -f docker-compose.local.yml up --build
```

Details, production deployment, and the full env reference are in
[`CUSTOMER_DEPLOY.md`](CUSTOMER_DEPLOY.md).

---

## Environment variables

The authoritative templates are [`.env.local.example`](.env.local.example) and
[`.env.production.example`](.env.production.example). Summary:

### Platform configuration (set by the operator)

| Variable | Required | Notes |
|----------|----------|-------|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | ✅ | Clerk publishable key (`pk_live_…`/`pk_test_…`). Baked in at build time. |
| `CLERK_SECRET_KEY` | ✅ | Clerk secret key. |
| `KEY_ENCRYPTION_SECRET` | ✅ | 32-byte hex; encrypts stored user keys. `openssl rand -hex 32`. |
| `DATABASE_URL` | ✅¹ | PostgreSQL connection string. |
| `NEXT_PUBLIC_APP_URL` | | Public app URL. Baked in at build time. |
| `NEXT_PUBLIC_CDN_BASE` | | CDN base in front of media. Baked in at build time. |
| `ALLOWED_EMAIL_DOMAINS` / `ALLOWED_EMAILS` | | Optional access allowlist (fail-closed when either is set). Read at runtime. |

¹ Without `DATABASE_URL` + `KEY_ENCRYPTION_SECRET`, key storage is disabled and
the app runs in a degraded local-only mode (no persisted user keys).

> **Build-time vs runtime:** every `NEXT_PUBLIC_*` value is compiled into the
> client bundle — changing one requires a **rebuild**. All other vars are read at
> runtime and only need a restart.

### Provider keys — entered per-user in Settings, NOT as env vars

| Provider | Enables |
|----------|---------|
| BytePlus / Ark | Seedream (image), Seedance (video), Seed models — the core experience |
| ModelArk AK/SK + TOS bucket | Cloud asset Library sync |
| MiniMax | Hailuo / T2V-01-Director video models (optional) |
| fal.ai | GPT Image 2 and other fal-hosted models (optional) |

### BytePlus model overrides (optional)

| Variable | Default |
|----------|---------|
| `BYTEPLUS_BASE_URL` | `https://ark.ap-southeast.bytepluses.com/api/v3` |
| `BYTEPLUS_IMAGE_MODEL` | `seedream-5-0-lite-260128` |
| `BYTEPLUS_VIDEO_MODEL` | `seedance-1-5-pro-251215` |
| `BYTEPLUS_CAPTION_MODEL` | `seed-2-0-lite-260228` |
| `BYTEPLUS_PROMPT_MODEL` | `seed-2-0-pro-260228` |

`BYTEPLUS_VIDEO_MODEL` accepts, among others:

| Model ID | Notes |
|---|---|
| `seedance-1-5-pro-251215` | Stable. 480p / 720p / 1080p, 5–10s. |
| `dreamina-seedance-2-0-260128` | 480p / 720p, 4–15s, native audio + multi-reference. |
| `dreamina-seedance-2-0-fast-260128` | Same as 2.0, faster/cheaper queue. |

If a default model ID returns 404, check your BytePlus console for the exact
dated version (`<model>-YYMMDD`) and override via env.

---

## How it works

- `app/api/image/route.ts` proxies image generation (synchronous).
- `app/api/video/route.ts` submits a video task and returns a task id;
  `app/api/video/[id]/route.ts` polls it.
- Video parameter shape depends on the model — `lib/byteplus.ts` (`isSeedance2`)
  branches automatically:
  - **Seedance 1.5 Pro** — flags inline in the prompt text
    (`prompt --resolution 1080p --duration 5 --ratio 16:9`).
  - **Seedance 2.0 / 2.0 Fast** — clean prompt; `resolution`, `duration`,
    `ratio`, `seed`, `camerafixed`, `generate_audio` ride at the top level of the
    request body.
- Provider keys are resolved per request from the calling user's stored keys
  (`lib/server/user-keys.ts`) and **never leave the server**.

### Image-to-video input

`FrameUpload` reads files as base64 data URLs and sends them to the provider. If
data URLs are rejected for your region/model, host the image on a public URL and
paste that instead — `lib/byteplus.ts` accepts both.

---

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start the dev server |
| `npm run build` | Production build (standalone output) |
| `npm run start` | Run the production build |
| `npm run test` | Run the Vitest suite |
| `npm run reels:render` | Render reels via `scripts/reels-render.ts` |

---

## Deployment

This app is built for **Docker** (standalone Next.js output, runs `node
server.js` on port 3000, with a `/api/health` check). Full instructions —
self-contained stack, production rollout, Clerk setup, schema loading, TLS,
backups, and a go-live checklist — are in
[**`CUSTOMER_DEPLOY.md`**](CUSTOMER_DEPLOY.md).
