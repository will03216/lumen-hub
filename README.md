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

## What you'll need

| Requirement | Why | Cost |
|-------------|-----|------|
| **Node.js 20+** | Runs the Next.js app | Free |
| **Docker** (or any PostgreSQL 15+) | Stores your account, encrypted API keys, Studio canvases | Free (self-hosted) |
| **A Clerk account** ([clerk.com](https://clerk.com)) | Authentication / accounts | Free tier |
| **A BytePlus / Ark API key** ([console.byteplus.com](https://console.byteplus.com)) | The AI models (Seedream images, Seedance video) | BytePlus usage-billed |

> **Bring-your-own-key (BYOK).** Provider API keys are **not** put in a config
> file. Each signed-in user pastes their own keys into the in-app **Settings**
> page, where they're encrypted per-user (with `KEY_ENCRYPTION_SECRET`) in the
> database. There is **no env fallback** — a missing key returns
> `402 missing_api_key` pointing to `/settings` (see `lib/server/user-keys.ts`).
> MiniMax and fal.ai are optional; only BytePlus is required.

---

## Local setup

### 1. Clone and install

```bash
git clone <repo-url> lumen-hub
cd lumen-hub
npm install
```

### 2. Start a local PostgreSQL

The repo ships a Compose file with a pre-configured Postgres that **auto-loads
the database schema** on first boot. Start just the database:

```bash
docker compose -f docker-compose.local.yml up -d postgres
```

It's reachable at `postgres://lumenhub:lumenhub@localhost:5433/lumenhub`
(host port **5433** → container 5432; data persists in a Docker volume).

<details>
<summary>Prefer your own PostgreSQL instead of Docker?</summary>

```bash
createdb lumenhub
psql "postgres://USER:PASS@localhost:5432/lumenhub" -f supabase/pg-schema.sql
```

Use that connection string as your `DATABASE_URL` in step 4.
</details>

### 3. Set up Clerk (one-time, ~5 minutes)

Sign-in and onboarding won't work without this.

1. Create a free account and a new **Application** at
   [dashboard.clerk.com](https://dashboard.clerk.com).
2. From **API Keys**, copy the publishable key (`pk_test_…`) and secret key
   (`sk_test_…`).
3. **Customize the session token** (required — the app reads custom claims). Go
   to **Configure → Sessions → Customize session token** and add:
   ```json
   {
     "metadata": "{{user.public_metadata}}",
     "email": "{{user.primary_email_address}}"
   }
   ```
   - Without `metadata`, new users get stuck looping on `/settings`.
   - `email` is only needed if you enable the access allowlist (see below).

### 4. Configure environment variables

```bash
cp .env.local.example .env.local
```

Edit `.env.local` so it contains at least:

```dotenv
# Clerk (from step 3)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_xxxxx
CLERK_SECRET_KEY=sk_test_xxxxx
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/onboarding
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/onboarding
NEXT_PUBLIC_CLERK_AFTER_SIGN_OUT_URL=/sign-in

# Database (from step 2)
DATABASE_URL=postgres://lumenhub:lumenhub@localhost:5433/lumenhub

# Encrypts your stored API keys — generate with: openssl rand -hex 32
KEY_ENCRYPTION_SECRET=paste-32-byte-hex-here
```

Generate the encryption secret with `openssl rand -hex 32`.

> **Don't** put `BYTEPLUS_API_KEY` here — the app ignores env-level provider keys
> (strict BYOK). You'll add it in the app in step 6. The leftover line in the
> template is harmless.

### 5. Run

```bash
npm run dev
```

Open **http://localhost:3000** (if the port is taken, the terminal prints the
actual one, e.g. 3001).

### 6. First run — create an account and add your BytePlus key

1. You'll be redirected to Clerk **sign-up**. Create an account.
2. After signing in you land on **Settings** (the app forces key setup first).
3. Paste your **BytePlus / Ark API key** (from
   [console.byteplus.com](https://console.byteplus.com)). Optionally add MiniMax
   or fal.ai keys for those extra models.
4. Save — the studio unlocks. Try a prompt in the Image or Video generator.

### Verify it's working

```bash
curl http://localhost:3000/api/health     # → {"status":"ok", ...}
```

---

## Environment variables

The authoritative templates are [`.env.local.example`](.env.local.example) and
[`.env.production.example`](.env.production.example).

### Platform configuration (set by the operator)

| Variable | Required | Notes |
|----------|----------|-------|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | ✅ | Clerk publishable key. Baked in at build time. |
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

| Provider | Enables | Required? |
|----------|---------|-----------|
| BytePlus / Ark | Seedream (image), Seedance (video), Seed models | ✅ Yes |
| ModelArk AK/SK + TOS bucket | Cloud asset Library sync | Optional |
| MiniMax | Hailuo / T2V-01-Director video models | Optional |
| fal.ai | GPT Image 2 and other fal-hosted models | Optional |

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

## Optional: restrict who can sign in

By default, anyone who creates a Clerk account can use your instance. To limit it,
set either of these in `.env.local` (read at runtime — just restart `npm run dev`):

```dotenv
ALLOWED_EMAIL_DOMAINS=yourcompany.com
ALLOWED_EMAILS=alice@gmail.com,bob@outlook.com
```

When either is set, only matching emails get in; everyone else is sent to
`/not-authorized`. Requires the `email` claim from the Clerk session token (step 3).

---

## Useful commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start the dev server (hot reload) |
| `npm run build` | Production build (standalone output) |
| `npm run start` | Run the production build |
| `npm run test` | Run the test suite (Vitest) |
| `npm run reels:render` | Render reels via `scripts/reels-render.ts` |
| `docker compose -f docker-compose.local.yml up -d postgres` | Start the local database |
| `docker compose -f docker-compose.local.yml down` | Stop the database (keeps data) |
| `docker compose -f docker-compose.local.yml down -v` | Stop the database and **delete** its data |

---

## How it works

- `app/api/image/route.ts` proxies image generation (synchronous).
- `app/api/video/route.ts` submits a video task and returns a task id;
  `app/api/video/[id]/route.ts` polls it.
- Video parameter shape depends on the model — `lib/byteplus.ts` (`isSeedance2`)
  branches automatically: **Seedance 1.5 Pro** puts flags inline in the prompt
  text (`prompt --resolution 1080p --duration 5 --ratio 16:9`); **Seedance 2.0 /
  2.0 Fast** use a clean prompt with `resolution`, `duration`, `ratio`, `seed`,
  `camerafixed`, `generate_audio` at the top level of the request body.
- Provider keys are resolved per request from the calling user's stored keys
  (`lib/server/user-keys.ts`) and **never leave the server**.
- `FrameUpload` reads image-to-video frames as base64 data URLs. If your
  region/model rejects data URLs, host the image on a public URL and paste that
  instead — `lib/byteplus.ts` accepts both.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Redirect loop on `/settings` after login | Clerk session token missing the `metadata` claim (step 3). |
| Sign-in page errors / blank | Wrong `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY`. |
| App loads but DB errors | Postgres not running, wrong `DATABASE_URL`, or schema not loaded (step 2). |
| "No BytePlus API key found" (402) | Add your key in **Settings** (step 6) — it's per-user, not an env var. |
| Model call returns 404 | The dated model ID changed; override `BYTEPLUS_VIDEO_MODEL` / `BYTEPLUS_IMAGE_MODEL` in `.env.local`. |
| Port 3000 already in use | Next.js auto-picks the next free port; check the terminal output. |

---

## Deploying to production

This app is built for **Docker** (standalone Next.js output, runs `node
server.js` on port 3000, with a `/api/health` check). Full instructions —
self-contained stack, production rollout, Clerk setup, schema loading, TLS,
backups, and a go-live checklist — are in
[**`CUSTOMER_DEPLOY.md`**](CUSTOMER_DEPLOY.md).

For an architecture deep-dive, see [`ARCHITECTURE.md`](ARCHITECTURE.md).
