"use client";

/**
 * requestImage — drop-in async replacement for `fetch("/api/image", …)`.
 *
 * Image generation is now submit + poll (see lib/server/image-jobs.ts): the
 * POST returns a job id in well under a second, and this helper polls
 * GET /api/image/[id] until the job settles. It resolves with a real
 * `Response` whose shape matches what the old synchronous route returned —
 * success carries the ImageGenResponse `data[]`; failure carries the upstream
 * status plus `{ error }` — so every caller keeps its existing
 * `res.ok` / `res.status` / `res.json()` handling unchanged. Because no request
 * is ever held open, the gateway's ~60s timeout can't fire at any model/size.
 *
 * Aborting the passed signal stops polling and rejects with an AbortError,
 * exactly as `fetch(..., { signal })` did before (the server job keeps running
 * and is swept by TTL — an accepted orphan).
 */

const POLL_INTERVAL_MS = 2000;
/** Hard ceiling so a lost/expired job can't poll forever. */
const MAX_POLL_MS = 6 * 60_000;

export async function requestImage(
  body: unknown,
  signal?: AbortSignal,
): Promise<Response> {
  const submit = await fetch("/api/image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  // Validation / auth / missing-key errors surface synchronously, just as
  // before — hand the Response straight back to the caller.
  if (!submit.ok) return submit;

  const { jobId } = (await submit.json()) as { jobId?: string };
  if (!jobId) {
    return jsonResponse(502, { error: "no job id returned" });
  }

  const deadline = Date.now() + MAX_POLL_MS;
  for (;;) {
    await delay(POLL_INTERVAL_MS, signal);

    const poll = await fetch(`/api/image/${jobId}`, { signal });
    // A terminal upstream failure (or 404 for an expired job) comes back
    // non-2xx — pass it through so the caller's classifier handles the status.
    if (!poll.ok) return poll;

    const data = (await poll.json()) as { status?: string };
    if (data.status === "running") {
      if (Date.now() > deadline) {
        return jsonResponse(504, { error: "image generation timed out" });
      }
      continue;
    }
    // Succeeded — re-wrap as a 200 carrying the ImageGenResponse fields
    // (data[], created, usage) so `res.json().data` reads as it always did.
    return jsonResponse(200, data);
  }
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Promise-based delay that rejects on abort so polling stops promptly. */
function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      return reject(new DOMException("Aborted", "AbortError"));
    }
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}
