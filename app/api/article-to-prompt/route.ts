import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { logRouteError } from "@/lib/server-log";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";

export const runtime = "nodejs";
export const maxDuration = 60;

type IngestBody = {
  articleText?: string;
  articleUrl?: string;
  claudeModel?: string;
  claudeApiKey?: string;
  systemPrompt?: string;
  shotCount?: number;
  shotDuration?: number;
  outputLanguage?: string;
  customOutputLanguage?: string;
};

function resolveLanguageInstruction(outputLanguage = "match", customOutputLanguage = ""): string {
  if (outputLanguage === "en") return "Respond in English.";
  if (outputLanguage === "es") return "Respond in Spanish.";
  if (outputLanguage === "fr") return "Respond in French.";
  if (outputLanguage === "custom") return customOutputLanguage.trim() || "Respond in the same language as the article.";
  return "Respond in the same language as the article.";
}

function buildUserMessage(
  content: string,
  shotCount: number,
  shotDuration: number,
  outputLanguage = "match",
  customOutputLanguage = "",
): string {
  const totalSeconds = shotCount * shotDuration;
  const shotsInstruction =
    shotCount <= 1
      ? `Generate 1 visual shot prompt based on the most compelling aspect of this content.`
      : `Generate exactly ${shotCount} visual shot prompts for a ${totalSeconds}-second video (${shotCount} shots × ${shotDuration}s each). Each prompt describes a single ${shotDuration}-second clip.`;

  const langInstruction = resolveLanguageInstruction(outputLanguage, customOutputLanguage);

  return (
    `Here is the article content:\n\n${content}\n\n` +
    `Focus only on the main article text. Ignore ads, video embeds, YouTube links, related articles, author bios, comments, and navigation text.\n\n` +
    `${shotsInstruction}\n\n` +
    `Also write a narration script with exactly ${shotCount} sentences — one per shot. ` +
    `Each sentence must be no longer than ${Math.floor(shotDuration * 1.5)} words to fit within ${shotDuration} seconds of speech. ` +
    `Each sentence must describe what the chef is actively doing in that shot (not quote the article or make general comments about the dish). ` +
    `Natural spoken delivery, present tense.\n\n` +
    `${langInstruction}\n\n` +
    `Respond with valid JSON only, no markdown fences:\n` +
    `{"shots":["<prompt 1>","<prompt 2>",...],"anchorScript":"<narration>"}`
  );
}

async function fetchArticleText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; LumenHub/1.0)" },
  });
  if (!res.ok) throw new Error(`Failed to fetch URL: HTTP ${res.status}`);
  const html = await res.text();
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, 8000);
}

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  try {
    const body = (await req.json()) as IngestBody;

    if (!body.claudeApiKey?.trim()) {
      return NextResponse.json({ error: "Claude API key is required." }, { status: 400 });
    }
    if (!body.systemPrompt?.trim()) {
      return NextResponse.json({ error: "System prompt is required." }, { status: 400 });
    }

    let content = (body.articleText ?? "").trim();
    if (!content && body.articleUrl?.trim()) {
      content = await fetchArticleText(body.articleUrl.trim());
    }
    if (!content) {
      return NextResponse.json(
        { error: "Provide article text or a reachable URL." },
        { status: 400 },
      );
    }

    const model = body.claudeModel?.trim() || "claude-opus-4-7";
    const shotCount = typeof body.shotCount === "number" ? Math.max(1, body.shotCount) : 1;
    const shotDuration = typeof body.shotDuration === "number" ? Math.max(1, body.shotDuration) : 10;
    const client = new Anthropic({ apiKey: body.claudeApiKey.trim() });

    const message = await client.messages.create({
      model,
      max_tokens: 2048,
      system: body.systemPrompt.trim(),
      messages: [
        { role: "user", content: buildUserMessage(content, shotCount, shotDuration, body.outputLanguage, body.customOutputLanguage) },
      ],
    });

    const block = message.content[0];
    const raw = block.type === "text" ? block.text.trim() : "";
    if (!raw) {
      return NextResponse.json({ error: "Claude returned an empty response." }, { status: 500 });
    }

    let shots: string[] = [];
    let anchorScript = "";
    try {
      // Strip markdown code fences if Claude wrapped the JSON anyway.
      const jsonText = raw.replace(/^```(?:json)?\n?/i, "").replace(/\n?```$/, "").trim();
      const parsed = JSON.parse(jsonText) as { shots?: unknown; anchorScript?: unknown };
      shots = Array.isArray(parsed.shots) ? parsed.shots.map(String) : [];
      anchorScript = typeof parsed.anchorScript === "string" ? parsed.anchorScript : "";
    } catch {
      // Fallback: treat the whole response as a single visual prompt.
      shots = [raw];
    }

    const prompt = shots.join("\n\n");

    // Write debug snapshot (only in non-production; never logs the API key).
    if (process.env.NODE_ENV !== "production") {
      const debugDir = join(process.cwd(), "debug");
      await mkdir(debugDir, { recursive: true });
      await writeFile(
        join(debugDir, "article-to-prompt-latest.json"),
        JSON.stringify(
          {
            timestamp: new Date().toISOString(),
            request: {
              model,
              shotCount,
              shotDuration,
              systemPrompt: body.systemPrompt,
              articleUrl: body.articleUrl ?? null,
              articleTextLength: content.length,
            },
            rawResponse: raw,
            parsed: { shots, anchorScript },
            output: { prompt, narration: anchorScript },
          },
          null,
          2,
        ),
      );
    }

    return NextResponse.json({ prompt, narration: anchorScript });
  } catch (err) {
    logRouteError("article-to-prompt", err, startedAt);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
