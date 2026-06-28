# Platform

Operational notes for submitting Seedance 2.0 jobs through this repo's MCP/CLI layer.

## Submission via MCP or CLI

All video generation goes through the `seedance_generate` MCP tool (preferred)
or the fine-grained `seedance_text_to_video` / `seedance_image_to_video` tools.
The equivalent CLI command is `seedance generate` / `/seedance:generate`.

The MCP server:
1. Auto-uploads any portrait references to the asset library
2. Submits the generation job async via `POST /contents/generations/tasks`
3. Returns `task_id` — poll `seedance_check_task` every 10–15 seconds

For status checks, call `seedance_check_task(task_id)` on demand. No cron, no background polling.

## Working assumptions

- Short clips are safer than long clips; default 5s, ceiling 15s.
- Common ratios: `21:9`, `16:9`, `4:3`, `1:1`, `3:4`, `9:16`, `adaptive`.
- Image references are usually easier to control than text-only generations.
- Shorter prompts generally fail less often than verbose ones.
- Resolution: `"480p"`, `"720p"`, `"1080p"`. **Default is `"720p"`** — never silently fall back to 480p. Use `"1080p"` only on explicit request. Output is MP4.

## Asset budget habits

Keep the request simple:

- one hero subject
- only the references needed for this clip
- one camera move
- one primary style anchor

### Reference limits vs. reference *strategy*

The hard ceiling is **9 images, 3 videos, 3 audio** (≤12 items total; video and
audio are URL-only). But **do not approach the ceiling** — too many references
dilute priority and the model struggles to decide what matters. A reliable
short-drama config is **4–5 assets total**, one per function:

| Functional role | Asset | Binds via |
|-----------------|-------|-----------|
| Character anchor | 1–2 portrait images (face / full body) | `reference_image` → `[image1]`/`[image2]` |
| Scene / style | 1 scene image | `reference_image` → `[image2]`/`[image3]` |
| Camera & rhythm | 1 reference video | `reference_video` → `[video1]` |
| Pacing / mood | 1 audio clip | `reference_audio` → `[audio1]` |

When a video is used only for camera/motion, say so explicitly (`use [video1]
for camera and timing only — do not copy its characters or scene`), or the
model may import its subjects.

---

## API key requirement

The underlying API uses `Authorization: Bearer <ARK_API_KEY>`. The MCP server
resolves the key in this order:

1. `ARK_API_KEY` environment variable (preferred)
2. `~/.seedance/credentials` (set via `seedance auth login`)

If none is present, `seedance_ping` will return an auth error.

### How to obtain a key

Share these steps with the user when no key is configured:

1. Sign in / register at <https://console.byteplus.com>.
2. Navigate to **ModelArk → API Keys** (docs: <https://docs.byteplus.com/en/docs/ModelArk/1361424>).
3. Click **Create Key**, copy the value (shown only once).
4. Optional: purchase a Seedance 2.0 resource pack on the same page — required before tasks can run.
5. Run `seedance auth login` and paste the key when prompted, or:
   - export it: `export ARK_API_KEY="..."`

Minimum guidance to give the user (Chinese):

```text
请到 BytePlus 控制台获取 ModelArk API Key：
1. 打开 https://console.byteplus.com 登录
2. 进入 ModelArk → API Keys → Create Key，复制 key（只显示一次）
3. 在 ModelArk 计费页面购买 Seedance 2.0 资源包（必需）
4. 运行 seedance auth login 粘贴 key，或设置环境变量 export ARK_API_KEY="..."
```

---

## Endpoints (handled by MCP server)

| Method | URL | Used by |
|--------|-----|---------|
| `POST` | `https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks` | `seedance_generate` / `seedance_text_to_video` / `seedance_image_to_video` |
| `GET`  | `https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks/{id}` | `seedance_check_task` |
| `GET`  | `https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks` | `seedance_list_tasks` |
| `DELETE` | `https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks/{id}` | `seedance_cancel_task` |

Reference docs:
- Seedance 2.0 model overview: <https://docs.byteplus.com/en/docs/ModelArk/2291680>
- Create task API: <https://docs.byteplus.com/en/docs/ModelArk/1520757>
- Retrieve task API: <https://docs.byteplus.com/en/docs/ModelArk/1521309>

---

## Reference assets

The API consumes URLs, not raw bytes. Three accepted forms:

- HTTP / HTTPS URL (publicly fetchable by ModelArk) — for **non-portrait** references
- `data:image/...;base64,...` — for **non-portrait** references (small files)
- **`asset://<asset_id>` — REQUIRED for any real or virtual human portrait reference**

`seedance_generate` auto-uploads every plain-HTTPS `--image` reference to the asset library (no portrait detection — it uploads all non-`asset://` URLs unconditionally, so portraits are always covered). For manual asset management, see [`assets.md`](assets.md).

---

## Suggested downstream pipeline

1. generate a short proof clip with `--fast` flag
2. iterate until motion and identity are correct
3. switch to default model for final quality output
4. composite exact audio, graphics, or subtitles in post if needed

## Operational warning

Do not treat repository notes about policy or platform behavior as live guarantees. If the user asks for the latest supported limits, model IDs, or pricing, verify against current official sources before answering.
