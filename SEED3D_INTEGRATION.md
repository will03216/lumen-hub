# Seed3D 2.0 — Image → 3D → Video Integration

This document describes the **Seed3D 2.0** image-to-3D feature added to Lumen
Studio: what it does, how it's wired, the files involved, and how to run and
test it. It lives on the `3d-integration` branch.

---

## What it does

A new optional Studio canvas node — **Image → 3D** — turns a product image into
a 3D mesh and then into an orbiting video, entirely inside the node graph:

```
image URL → [Image → 3D]
   Seed3D 2.0 task (image → .glb mesh)
   → client-side turntable render (three.js, in the browser)
   → N frames uploaded to TOS (public URLs)
   → first / last frame  → [Video Gen]  → orbit video
```

The node is **optional**: it only works when the user has a Seed3D key (added in
Settings, or `SEED3D_API_KEY` in the environment for local dev). Without a key,
the API returns the standard `402 → /settings` response.

---

## Why it's built this way

| Decision | Rationale |
|----------|-----------|
| **Separate `seed3d` provider** (not the app's BytePlus key) | Seed3D runs on the **China Ark region** (`ark.cn-beijing.volces.com`) with a distinct credential — a different endpoint and account from the app's `ap-southeast` BytePlus key. |
| **Per-user BYOK + env dev fallback** | Consistent with the app's strict-BYOK model (each user brings their own key). `SEED3D_API_KEY` is read **only** as a local-dev convenience. |
| **Client-side turntable rendering** | Rendering a 45 MB textured GLB server-side would need headless WebGL/Chromium on `node:20-alpine` — heavy and fragile. Browsers already have native WebGL, and the Studio canvas is a rich client, so three.js renders the frames with zero server-image bloat. |
| **Server unzips the mesh** | Seed3D returns the mesh as a **`.zip`** on a 24 h presigned TOS URL. `/api/model3d/mesh` fetches + unzips it server-side and streams the `.glb` **same-origin**, so the browser renderer avoids CORS and client-side unzip. |
| **Frames uploaded to TOS** | The Video Gen node requires **public https** keyframe URLs (it rejects `data:` URLs). Rendered frames are published to the user's TOS bucket so Seedance can ingest them. |

---

## The Seed3D API (as integrated)

Same async-task envelope as the app's video pipeline.

**Create** — `POST {base}/contents/generations/tasks`
```json
{
  "model": "doubao-seed3d-2-0-260328",
  "content": [
    { "type": "text", "text": " --subdivisionlevel high --fileformat glb" },
    { "type": "image_url", "image_url": { "url": "<public image url>" } }
  ]
}
```
→ `{ "id": "cgt-…" }`

**Poll** — `GET {base}/contents/generations/tasks/{id}`
```json
{
  "status": "succeeded",
  "content": { "file_url": "https://…/mesh.zip?X-Tos-…" },
  "fileformat": "glb",
  "usage": { "total_tokens": 30000 }
}
```

Notes verified against the live API:
- `file_url` is a **`.zip`** (24 h presigned) containing a single
  `pbr/mesh_textured_pbr.glb` — plain glTF 2.0, **no Draco/KTX2**, ~45 MB.
- A run takes **~4 minutes** and costs **~30k tokens**.
- No preview/turntable images are returned — hence the client render step.

---

## Files

### New

| File | Purpose |
|------|---------|
| `lib/seed3d.ts` | Seed3D adapter: key resolution (per-user → `SEED3D_API_KEY` fallback), `createModel3dTask`, `getModel3dTask`, `Seed3DError`. |
| `app/api/model3d/route.ts` | `POST` — submit an image→3D task. |
| `app/api/model3d/[id]/route.ts` | `GET` — poll a task. |
| `app/api/model3d/mesh/route.ts` | `GET ?u=<zip url>` — fetch + unzip the archive, stream the `.glb` same-origin (`model/gltf-binary`). Host-allowlisted (same guard as `/api/media`). |
| `app/api/model3d/upload-frame/route.ts` | `POST` — publish one rendered frame (`data:` URL) to the user's TOS bucket → public URL. |
| `lib/studio/turntable.ts` | Client three.js renderer: loads the GLB, PBR-lit orbit, captures N JPEG frames. `three` is dynamically imported so it stays out of the main bundle. |
| `app/studio/nodes/image-to-3d-node.tsx` | The **Image → 3D** canvas node (component + spec + execute). |

### Modified

| File | Change |
|------|--------|
| `lib/server/user-keys.ts` | `seed3d` added to `UserKeys` + the provider switch. |
| `app/api/user/keys/route.ts` | `seed3d` added to `VALID_PROVIDERS` (optional — **not** required for onboarding). |
| `app/settings/page.tsx` | Optional "Seed3D 2.0 API Key" field. |
| `app/studio/nodes/registry.ts`, `app/studio/types.ts`, `app/studio/studio-canvas.tsx` | Register the `imageTo3D` node type. |
| `lib/server-log.ts` | `model3d.create` / `model3d.poll` route tags. |
| `lib/studio/templates.ts` | New **"3D Turntable (Seed3D)"** starter template. |
| `package.json` | Added `three`, `@types/three`, `fflate`. |

---

## The Image → 3D node

**Inputs:** `image` (a public https URL — e.g. an Image Gen output).

**Form controls:** detail (`low`/`medium`/`high`), turntable `frames` (2–24),
render `size` (512/768/1024), `background` color.

**Outputs:**

| Port | Value |
|------|-------|
| `first frame` | Public URL of the 0° frame → wire to Video Gen `image` |
| `last frame` | Public URL of the ~180° frame → wire to Video Gen `lastFrame` |
| `frames` | All frame URLs (newline-joined) → for R2V / reference images |
| `glb` | Same-origin GLB stream URL (download / preview) |

`first + last` gives Seedance a **~180° bookend orbit**. A full 360° spin is a
follow-up using the `frames` output with Seedance's multi-reference (R2V) mode.

---

## Configuration

### Per user (production)
Add the key in **Settings → "Seed3D 2.0 API Key"**. It is encrypted per-user with
`KEY_ENCRYPTION_SECRET`, exactly like the other provider keys.

To run the **full pipeline**, the user also needs (already part of Lumen):
- **BytePlus API key** — Image Gen + Video Gen
- **Access Key + Secret Key + TOS bucket** — the rendered frames are uploaded to
  TOS so Seedance can ingest them

### Local dev (`.env.local`, gitignored)
```dotenv
SEED3D_API_KEY=ark-...                                   # your Seed3D (China Ark) key
SEED3D_BASE_URL=https://ark.cn-beijing.volces.com/api/v3 # optional override
SEED3D_MODEL=doubao-seed3d-2-0-260328                    # optional override
```
> Never commit real keys — `.env.local` is gitignored. Rotate any key that has
> been shared in plaintext.

---

## Running & testing

```bash
npm run dev        # http://localhost:3000
```

1. Sign in, then add the keys above in **Settings**.
2. **Studio → New project → "3D Turntable (Seed3D)"** template. Pre-wired:
   ```
   [product prompt] → [Image Gen] → [Image → 3D] ─first→─┐
                                        └─last──────────► [Video Gen] → [Preview]
   [orbit motion prompt] ────────────────────────────────┘
   ```
3. **Run.** Image Gen makes a clean product still → Image → 3D builds the mesh
   (~4 min, "Building mesh… n/120") → the browser renders the turntable
   ("Rendering frame n/8") → frames upload to TOS → Video Gen bookends them into
   an orbit clip.

**Requires a desktop browser with WebGL** for the render step.

---

## Verification done

- ✅ Live Seed3D round-trip (create → poll → `content.file_url`), schema-confirmed
- ✅ Real `.zip` → `.glb` extraction (fflate; valid `glTF` magic; 45 MB)
- ✅ `tsc --noEmit` clean; `next build` compiles all four `/api/model3d/*` routes
- ✅ Test suite: 180/180 pass

The in-browser turntable render and the auth-gated end-to-end flow require a
signed-in browser session and were left for interactive testing.

---

## Known limitations / follow-ups

- **~180° orbit only** via the first/last bookend. Full 360° needs the R2V path
  (`frames` output → Seedance multi-reference).
- **Mesh persistence:** `/api/model3d/mesh` streams the GLB on demand by
  re-fetching the source zip, which expires after 24 h. Long-term, mirror the
  GLB to permanent storage (same pattern recommended for the Library).
- **`obj` output** is accepted by the API but the turntable renderer targets
  `glb`; the node forces `glb`.
- **Cost/latency:** ~30k tokens and ~4 min per mesh — surface this in the UI
  before heavier usage.
