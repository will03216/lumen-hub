import type { NextRequest } from "next/server";
import { createLibraryCacheResponse } from "@/lib/library-cache/files";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ filename: string }> },
) {
  const { filename } = await params;
  return createLibraryCacheResponse({
    filename,
    method: "GET",
    rangeHeader: req.headers.get("range"),
  });
}

export async function HEAD(
  req: NextRequest,
  { params }: { params: Promise<{ filename: string }> },
) {
  const { filename } = await params;
  return createLibraryCacheResponse({
    filename,
    method: "HEAD",
    rangeHeader: req.headers.get("range"),
  });
}
