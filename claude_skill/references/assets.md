# Assets API — Real / Virtual Human Portrait Workflow

> **Why this exists**: BytePlus ModelArk applies aggressive input-image moderation to detect real human faces. Direct uploads of real-person images (HTTP URL or `data:` URI) are rejected at the input stage with `InputImageSensitiveContentDetected.PrivacyInformation`. Even if input passes, output moderation often blocks intimate or character-driven scenes.
>
> **Solution**: Upload portraits as **trusted assets** through the Assets API first. The returned `asset://<asset_id>` form bypasses input portrait detection because the platform tracks the upload through an authorized creation flow.

---

## Mandatory rule

If **any** input image to a Seedance 2.0 generation is a **real or virtual human portrait** (face / full-body / character reference), you MUST:

1. Upload it via the Assets API → get an `asset_id`
2. Wait until status = `Active`
3. Reference it as `asset://<asset_id>` in the generation request

Non-portrait references (backgrounds, storyboards with no real faces, mannequin templates, props, scenery) can use plain URLs — no asset upload needed.

---

## How assets are handled in this repo

### Automatic (recommended): `seedance_generate` MCP tool

The `seedance_generate` MCP tool handles asset upload automatically:

1. For any `--image` URL that is not already an `asset://` ref, calls `CreateAssetGroup` → `CreateAsset` → polls until `Active` (there is no portrait detector — it uploads *every* plain-HTTPS image unconditionally, which is what makes portraits always safe)
2. Substitutes `asset://<id>` into the generation request
3. Leaves existing `asset://` refs untouched

Just pass the plain URL — the tool handles the rest:

```
/seedance:generate [image1] smiles softly, camera slowly pushes in \
  --image https://example.com/portrait.jpg
```

### Manual: CLI commands

For reusing assets across multiple generations or fine-grained control:

```bash
# One-time: create a group for your project's portraits
seedance asset group create my-portraits

# Upload a portrait and get back the asset URL
seedance asset upload https://example.com/face.jpg --group <group-id>
# Returns: asset://asset-20260415163100-xyz45

# Use the asset:// URL in future generations (skips re-upload)
seedance generate --image "asset://asset-20260415163100-xyz45" "..."
```

### Manual: MCP tools

```
seedance_create_asset_group  → group-id
seedance_upload_asset        → asset-id (polls until Active)
seedance_get_asset           → check status
```

---

## One-time setup

### 1. Sign authorization letter (one-time, manual)

Before the first `CreateAssetGroup` succeeds, an authorized representative must sign the digital-asset commitment letter in the BytePlus Ark Console.

If a generation fails with an authorization error from the Assets API, point the user to: <https://console.byteplus.com/ark/> → Asset library → Sign letter.

### 2. Obtain AK/SK credentials

The Assets API uses **Access Key (AK) + Secret Key (SK)** signing — NOT the Bearer `ARK_API_KEY` used for video generation.

Get AK/SK from: <https://docs.byteplus.com/en/docs/byteplus-platform/docs-creating-an-accesskey>

Configure via environment variables:

```bash
export ARK_AK="AKLT..."
export ARK_SK="..."
export ARK_REGION="ap-southeast-1"
```

Or via `seedance auth login` which will prompt for and store AK/SK credentials.

---

## Endpoint & service info

| Field | Value |
|-------|-------|
| Host | `ark.ap-southeast-1.byteplusapi.com` |
| Region | `ap-southeast-1` |
| Service | `ark` |
| Version | `2024-01-01` |
| Auth | AWS-style Signature V4 with AK/SK |
| Content-Type | `application/json` |

All actions are POST-style "universal" calls. The action is selected by the `Action=` query parameter.

---

## API reference

### 1. `CreateAssetGroup`

```
POST /?Action=CreateAssetGroup&Version=2024-01-01
```

Request body:
```json
{
  "Name": "my-project-portraits",
  "Description": "Portrait assets for my-project",
  "GroupType": "AIGC",
  "ProjectName": "default"
}
```

Response:
```json
{ "Result": { "Id": "group-20260415163000-abc12" } }
```

> **Limits**: Max name 64 chars; description 300 chars. Rate limit 10 QPS.

### 2. `CreateAsset`

```
POST /?Action=CreateAsset&Version=2024-01-01
```

Request body:
```json
{
  "GroupId": "group-20260415163000-abc12",
  "URL": "https://your-public-host.com/face.jpg",
  "AssetType": "Image",
  "Name": "character_face_male",
  "ProjectName": "default"
}
```

> **Asynchronous** — starts in `Processing`. Poll `GetAsset` until `Status=Active` before use.
>
> **`Moderation.Strategy`** (optional object) — controls the asset's content pre-filter review:
> - `Default` (server default if the field is omitted): pre-filter review is ON. The asset goes `Processing → Failed` with `InputAudioSensitiveContentDetected` / `InputImageSensitiveContentDetected` if it trips review (this is what catches copyrighted music, recognized commercial tracks, etc.).
> - `Skip`: skip most non-baseline content-security review policies for this asset, so it ingests to `Active` even if it would otherwise be flagged. **Baseline policies still apply.** Use only for content you are authorized to use (licensed audio, your own footage). Empirically, `Skip` lets an asset that `Default` rejects (e.g. a copyrighted-music clip) reach `Active`.
>
> **The URL must be publicly fetchable** (no auth, no Lark-internal links). Base64 / data URIs are NOT supported here.
>
> **Per-asset limits**:
> - Image: jpeg / png / webp / bmp / tiff / gif / heic / heif; aspect 0.4–2.5; 300–6000 px each side; ≤30 MB
> - Video: mp4 / mov; 480p or 720p; 2–15 s; aspect 0.4–2.5; 300–6000 px; w·h within [409600, 927408]; ≤50 MB; FPS 24–60
> - Audio: wav / mp3; 2–15 s; ≤15 MB
>
> Rate limit: 300 QPM.

### 3. `GetAsset` — poll until Active

```
POST /?Action=GetAsset&Version=2024-01-01
{ "Id": "asset-20260415163100-xyz45" }
```

`Status` enum:
- `Processing` — keep polling (recommended interval: 3 s; typical wait: 2–10 s)
- `Active` — ready for use
- `Failed` — see `Error.Message`; the asset is unusable

### 4. Use the asset in generation

Once `Active`, use `asset://<Id>` wherever you would pass an HTTP URL:

```
/seedance:generate [image1] smiles softly --image "asset://asset-20260415163100-xyz45"
```

Or mix portrait assets with plain URLs for non-portrait references:

```
/seedance:generate [image1] in the environment shown in [image2], slow push \
  --image "asset://asset-20260415163100-xyz45" \
  --image "https://example.com/storyboard.jpg"
```

---

## Best practice — split portrait references

> **From the BytePlus team**: Combining face close-up + outfit + three-view into a single image makes each region too small. The model's recognition degrades, identity may drift, and a non-celebrity face can be misclassified as a celebrity look-alike → triggers risk-control blocking.

Always split into **separate assets**:

| Asset | Purpose |
|-------|---------|
| `hero_face_neutral` | Tight close-up of face, neutral expression |
| `hero_three_view` | Front / side / back styling references |
| `hero_outfit_detail` | Costume close-ups, accessories |
| Background / setting | Scene / environment — usually non-portrait, plain URL is fine |

Then in the prompt: *"the character's face must strictly follow [image3], styling follows [image2], set in the location shown in [image1]"*.

---

## Other Asset management calls

| Action | Use | Rate limit |
|--------|-----|-----------|
| `ListAssetGroups` | Find existing groups | 10 QPS |
| `ListAssets` | List assets in a group, filter by status / name | 10 QPS |
| `GetAssetGroup` | Inspect one group | 10 QPS |
| `UpdateAsset` | Rename or move asset | 10 QPS |
| `DeleteAsset` | Remove asset | 10 QPS |

All follow the same `Action=` + `Version=2024-01-01` convention with AK/SK signing.

---

## Failure modes & recovery

| Symptom | Cause | Fix |
|---------|-------|-----|
| `InputImageSensitiveContentDetected.PrivacyInformation` on generation | Passed a real-person URL directly | Use `seedance_generate` (auto-uploads) or upload manually and pass `asset://` |
| `CreateAssetGroup` returns auth error on first call | Authorization letter not signed | Sign letter in console (one-time) |
| `CreateAsset` returns invalid URL | URL not publicly fetchable | Re-host on a public bucket; verify with `curl -I` |
| Asset stuck in `Processing` >2 min | Backend queue load | Wait longer; or retry upload as a new asset |
| Asset goes to `Failed` | Content rejected (size, format, NSFW etc.) | Read `Error.Message`; resize / reformat / replace |
| Asset `Failed` with `InputAudioSensitiveContentDetected` / `InputImageSensitiveContentDetected` at ingestion | Content pre-filter review flagged it (e.g. copyrighted/recognized commercial music) | For content you're authorized to use, set `Moderation.Strategy = "Skip"` on `CreateAsset`; otherwise replace with licensed/royalty-free content |
| Generation still blocks with `asset://` | Too many references combined in one asset → false positive | Split into separate face / outfit / three-view assets |

---

## References

- AK/SK creation: <https://docs.byteplus.com/en/docs/byteplus-platform/docs-creating-an-accesskey>
- Console: <https://console.byteplus.com/ark/>
