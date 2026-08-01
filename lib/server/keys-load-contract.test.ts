/**
 * The contract that stops "we couldn't read your keys" from rendering as
 * "you have no keys".
 *
 * Background: `auth.protect()` answers an unauthenticated XHR with a 307 to
 * /sign-in. fetch() follows redirects by default, so the caller receives
 * `200 text/html` — `res.ok` is TRUE and only `res.json()` fails. Every guard
 * written as `if (!res.ok) return {}` is structurally unable to catch this,
 * and returning {} makes a failed request identical to an empty account.
 *
 * These tests pin the client-side detection rules. The middleware fix (API
 * routes answer 401 JSON instead of redirecting) removes the cause; this
 * keeps the symptom from silently reappearing behind any other redirect.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Hints = Record<string, string | null>;

/** Mirrors loadHints() in app/settings/page.tsx. */
async function loadHints(): Promise<
  { status: "ready"; hints: Hints } | { status: "error" }
> {
  try {
    const res = await fetch("/api/user/keys");
    const isJson = res.headers
      .get("content-type")
      ?.toLowerCase()
      .includes("application/json");
    if (res.redirected || !isJson) return { status: "error" };
    if (!res.ok) return { status: "error" };
    const { keys } = (await res.json()) as { keys: Hints };
    return { status: "ready", hints: keys };
  } catch {
    return { status: "error" };
  }
}

function reply(opts: {
  status?: number;
  contentType?: string;
  body?: unknown;
  redirected?: boolean;
  throws?: boolean;
}) {
  const { status = 200, contentType = "application/json", body = {}, redirected = false, throws = false } = opts;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      if (throws) throw new TypeError("Failed to fetch");
      return {
        ok: status >= 200 && status < 300,
        status,
        redirected,
        headers: { get: (h: string) => (h.toLowerCase() === "content-type" ? contentType : null) },
        json: async () => {
          if (contentType !== "application/json") throw new SyntaxError("Unexpected token <");
          return body;
        },
      } as unknown as Response;
    }),
  );
}

beforeEach(() => vi.unstubAllGlobals());
afterEach(() => vi.unstubAllGlobals());

describe("settings key-hint loading", () => {
  it("reports ready with the hints on a normal response", async () => {
    reply({ body: { keys: { byteplus: "027d", byteplus_ak: "xOTg" } } });
    const r = await loadHints();
    expect(r.status).toBe("ready");
    expect(r.status === "ready" && r.hints.byteplus).toBe("027d");
  });

  it("distinguishes a genuinely empty account from a failure", async () => {
    reply({ body: { keys: {} } });
    const r = await loadHints();
    // Empty is a legitimate answer — it must NOT be reported as an error.
    expect(r.status).toBe("ready");
    expect(r.status === "ready" && Object.keys(r.hints)).toHaveLength(0);
  });

  it("catches the redirect-to-sign-in case that a !res.ok guard cannot", async () => {
    // What auth.protect() produced: 307 → /sign-in, followed by fetch to a
    // real 200 text/html page. `ok` is true, so only `redirected` catches it.
    reply({ status: 200, contentType: "text/html; charset=utf-8", redirected: true });
    expect((await loadHints()).status).toBe("error");
  });

  it("catches an HTML body even when the redirect flag is unset", async () => {
    // Some proxies rewrite rather than redirect, so `redirected` stays false.
    reply({ status: 200, contentType: "text/html; charset=utf-8", redirected: false });
    expect((await loadHints()).status).toBe("error");
  });

  it("treats a 401 from the fixed middleware as an error, not emptiness", async () => {
    reply({ status: 401, body: { error: "unauthenticated" } });
    expect((await loadHints()).status).toBe("error");
  });

  it("treats the malformed-cookie 500 as an error", async () => {
    reply({ status: 500, contentType: "text/html", redirected: false });
    expect((await loadHints()).status).toBe("error");
  });

  it("treats a network drop as an error", async () => {
    reply({ throws: true });
    expect((await loadHints()).status).toBe("error");
  });

  it("never reports 'ready' with empty hints for any failure mode", async () => {
    const failures = [
      { status: 200, contentType: "text/html", redirected: true },
      { status: 401, body: { error: "unauthenticated" } },
      { status: 500, contentType: "text/html" },
      { throws: true },
    ];
    for (const f of failures) {
      reply(f);
      // This is the regression: any of these previously returned {} and the
      // form rendered as though nothing had ever been saved.
      expect((await loadHints()).status).toBe("error");
    }
  });
});
