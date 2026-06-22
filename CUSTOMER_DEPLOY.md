# Lumen — Customer Deployment Guide

This guide explains how to deploy **Lumen** (an AI image & video studio built on
BytePlus ModelArk) in your own environment. It is written for a customer or
partner receiving the source code and standing it up themselves.

Two paths are covered:

1. **Self-contained Docker stack** (app + bundled PostgreSQL) — fastest way to a
   running instance, ideal for a trial or single-server deployment.
2. **Production deployment** (app container + your own managed PostgreSQL) — for
   a real, internet-facing rollout behind a load balancer / TLS.

---

## 1. What you are deploying

Lumen is a [Next.js 16](https://nextjs.org) (React 19) web application. It serves
both the UI and a set of server-side API routes that proxy AI model providers.

- The app builds to a **standalone** Node.js server (`node server.js`) and runs
  in a single container on **port 3000**.
- `ffmpeg` is bundled inside the image (used for reel/video rendering) — no
  separate install needed.
- A health endpoint is exposed at **`GET /api/health`** (returns `{"status":"ok"}`).

### Architecture at a glance

```
        ┌─────────────┐        ┌──────────────────────┐
 user → │   Browser   │ ──────▶│  Lumen app (port 3000)│
        └─────────────┘  HTTPS │  Next.js standalone   │
                               └───────┬──────────────┘
                                       │
                  ┌────────────────────┼─────────────────────┐
                  ▼                    ▼                       ▼
            ┌───────────┐      ┌──────────────┐      ┌──────────────────┐
            │ PostgreSQL│      │ Clerk (SaaS) │      │ AI providers      │
            │  (data)   │      │   (auth)     │      │ BytePlus, etc.    │
            └───────────┘      └──────────────┘      └──────────────────┘
                                                     (per-user BYOK keys)
```

---

## 2. Prerequisites

### Software (host machine)

| Tool | Version | Notes |
|------|---------|-------|
| Docker | 20.10+ | with Compose v2 (`docker compose`, not `docker-compose`) |
| Git | any | to clone the source |

A 2 vCPU / 4 GB RAM host is sufficient for a trial. The build step needs a few GB
of free disk for `node_modules` and the image.

> No local Node.js install is required for the Docker paths — the build runs
> inside the image. (Node 20 is used internally.)

### External services you must provide

| Dependency | Required? | What you need |
|------------|-----------|---------------|
| **PostgreSQL** | ✅ Required | Bundled in the self-contained stack, or supply your own `DATABASE_URL` for production. |
| **Clerk** (auth) | ✅ Required | A free account at [clerk.com](https://clerk.com). You create your own application and use **your** keys. Not self-hostable. |
| **Key encryption secret** | ✅ Required | A 32-byte random hex string you generate. Encrypts per-user API keys at rest. |
| **AI provider keys** | ⚙️ Per-user (BYOK) | **You do NOT set these at the server level.** Each end user enters their own keys in the in-app **Settings** page (encrypted per-user in the DB). See §7. |

> **Important:** Lumen is **strict BYOK** (bring-your-own-key). The platform
> operator does not embed BytePlus / MiniMax / fal.ai keys. Every logged-in user
> supplies their own provider keys via `/settings`. This means you can deploy
> Lumen for a customer **without sharing any of your own AI credentials**.

---

## 3. Clerk setup (one-time, required)

Authentication is handled by Clerk. Without this step, sign-in and onboarding
will not work.

1. Create a Clerk account and a new **Application** at
   [dashboard.clerk.com](https://dashboard.clerk.com).
2. Copy the two keys from **API Keys**:
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (`pk_live_...` for production, `pk_test_...` for trials)
   - `CLERK_SECRET_KEY` (`sk_live_...` / `sk_test_...`)
3. **Customize the session token** (required — the app reads custom claims):
   - Go to **Configure → Sessions → Customize session token**.
   - Add this JSON:
     ```json
     {
       "metadata": "{{user.public_metadata}}",
       "email": "{{user.primary_email_address}}"
     }
     ```
   - Without `metadata`, new users get stuck looping on `/settings`.
   - Without `email`, the optional access allowlist (§8) fails closed and denies
     everyone.
4. (Optional) Under **Configure → Restrictions**, limit sign-ups to specific
   email domains for an internal/customer-only deployment.

---

## 4. Path A — Self-contained Docker stack (recommended for trials)

This brings up **the app and a PostgreSQL database together**, builds the image
locally, and auto-loads the database schema. No external DB required.

### Steps

```bash
# 1. Clone and enter the repo
git clone <your-repo-url> lumen-hub
cd lumen-hub

# 2. Create an env file for the build/run (see template below)
cp .env.local.example .env       # then edit values

# 3. Generate the key-encryption secret
openssl rand -hex 32             # paste into KEY_ENCRYPTION_SECRET

# 4. Build and start the stack
docker compose -f docker-compose.local.yml up --build
```

Then open <http://localhost:3000>.

### Minimum environment for Path A

`docker-compose.local.yml` reads these from your shell / `.env` file. The
database URL is wired automatically to the bundled Postgres — you do **not** set
`DATABASE_URL` for this path.

```dotenv
# --- Required ---
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_xxx
CLERK_SECRET_KEY=sk_test_xxx
KEY_ENCRYPTION_SECRET=<output of: openssl rand -hex 32>

# --- Optional UI / URL ---
NEXT_PUBLIC_APP_URL=http://localhost:3000

# --- AI provider keys are NOT set here (per-user BYOK, see §7) ---
```

### What the stack contains

- **`postgres`** — `postgres:15-alpine`, database `lumenhub`, exposed on host port
  **5433** (container 5432). The schema in `supabase/pg-schema.sql` is loaded
  automatically on first boot. Data persists in the `postgres_data` Docker volume.
- **`app`** — built from the local `Dockerfile`, exposed on **3000**, with a
  healthcheck against `/api/health`. It connects to Postgres internally via
  `postgres://lumenhub:lumenhub@postgres:5432/lumenhub`.

### Managing the stack

```bash
docker compose -f docker-compose.local.yml up -d --build   # start (detached)
docker compose -f docker-compose.local.yml logs -f app     # tail app logs
docker compose -f docker-compose.local.yml down            # stop
docker compose -f docker-compose.local.yml down -v         # stop + WIPE the DB volume
```

> ⚠️ The bundled Postgres uses the demo password `lumenhub`. This is fine for a
> local trial but **must not** be used for an internet-facing deployment — use
> Path B with a managed database.

---

## 5. Path B — Production deployment (your own database)

For a real deployment you run only the app container and point it at your own
managed PostgreSQL (BytePlus RDS, AWS RDS, Supabase, self-hosted, etc.). TLS is
terminated by a load balancer / reverse proxy in front of the app.

### 5.1 Provision PostgreSQL and load the schema

Create a database (e.g. `lumenhub`) and apply the schema:

```bash
psql "$DATABASE_URL" -f supabase/pg-schema.sql
```

Additional schema files in `supabase/` (`user-api-keys.sql`,
`studio-folders.sql`) are already included in `pg-schema.sql` for fresh installs;
apply them individually only if you are migrating an existing database.

### 5.2 Create `.env.production`

Copy the template and fill every value. **Never commit this file.**

```bash
cp .env.production.example .env.production
```

Key fields:

```dotenv
NODE_ENV=production
NEXT_PUBLIC_APP_URL=https://app.yourdomain.com

# Clerk (use live keys for production)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_xxx
CLERK_SECRET_KEY=sk_live_xxx

# Your managed Postgres (use sslmode=require where supported)
DATABASE_URL=postgres://user:pass@db-host:5432/lumenhub?sslmode=require

# Generate with: openssl rand -hex 32
KEY_ENCRYPTION_SECRET=xxxxxxxx

# Optional: restrict access to specific domains/emails (see §8)
ALLOWED_EMAIL_DOMAINS=
ALLOWED_EMAILS=

# Optional: CDN in front of generated media
NEXT_PUBLIC_CDN_BASE=https://cdn.yourdomain.com
```

> **Build-time vs run-time:** any variable beginning with `NEXT_PUBLIC_` is
> **baked into the client bundle at build time**. If you change
> `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `NEXT_PUBLIC_APP_URL`, or
> `NEXT_PUBLIC_CDN_BASE`, you must **rebuild** the image. All other variables
> (`DATABASE_URL`, `CLERK_SECRET_KEY`, `KEY_ENCRYPTION_SECRET`, the access
> allowlist) are read at runtime and only require a restart.

### 5.3 Build the image

Because the `NEXT_PUBLIC_*` values are compile-time, pass them as build args:

```bash
docker build \
  --build-arg NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_live_xxx" \
  --build-arg NEXT_PUBLIC_APP_URL="https://app.yourdomain.com" \
  --build-arg NEXT_PUBLIC_CDN_BASE="https://cdn.yourdomain.com" \
  -t lumen-hub:latest .
```

For a multi-arch / registry-based workflow, see the helper script
`deploy/build-push.sh` (builds `linux/amd64` and pushes to a registry).

### 5.4 Run the container

```bash
docker run -d --name lumen \
  --env-file .env.production \
  -p 3000:3000 \
  --restart unless-stopped \
  lumen-hub:latest
```

Or, using the provided `docker-compose.yml` (which pulls a pre-built image from a
registry via `${REGISTRY}` and `${IMAGE_TAG}` and reads `.env.production`):

```bash
REGISTRY=your-registry.example.com IMAGE_TAG=latest \
  docker compose up -d
```

### 5.5 Put TLS in front

The app speaks plain HTTP on 3000. Terminate HTTPS with a load balancer (ALB),
Cloudflare, or an Nginx/Caddy reverse proxy. The app already sends HSTS and other
security headers (see `next.config.ts`), which only take effect over HTTPS.

Point the proxy's health check at **`/api/health`**.

---

## 6. Verifying the deployment

```bash
# Health endpoint should return {"status":"ok", ...}
curl -fsS http://localhost:3000/api/health

# Container health (compose)
docker compose ps
```

Then in a browser:

1. Visit the app URL → you should be redirected to Clerk sign-in.
2. Sign up / sign in.
3. You should land on onboarding / settings. If you loop endlessly on
   `/settings`, the Clerk **session token customization** (§3 step 3) is missing.

---

## 7. Configuring AI providers (per user, in-app)

Lumen does not ship with provider credentials. After signing in, each user opens
**Settings** (gear icon in the header) and pastes their own keys. Keys are
encrypted with `KEY_ENCRYPTION_SECRET` and stored per-user in the database.

| Provider | What it enables | Where to get a key |
|----------|-----------------|--------------------|
| **BytePlus / Ark** | Seedream (image), Seedance (video), Seed models — the core experience | [console.byteplus.com](https://console.byteplus.com) |
| **ModelArk AK/SK + TOS bucket** | Cloud asset Library sync | BytePlus IAM console |
| **MiniMax** | Hailuo / T2V-01-Director video models (optional) | [platform.minimax.io](https://platform.minimax.io) |
| **fal.ai** | GPT Image 2 and other fal-hosted models (optional) | [fal.ai/dashboard/keys](https://fal.ai/dashboard/keys) |

Only BytePlus is needed for the primary image+video workflow; the rest are
optional add-ons.

---

## 8. Optional: restrict who can use the platform

For an internal or single-customer deployment, you can limit access beyond
Clerk's own restrictions. Set either or both of these in `.env.production`
(read at runtime — change and restart, no rebuild):

```dotenv
# Allow anyone whose email is on these domains
ALLOWED_EMAIL_DOMAINS=customer.com,partner.io

# ...and/or these specific addresses
ALLOWED_EMAILS=alice@gmail.com,bob@outlook.com
```

- Leave **both unset** → any authenticated Clerk user is allowed.
- Set **either** → the gate is enforced (fail-closed): only matching emails get in.
- Requires the `email` claim from the Clerk session token step (§3) — otherwise
  the gate denies everyone.

---

## 9. Backups & data

All persistent application data lives in PostgreSQL (users, encrypted API keys,
Studio canvases, library metadata). Back up the database regularly.

- **Path A:** data is in the `postgres_data` Docker volume. `docker compose ...
  down -v` **destroys** it — omit `-v` to preserve.
- **Path B:** use your managed database's backup/snapshot tooling.

Generated media may be cached under `public/library-cache/` at runtime; it is
regenerable and not source-controlled.

> 🔑 **Keep `KEY_ENCRYPTION_SECRET` safe and stable.** It decrypts every stored
> user API key. If you lose or change it, all users must re-enter their provider
> keys.

---

## 10. Troubleshooting

| Symptom | Likely cause / fix |
|---------|--------------------|
| Redirect loop on `/settings` after login | Clerk session token missing the `metadata` claim (§3 step 3). |
| Everyone is denied access | Access allowlist set but Clerk session token missing the `email` claim (§3 / §8). |
| Sign-in page never loads / Clerk errors | Wrong or mismatched `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY`, or you changed the publishable key without rebuilding (§5.2). |
| App starts but errors on DB calls | `DATABASE_URL` wrong/unreachable, or schema not loaded (`psql ... -f supabase/pg-schema.sql`). |
| Model calls 404 | The dated model ID changed; override `BYTEPLUS_*_MODEL` or check the BytePlus console (see `README.md`). |
| Generated videos fail to render | Verify `ffmpeg` exists in the container: `docker exec lumen ffmpeg -version` (it is installed by the image). |
| Container reports unhealthy | Hit `/api/health` directly; check `docker logs lumen` for startup errors (usually missing env). |

---

## 11. Security checklist before going live

- [ ] Use **live** Clerk keys and a real custom domain for production.
- [ ] Use a **managed Postgres with a strong password and TLS** (Path B), not the
      bundled demo DB.
- [ ] Generate a fresh `KEY_ENCRYPTION_SECRET` and store it in a secrets manager.
- [ ] Terminate **HTTPS** in front of the app (HSTS headers assume TLS).
- [ ] Set the **access allowlist** (§8) if the platform is not meant to be public.
- [ ] Never commit `.env`, `.env.local`, `.env.production`, or `deploy/.env.deploy`
      (all are gitignored — keep them that way).
- [ ] Restrict who can reach the host's port 3000 (only the load balancer should).

---

## Reference: files in this repo relevant to deployment

| File | Purpose |
|------|---------|
| `Dockerfile` | Multi-stage build → standalone Node server on port 3000. |
| `docker-compose.local.yml` | Self-contained stack (app + Postgres). Path A. |
| `docker-compose.yml` | App-only, pulls image from registry, external DB. Path B. |
| `.env.local.example` | Template for local/trial env. |
| `.env.production.example` | Template for production env (authoritative list). |
| `supabase/pg-schema.sql` | Database schema to load on a fresh DB. |
| `deploy/build-push.sh` | Build `linux/amd64` image and push to a registry. |
| `deploy/deploy.sh`, `deploy/ecs-bootstrap.sh` | Reference scripts for a BytePlus ECS rollout. |
| `app/api/health/route.ts` | Health endpoint used by container/LB checks. |
| `ARCHITECTURE.md` | Deeper technical breakdown of routes and layers. |
