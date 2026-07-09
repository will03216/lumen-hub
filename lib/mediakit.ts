/**
 * BytePlus AI MediaKit — "enhance-video" tool client.
 *
 * This is the standalone AI MediaKit REST API, NOT the VOD Vid/workflow path
 * and NOT the Volcengine V4 signer in lib/modelark.ts. Auth is a simple
 * `Authorization: Bearer <MediaKit API Key>` — a separate credential from the
 * ModelArk `ark` key and the TOS AK/SK pair.
 *
 *   Host (fixed):  https://mediakit.ap-southeast-1.bytepluses.com
 *   Submit:        POST /api/v1/tools/enhance-video  → { success, task_id, request_id }
 *   Poll:          GET  /api/v1/tasks/{task_id}      → { status, result|output, error }
 *
 * Both helpers are thin fetch wrappers that add the Bearer header and return
 * the raw parsed JSON. Response normalization (task_id / status / url) lives in
 * the API routes so this file stays a dumb transport.
 */

const MEDIAKIT_HOST =
  process.env.MEDIAKIT_HOST ?? "https://mediakit.ap-southeast-1.bytepluses.com";

export class MediaKitError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(`MediaKit ${status}: ${message}`);
    this.name = "MediaKitError";
  }
}

/** Enhance-video request. `resolution` and `resolution_limit` are mutually
 *  exclusive — never populate both (the route enforces this). */
export type EnhancePayload = {
  /** Public http/https URL of the source video (≤10GB, input res up to 2K).
   *  NOTE: the API field is `video_url` — sending `url` fails validation with
   *  `missing properties: ["video_url"]`. */
  video_url: string;
  tool_version: "standard" | "professional";
  /** Only meaningful for tool_version=standard. */
  scene?: string;
  resolution?: string;
  resolution_limit?: string;
  /** Target frame rate 15–120; omit to keep source fps. */
  fps?: number;
  bitrate_level?: "low" | "medium" | "high";
  /** Idempotency token so a retried submit doesn't double-queue a task. */
  client_token?: string;
};

async function parseJson(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new MediaKitError(res.status, `Non-JSON response: ${text.slice(0, 300)}`);
  }
}

/** Extract a nested error message from whatever shape MediaKit returned. */
function errMessage(data: Record<string, unknown>): string | undefined {
  const err = data.error;
  if (typeof err === "string") return err;
  if (err && typeof err === "object" && "message" in err) {
    return String((err as Record<string, unknown>).message);
  }
  if (typeof data.message === "string") return data.message;
  return undefined;
}

/** POST /api/v1/tools/enhance-video.
 *
 * MediaKit returns HTTP 200 for BOTH success and validation errors (the real
 * outcome is in `success` / `error`), so this returns the raw status + body
 * and lets the route decide — it must not treat 200 as success on its own.
 * Only genuine transport / non-JSON failures throw here. */
export async function submitEnhance(
  payload: EnhancePayload,
  apiKey: string,
): Promise<{ httpStatus: number; body: Record<string, unknown> }> {
  const res = await fetch(`${MEDIAKIT_HOST}/api/v1/tools/enhance-video`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });
  return { httpStatus: res.status, body: await parseJson(res) };
}

/** GET /api/v1/tasks/{task_id}. Returns the raw parsed response. */
export async function getTask(
  taskId: string,
  apiKey: string,
): Promise<Record<string, unknown>> {
  const res = await fetch(
    `${MEDIAKIT_HOST}/api/v1/tasks/${encodeURIComponent(taskId)}`,
    {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
    },
  );
  const data = await parseJson(res);
  if (!res.ok) {
    throw new MediaKitError(res.status, errMessage(data) ?? `HTTP ${res.status}`);
  }
  return data;
}
