import { NextRequest, NextResponse } from "next/server";
import { uploadToTos } from "@/lib/modelark";
import { logRouteError } from "@/lib/server-log";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 50 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "audio/mpeg", "audio/mp3", "audio/aac", "audio/wav", "audio/wave",
  "audio/x-wav", "audio/ogg", "audio/flac", "audio/mp4", "audio/x-m4a",
]);

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided." }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "File exceeds 50 MB limit." }, { status: 413 });
    }

    const contentType = file.type || "audio/mpeg";
    if (!ALLOWED_TYPES.has(contentType)) {
      return NextResponse.json(
        { error: `Unsupported audio type: ${contentType}. Use mp3, aac, wav, ogg, flac, or m4a.` },
        { status: 415 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const filename = file.name || "music.mp3";
    const url = await uploadToTos(buffer, contentType, filename);

    return NextResponse.json({ url });
  } catch (err) {
    logRouteError("audio.upload", err, startedAt);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
