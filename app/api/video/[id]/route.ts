import { NextRequest, NextResponse } from "next/server";
import { BytePlusError, getVideoTask } from "@/lib/byteplus";
import { MinimaxError, getVideoTaskMinimax } from "@/lib/minimax";
import { findVideoModel } from "@/lib/studio/models";
import {
  logBytePlusError,
  logMinimaxError,
  logRouteError,
} from "@/lib/server-log";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const startedAt = Date.now();
  let taskId: string | undefined;
  let model: string | undefined;
  try {
    const { id } = await params;
    taskId = id;
    // Poll path doesn't have body access; the client forwards the model
    // as a query param so we can dispatch on provider. Falling back to
    // BytePlus when missing keeps pre-§62 callers (older saved jobs,
    // direct cURL) working.
    model = req.nextUrl.searchParams.get("model") ?? undefined;
    if (!id) {
      return NextResponse.json({ error: "missing id" }, { status: 400 });
    }
    const provider =
      (model && findVideoModel(model)?.provider) ?? "byteplus";
    const result =
      provider === "minimax"
        ? await getVideoTaskMinimax(id)
        : await getVideoTask(id);
    return NextResponse.json(result);
  } catch (err) {
    // Forward upstream status so the classifier can route 404 →
    // "task-expired", 429 → rate-limit, etc.
    if (err instanceof BytePlusError) {
      logBytePlusError("video.poll", err, startedAt, {
        task_id_hash: taskId ? hashTaskId(taskId) : null,
        model,
      });
      return NextResponse.json(
        { error: err.message, code: err.statusText },
        { status: err.status },
      );
    }
    if (err instanceof MinimaxError) {
      logMinimaxError("video.poll", err, startedAt, {
        task_id_hash: taskId ? hashTaskId(taskId) : null,
        model,
      });
      return NextResponse.json(
        { error: err.message, code: err.statusText },
        { status: err.status },
      );
    }
    logRouteError("video.poll", err, startedAt, {
      task_id_hash: taskId ? hashTaskId(taskId) : null,
      model,
    });
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Short non-cryptographic digest — first 8 chars + last 4. Lets us
 *  group-by task in log search (e.g. "this task failed 3 times in a row")
 *  while keeping the full id out of logs. Not a security hash — task ids
 *  aren't secrets, we're just trimming log noise. */
function hashTaskId(id: string): string {
  if (id.length <= 12) return id;
  return `${id.slice(0, 8)}…${id.slice(-4)}`;
}
