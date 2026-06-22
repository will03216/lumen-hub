/**
 * POST /api/forge/trace
 *
 * Observability for the inner loop — the moat material. Each guarded generation
 * posts its QA trace (per-attempt scores, fix hints, mode, confidence). When a
 * DB is configured these rows accumulate into `forge_qa_traces` for trace
 * mining: calibrating per-vertical critics and tuning prompting over time
 * (HLD §17). Best-effort: no DB → 204, never blocks a render.
 */

import { auth } from "@clerk/nextjs/server";
import { NextRequest } from "next/server";
import { logRouteError } from "@/lib/server-log";

export const runtime = "nodejs";

type Attempt = {
  attempt: number;
  score: number;
  pass: boolean;
  fixHint?: string;
  mode?: string;
  confidence?: number;
};

type TraceBody = {
  projectId?: string;
  templateId?: string;
  kind?: string;
  label?: string;
  attempts?: Attempt[];
};

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  try {
    if (!process.env.DATABASE_URL) return new Response(null, { status: 204 });
    const { userId } = await auth();
    if (!userId) return new Response(null, { status: 204 });

    const body = (await req.json()) as TraceBody;
    if (!Array.isArray(body.attempts) || body.attempts.length === 0) {
      return new Response(null, { status: 204 });
    }

    const last = body.attempts[body.attempts.length - 1];
    const { db } = await import("@/lib/db");
    await db.query(
      `INSERT INTO forge_qa_traces
         (user_id, project_id, template_id, kind, label, attempts, final_score, final_pass, payload)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        userId,
        body.projectId ?? null,
        body.templateId ?? null,
        body.kind ?? null,
        body.label ?? null,
        body.attempts.length,
        last.score,
        last.pass,
        JSON.stringify(body),
      ],
    );
    return new Response(null, { status: 204 });
  } catch (err) {
    // Telemetry must never break a run — log and swallow.
    logRouteError("forge/trace", err, startedAt);
    return new Response(null, { status: 204 });
  }
}
