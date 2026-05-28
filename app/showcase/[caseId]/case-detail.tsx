"use client";

/**
 * Case detail page — `/showcase/[caseId]`.
 *
 * Long-form unfold of one case: full hero, multi-paragraph brief,
 * numbered workflow, gallery of every asset, engines used, receipt
 * block, and a "Clone the workflow" CTA that drops the reader into
 * /reels filtered to the case's templates.
 *
 * Pure presentation — all data comes from `lib/showcase/cases.ts`.
 */

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SHOWCASE_CASES, type ShowcaseCase } from "@/lib/showcase/cases";

export function CaseDetail({ caseData }: { caseData: ShowcaseCase }) {
  // Gallery = hero + supports, deduped by src so the hero doesn't
  // appear twice when authors include it in the supports list.
  const galleryItems = [
    { src: caseData.hero, kind: caseData.heroKind },
    ...(caseData.supports ?? []),
  ];
  const browseHref = `/reels?industry=${caseData.industry}`;

  // Prev / next case for the bottom nav — wraps around so the user can
  // demo through every case without bouncing back to /showcase.
  const idx = SHOWCASE_CASES.findIndex((c) => c.id === caseData.id);
  const prev =
    SHOWCASE_CASES[(idx - 1 + SHOWCASE_CASES.length) % SHOWCASE_CASES.length];
  const next = SHOWCASE_CASES[(idx + 1) % SHOWCASE_CASES.length];

  return (
    <article className="flex flex-col gap-12">
      {/* ── Breadcrumb ─────────────────────────────────────────────── */}
      <nav className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-dim">
        <Link href="/showcase" className="hover:text-ink">
          ← Showcase
        </Link>
        <span>/</span>
        <span>{caseData.industry}</span>
      </nav>

      {/* ── Hero ───────────────────────────────────────────────────── */}
      <section className="flex flex-col gap-6">
        <header className="flex flex-col gap-3">
          <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-dim">
            {caseData.client}
          </span>
          <h1
            className="font-serif text-ink"
            style={{
              fontSize: "clamp(36px, 5vw, 64px)",
              letterSpacing: "-0.02em",
              lineHeight: 1.05,
            }}
          >
            {caseData.title}
          </h1>
        </header>

        <div className="overflow-hidden rounded-[16px] border border-border bg-black">
          <HeroAsset src={caseData.hero} kind={caseData.heroKind} />
        </div>
      </section>

      {/* ── Brief + receipt sidebar ────────────────────────────────── */}
      <section className="grid gap-8 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-4">
          <span className="plate inline-flex self-start">§ Brief</span>
          {caseData.briefLong.split("\n\n").map((para, i) => (
            <p
              key={i}
              className="text-[15px] leading-[1.7] text-ink-dim"
            >
              {para}
            </p>
          ))}
        </div>

        <aside className="flex flex-col gap-4">
          <div className="rounded-[14px] border border-border bg-panel/40 p-5">
            <span className="block font-mono text-[10px] uppercase tracking-[0.16em] text-ink-dim">
              Receipt
            </span>
            <p className="mt-2 text-[14px] leading-relaxed text-ink">
              {caseData.receipt}
            </p>
          </div>
          <div className="rounded-[14px] border border-border bg-panel/40 p-5">
            <span className="block font-mono text-[10px] uppercase tracking-[0.16em] text-ink-dim">
              Engines used
            </span>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {caseData.engines.map((e) => (
                <li
                  key={e}
                  className="inline-flex h-6 items-center rounded-full border border-border px-2 font-mono text-[10px] uppercase tracking-[0.10em] text-ink"
                >
                  {e}
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </section>

      {/* ── Workflow ───────────────────────────────────────────────── */}
      <section className="flex flex-col gap-5">
        <span className="plate inline-flex self-start">§ Workflow</span>
        <ol className="grid gap-3">
          {caseData.workflow.map((step, i) => (
            <li
              key={i}
              className="flex gap-4 rounded-[12px] border border-border bg-panel/30 p-4"
            >
              <span className="font-mono text-[16px] tabular-nums text-ink-dim">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="flex flex-col gap-1">
                <span className="text-[14px] text-ink">{step.action}</span>
                {step.detail && (
                  <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-dim">
                    {step.detail}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* ── Gallery ────────────────────────────────────────────────── */}
      <section className="flex flex-col gap-5">
        <span className="plate inline-flex self-start">§ Gallery</span>
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          {galleryItems.map((item, i) => (
            <li
              key={`${item.src}-${i}`}
              className="relative aspect-square overflow-hidden rounded-[10px] border border-border bg-black"
            >
              {item.kind === "video" ? (
                <video
                  src={item.src}
                  muted
                  loop
                  playsInline
                  preload="metadata"
                  className="absolute inset-0 h-full w-full object-cover"
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.src}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover"
                  loading="lazy"
                />
              )}
            </li>
          ))}
        </ul>
      </section>

      {/* ── CTA ────────────────────────────────────────────────────── */}
      <section className="flex flex-col items-center gap-4 rounded-[16px] border border-border bg-panel/40 p-8 text-center md:p-12">
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-dim">
          Clone this workflow
        </span>
        <h2
          className="font-serif text-ink"
          style={{
            fontSize: "clamp(22px, 2.4vw, 30px)",
            letterSpacing: "-0.01em",
          }}
        >
          Start from the same templates.
        </h2>
        <p className="max-w-[480px] text-[13px] text-ink-dim">
          Templates feed prompts, ratios, and engine choices straight into
          Generator. Pick any one to start from this case&rsquo;s exact
          starting point.
        </p>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
          <Button asChild variant="primary">
            <Link href={browseHref}>
              Browse {caseData.industry} templates →
            </Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/showcase">All cases</Link>
          </Button>
        </div>
      </section>

      {/* ── Prev / Next ──────────────────────────────────────────────
          Wraps around the full case list so a demo session never
          dead-ends; the reader can keep tabbing through. */}
      <nav className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <NeighbourLink direction="prev" target={prev} />
        <NeighbourLink direction="next" target={next} />
      </nav>
    </article>
  );
}

function NeighbourLink({
  direction,
  target,
}: {
  direction: "prev" | "next";
  target: ShowcaseCase;
}) {
  const isNext = direction === "next";
  return (
    <Link
      href={`/showcase/${target.id}`}
      className={`group flex items-center gap-4 rounded-[12px] border border-border bg-panel/30 p-4 transition-colors hover:border-ink-dim ${
        isNext ? "md:flex-row-reverse md:text-right" : ""
      }`}
    >
      <span className="font-mono text-[18px] text-ink-dim transition-colors group-hover:text-ink">
        {isNext ? "→" : "←"}
      </span>
      <div className={`flex flex-1 flex-col gap-1 ${isNext ? "md:items-end" : ""}`}>
        <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-ink-dim">
          {isNext ? "Next case" : "Previous case"}
        </span>
        <span className="font-serif text-[14px] leading-snug text-ink">
          {target.title}
        </span>
        <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-ink-dim">
          {target.client}
        </span>
      </div>
    </Link>
  );
}

// ─────────────────────────── Sub-bits ────────────────────────────────

function HeroAsset({
  src,
  kind,
}: {
  src: string;
  kind: "image" | "video";
}) {
  if (kind === "video") {
    return (
      <video
        src={src}
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        className="block w-full"
      />
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" className="block w-full" />;
}
