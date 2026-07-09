# Lumen — AI Image & Video Studio

A self-hostable, Higgsfield-style studio for generating images and videos with
**BytePlus ModelArk** (Seedream + Seedance), plus optional MiniMax and fal.ai
providers. Built on **Next.js 16 + React 19 + Tailwind v4 + Radix**.

- **Image Generator** (Seedream) — text-to-image with size / seed / watermark controls
- **Video Generator** (Seedance) — text-to-video, image-to-video, first+last frame
  keyframes, 480p/720p/1080p, 5s/10s, multiple aspect ratios, fixed-camera toggle,
  native audio (2.0), automatic async polling
- **Video Style Extract** (Studio canvas node) — paste a reference video URL
  (TikTok, YouTube, etc.), extract a product-agnostic style brief (motion
  grammar, camera, lighting, pacing, composition), then combine it with your own
  product into a Seedance-ready enhanced prompt. Optional — requires
  [yt-dlp](https://github.com/yt-dlp/yt-dlp) locally (see [Video Style Extract
  setup](#optional-video-style-extract-dependencies)).
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
| **yt-dlp** *(optional)* | Video Style Extract node downloads reference clips (TikTok, YouTube…) to extract frames. Not needed for the rest of the app. | Free |

> `ffmpeg` for frame extraction ships inside the app via the `ffmpeg-static` npm
> package — no separate install needed.

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

<details>
<summary>Alternative: run <strong>everything</strong> in Docker (app + database)</summary>

`docker-compose.local.yml` also defines an **`app`** service that builds from the
`Dockerfile`, so you can run the whole stack in containers instead of
`npm run dev`. Compose reads a root **`.env`** file (not `.env.local`) for
variable substitution, and the app container reaches Postgres internally at
`postgres:5432` (so `DATABASE_URL` is set automatically inside the container).

1. Create a root `.env` with the build/runtime values:
   ```dotenv
   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_xxxxx
   CLERK_SECRET_KEY=sk_test_xxxxx
   KEY_ENCRYPTION_SECRET=<openssl rand -hex 32>
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   ```
2. Build and start both services:
   ```bash
   docker compose -f docker-compose.local.yml up -d --build
   ```
3. App on http://localhost:3000, Postgres on `:5433`. Rebuild after code changes
   with the same `up -d --build`. Logs: `docker compose -f docker-compose.local.yml logs -f app`.

> `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` is baked in at **build time**, so changing
> it requires a rebuild. Behind a TLS-intercepting corporate proxy, `npm ci` in
> the build may fail with `UNABLE_TO_GET_ISSUER_CERT_LOCALLY` — see Troubleshooting.

</details>

### 6. First run — create an account and add your BytePlus key

1. You'll be redirected to Clerk **sign-up**. Create an account.
2. After signing in you land on **Settings** (the app forces key setup first).
3. Paste your **BytePlus / Ark API key** (from
   [console.byteplus.com](https://console.byteplus.com)). Optionally add MiniMax
   (also required for the **Audio / TTS** tab) or fal.ai keys for those extra
   models.
4. Save — the studio unlocks. Try a prompt in the Image or Video generator.

> To use **Video Stitch, Music Overlay, or Article Narration**, also add your
> BytePlus **Access Key (`AKLT…`)**, **Secret Key**, and **TOS bucket** in
> Settings — those nodes upload the rendered file to TOS and will fail with a
> `402 missing_api_key` (or a TOS `InvalidAccessKeyId`) without them. See
> [Provider keys](#provider-keys--entered-per-user-in-settings-not-as-env-vars).

### Optional: Video Style Extract dependencies

The **Video Style Extract** canvas node downloads a reference video (TikTok,
YouTube, etc.) and extracts frames for vision analysis. It needs
[`yt-dlp`](https://github.com/yt-dlp/yt-dlp) on the server's PATH. `ffmpeg`
is already bundled via the `ffmpeg-static` npm dependency — no extra install.

The route looks for yt-dlp in this order (first match wins):

1. A global `yt-dlp` CLI on PATH (install via `brew install yt-dlp`, `pipx
   install yt-dlp`, or your distro's package manager), **or**
2. A project-local Python venv at `.venv/bin/python -m yt_dlp`:

   ```bash
   python3 -m venv .venv
   .venv/bin/pip install yt-dlp
   ```

3. A system `python3 -m yt_dlp` (if the `yt_dlp` package is globally installed).

If none are found, the node surfaces a clear error (`Could not analyze video
URL. Install yt-dlp…`) — the rest of the app is unaffected. You only need
yt-dlp if you actually use this node.

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
| BytePlus **Access Key + Secret Key** + TOS bucket | Cloud asset Library sync **and** any node that uploads a rendered file: **Video Stitch, Music Overlay, Article Narration** | Required for those nodes |
| MiniMax | Hailuo / T2V-01-Director video models, TTS / Audio | Optional |
| fal.ai | GPT Image 2 and other fal-hosted models | Optional |

> **The Access Key must be a *permanent* IAM key (prefix `AKLT…`), not a
> temporary/STS key (prefix `AKTP…`).** STS keys expire and require a session
> token the app does not send — TOS will reject them with
> `InvalidAccessKeyId … does not exist in our records`. The bucket needs a
> **public-read** policy so ModelArk can fetch the uploaded file. Create the key
> under **BytePlus console → IAM → Access Keys**; it is separate from the
> `ark-…` ModelArk API key used for image/video generation.

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

### TOS / ModelArk storage config (optional env overrides)

The Access Key, Secret Key, and bucket name are entered **per-user in Settings**
(not env). These vars only configure the *endpoint and signing*, and are read at
runtime from the operator's environment:

| Variable | Default | Notes |
|----------|---------|-------|
| `MODELARK_HOST` | `open.byteplusapi.com` | ModelArk API host. |
| `MODELARK_REGION` | `ap-southeast-1` | Region used to build the TOS endpoint host (`{bucket}.tos-{region}.bytepluses.com`). |
| `MODELARK_TOS_REGION` | `cn-beijing` | Region used to **sign** the TOS request (SigV4 credential scope). |
| `MODELARK_TOS_HOST` | `tos-{MODELARK_REGION}.bytepluses.com` | Overrides the full TOS host. |

> ⚠️ **Region mismatch caveat.** The defaults sign with `cn-beijing` but build
> the endpoint for `ap-southeast-1`. If your bucket is in `ap-southeast-1`
> (the common overseas case), set **`MODELARK_TOS_REGION=ap-southeast-1`** so the
> signing region matches the bucket region — otherwise TOS uploads fail with
> `SignatureDoesNotMatch` even with a valid key.

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
| TOS `InvalidAccessKeyId … does not exist` on Stitch / Overlay / Narration | The Access Key in Settings is invalid or a temporary `AKTP…` key. Use a permanent `AKLT…` IAM key (see [Provider keys](#provider-keys--entered-per-user-in-settings-not-as-env-vars)). |
| TOS `SignatureDoesNotMatch` with a valid key | Signing region ≠ bucket region. Set `MODELARK_TOS_REGION` to your bucket's region (e.g. `ap-southeast-1`). |
| Model call returns 404 | The dated model ID changed; override `BYTEPLUS_VIDEO_MODEL` / `BYTEPLUS_IMAGE_MODEL` in `.env.local`. |
| Port 3000 already in use | Next.js auto-picks the next free port; check the terminal output. |
| Docker build fails at `npm ci` with `UNABLE_TO_GET_ISSUER_CERT_LOCALLY` | A TLS-intercepting proxy (e.g. corporate Docker Desktop proxy) the build container doesn't trust. Either add the proxy's CA to the build, or disable strict TLS for the `deps` stage only (integrity is still enforced by `package-lock.json` hashes). |
| App container shows `unhealthy` but works from the host | Healthcheck must hit `127.0.0.1`, not `localhost` — inside Alpine `localhost` resolves to IPv6 `::1` while the server binds IPv4. (Already fixed in the shipped compose files.) |
| Video Style Extract: "Could not analyze video URL" | The server can't find `yt-dlp`. Install it globally (`brew install yt-dlp` / `pipx install yt-dlp`) or create a project venv (`.venv/bin/pip install yt-dlp`). See [Video Style Extract dependencies](#optional-video-style-extract-dependencies). |

---

## Deploying to production

This app is built for **Docker** (standalone Next.js output, runs `node
server.js` on port 3000, with a `/api/health` check). Full instructions —
self-contained stack, production rollout, Clerk setup, schema loading, TLS,
backups, and a go-live checklist — are in
[**`CUSTOMER_DEPLOY.md`**](CUSTOMER_DEPLOY.md).

For an architecture deep-dive, see [`ARCHITECTURE.md`](ARCHITECTURE.md).
