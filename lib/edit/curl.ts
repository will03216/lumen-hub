/**
 * Rendering a request as a runnable cURL command.
 *
 * Why this exists: when a render surprises someone mid-demo, the first
 * question is always "what did it actually send?" — and the honest answer has
 * to include the model id after alias resolution, the defaults nobody set by
 * hand (response_format, watermark), and which images went as URLs versus
 * inlined bytes. Showing the compiled prompt answers a third of that.
 *
 * TWO RULES.
 *
 * 1. NEVER THE KEY. The Authorization header is emitted as a shell variable
 *    reference, so the command is safe to paste into a ticket, a Slack thread
 *    or a customer's terminal, and still runs after `export
 *    BYTEPLUS_API_KEY=...`. That header is deliberately double-quoted while
 *    everything else is single-quoted — inside single quotes the shell would
 *    not expand it, and a command that posts the literal text
 *    `$BYTEPLUS_API_KEY` fails with a 401 that looks like a bad key.
 *
 * 2. NO MEGABYTES. An inlined reference is several MB of base64; printing it
 *    produces something no one can read, scroll past, or paste anywhere. The
 *    bytes are replaced by a description of what was inlined and where it came
 *    from. The command is then illustrative rather than runnable for those
 *    references — which is the right trade, and it says so on the line itself
 *    rather than leaving someone to discover it.
 */

/** What a reference will look like on the wire, without the bytes. */
export type WireImageDescriptor =
  | { kind: "url"; url: string }
  | { kind: "inlined"; from: string; mime: string; annotated: boolean };

/**
 * The value that stands in for a reference in the printed body.
 *
 * A remote URL is exactly what we send, so it prints verbatim and the command
 * really does run. Anything inlined prints as a description — including
 * whether markup was burned into it, because "the image we sent is not the
 * image on disk" is the single most confusing thing about the raster path.
 */
export function describeWireImage(d: WireImageDescriptor): string {
  if (d.kind === "url") return d.url;
  const what = d.annotated
    ? "annotated copy, markup burned in"
    : "inlined verbatim";
  return `data:${d.mime};base64,<${what} — from ${d.from}, bytes omitted>`;
}

export type CurlInput = {
  url: string;
  /** Header name → value. Values are printed literally. */
  headers?: Record<string, string>;
  /** Header name → shell expression, emitted unquoted-for-expansion. */
  envHeaders?: Record<string, string>;
  body: unknown;
};

/**
 * A multi-line, copy-pasteable POST.
 *
 * Pretty-printed rather than minified: this is read by a human first and run
 * second. `-sS` keeps it quiet but still prints errors, which is what you
 * want when someone runs it to reproduce a failure.
 */
export function toCurl(input: CurlInput): string {
  const json = JSON.stringify(input.body, null, 2);
  const lines = [`curl -sS -X POST '${sq(input.url)}' \\`];

  for (const [name, value] of Object.entries(input.headers ?? {})) {
    lines.push(`  -H '${sq(`${name}: ${value}`)}' \\`);
  }
  // Double-quoted so the shell expands the variable. See rule 1.
  for (const [name, expr] of Object.entries(input.envHeaders ?? {})) {
    lines.push(`  -H "${name}: ${expr}" \\`);
  }

  lines.push(`  -d '${sq(json)}'`);
  return lines.join("\n");
}

/**
 * Escape for a single-quoted shell string.
 *
 * There is exactly one character that matters and one way to handle it: end
 * the quoted run, emit an escaped quote, start a new run. Prompts contain
 * apostrophes constantly ("the bottle's cap"), so without this the command is
 * broken for a large share of real edits — and broken in the worst way, by
 * silently truncating the JSON at the apostrophe.
 */
function sq(s: string): string {
  return s.replace(/'/g, `'\\''`);
}
