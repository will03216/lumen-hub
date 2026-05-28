# Lumen — AI Image & Video Studio

A self-hosted, Higgsfield-style studio for generating images and videos with **BytePlus ModelArk** (Seedream 5.0 Lite + Seedance 1.5 Pro).

## Features

- **Image Generator** (Seedream 5.0 Lite) — text-to-image, size/seed/watermark controls
- **Video Generator** (Seedance 1.5 Pro) — text-to-video, image-to-video, first+last frame keyframes, 480p/720p/1080p, 5s/10s, six aspect ratios, fixed-camera toggle, automatic async polling
- Dark, cinematic UI (Next.js 16 + React 19 + Tailwind v4 + Radix)

## Setup

```bash
# 1. install deps (already done after scaffolding)
npm install

# 2. configure your API key
cp .env.local.example .env.local
# edit .env.local and paste your BYTEPLUS_API_KEY

# 3. run
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## How it works

- `app/api/image/route.ts` proxies `POST /api/v3/images/generations` (synchronous)
- `app/api/video/route.ts` proxies `POST /api/v3/contents/generations/tasks` (returns task id)
- `app/api/video/[id]/route.ts` proxies `GET /api/v3/contents/generations/tasks/{id}` for polling
- Video parameter shape depends on the model:
  - **Seedance 1.5 Pro** — flags inline in the text content (`prompt --resolution 1080p --duration 5 --ratio 16:9`)
  - **Seedance 2.0 / 2.0 Fast** — clean prompt; `resolution`, `duration`, `ratio`, `seed`, `camerafixed`, `generate_audio` ride at the top level of the JSON body. `lib/byteplus.ts` (`isSeedance2`) branches automatically.

The API key never leaves the server. The same `BYTEPLUS_API_KEY` works for every model — switching engines only requires enabling that model on the BytePlus console.

## Environment variables

| Variable | Required | Default |
|----------|----------|---------|
| `BYTEPLUS_API_KEY` | ✓ | — |
| `BYTEPLUS_BASE_URL` | | `https://ark.ap-southeast.bytepluses.com/api/v3` |
| `BYTEPLUS_IMAGE_MODEL` | | `seedream-5-0-lite-260128` |
| `BYTEPLUS_VIDEO_MODEL` | | `seedance-1-5-pro-251215` |

`BYTEPLUS_VIDEO_MODEL` accepts:

| Model ID | Notes |
|---|---|
| `seedance-1-5-pro-251215` | Stable. 480p / 720p / 1080p, 5-10s. |
| `dreamina-seedance-2-0-260128` | New (Apr 2026 public beta). 480p / 720p, 4-15s, native audio + multi-reference. |
| `dreamina-seedance-2-0-fast-260128` | Same capabilities as 2.0, ~25% cheaper / faster queue. |

If the default model IDs 404, check your BytePlus console for the exact dated version (`seedream-5-0-lite-YYMMDD`) and override via env.

## Deploy

Works out of the box on Vercel. Add `BYTEPLUS_API_KEY` as an env var. Note that Vercel's default serverless timeout may be too short for long-running image generations — set `maxDuration` higher on Pro plans.

## Notes on image-to-video

The `FrameUpload` component reads files as base64 data URLs and sends them to BytePlus. If BytePlus rejects data URLs for your region/model, host the image on a public URL (S3/R2/Cloudinary) and paste the URL instead — `lib/byteplus.ts` accepts both.

## Architecture

See `ARCHITECTURE.md` for a full breakdown of:

- route structure
- Generator / Compare / Library / Studio workflows
- local-first persistence and optional Supabase sync
- provider adapters for BytePlus, fal.ai, and MiniMax
- storage, service, and execution layers
