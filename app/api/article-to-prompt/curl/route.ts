import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 5;

type CurlBody = {
  articleText?: string;
  articleUrl?: string;
  claudeModel?: string;
  systemPrompt?: string;
  shotCount?: number;
  shotDuration?: number;
};

function buildUserMessage(content: string, shotCount: number, shotDuration: number): string {
  const base =
    `Here is the article content:\n\n${content}\n\n` +
    `Focus only on the main article text. Ignore ads, video embeds, YouTube links, related articles, author bios, comments, and navigation text.\n\n`;
  if (shotCount <= 1) {
    return `${base}Generate a visual prompt based on the most compelling aspect of this content.`;
  }
  const totalSeconds = shotCount * shotDuration;
  return (
    `${base}Generate exactly ${shotCount} shot prompts for a ${totalSeconds}-second video ` +
    `(${shotCount} shots × ${shotDuration}s each). ` +
    `Number them 1–${shotCount}, one per line. Each prompt should describe a single ${shotDuration}-second clip.`
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as CurlBody;

    const model = body.claudeModel?.trim() || "claude-opus-4-7";
    const systemPrompt = body.systemPrompt?.trim() || "";
    const content = body.articleText?.trim() || "";
    const articleUrl = body.articleUrl?.trim() || "";
    const shotCount = typeof body.shotCount === "number" ? Math.max(1, body.shotCount) : 1;
    const shotDuration = typeof body.shotDuration === "number" ? Math.max(1, body.shotDuration) : 10;

    const rawContent = articleUrl && !content ? `[fetched from ${articleUrl}]` : content;
    const userMessage = buildUserMessage(rawContent, shotCount, shotDuration);

    const payload = {
      model,
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    };

    const json = JSON.stringify(payload, null, 2);

    const curl = [
      `curl https://api.anthropic.com/v1/messages \\`,
      `  -H "x-api-key: $CLAUDE_API_KEY" \\`,
      `  -H "anthropic-version: 2023-06-01" \\`,
      `  -H "content-type: application/json" \\`,
      `  -d '${json.replace(/'/g, `'\\''`)}'`,
    ].join("\n");

    return NextResponse.json({ curl });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
