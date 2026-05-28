"use client";

/**
 * Showcase — case studies rendered from `lib/showcase/cases.ts`.
 *
 * Hero strip + per-industry filter chip rail + case grid. Each card
 * lays out one hero asset (image or video, with controls suppressed for
 * grid texture) plus a strip of supports. Click "Browse the workflow"
 * filters the templates page to the case's `templateIds` so the reader
 * can clone the exact starting point.
 *
 * Authoring stays in the data file — this shell is presentation only.
 */

import Link from "next/link";
import { useMemo, useState } from "react";
import { Chip } from "@/components/ui/chip";
import { SHOWCASE_CASES, type ShowcaseCase } from "@/lib/showcase/cases";
import type { Industry } from "@/lib/reels/templates";

const INDUSTRIES: { id: Industry | "all"; label: string }[] = [
  { id: "all",         label: "All industries" },
  { id: "ecommerce",   label: "E-commerce" },
  { id: "advertising", label: "Advertising" },
  { id: "film-tv",     label: "Film & TV" },
  { id: "social",      label: "Social" },
  { id: "editorial",   label: "Editorial" },
  { id: "arch-viz",    label: "Arch-viz" },
  { id: "game-ip",     label: "Game / IP" },
];

export function ShowcaseShell() {
  const [filter, setFilter] = useState<Industry | "all">("all");
  const cases = useMemo(
    () =>
      filter === "all"
        ? SHOWCASE_CASES
        : SHOWCASE_CASES.filter((c) => c.industry === filter),
    [filter],
  );

  // Tally a few aggregate metrics for the hero stat strip — gives the
  // page real numbers to anchor the "production-ready" claim instead of
  // landing on adjectives alone.
  const totalDeliverables = SHOWCASE_CASES.reduce(
    (acc, c) => acc + 1 + (c.supports?.length ?? 0),
    0,
  );
  const industriesCovered = new Set(SHOWCASE_CASES.map((c) => c.industry))
    .size;

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-4">
        <span className="plate inline-flex self-start">
          § SHOWCASE · CASE STUDIES
        </span>
        <h1
          className="font-serif text-ink"
          style={{
            fontSize: "clamp(40px, 6vw, 80px)",
            letterSpacing: "-0.02em",
            lineHeight: 1.04,
          }}
        >
          The receipts, by <em>industry.</em>
        </h1>
        <div className="grid gap-6 md:grid-cols-[1fr_auto] md:items-end">
          <p className="max-w-[680px] text-[15px] leading-relaxed text-ink-dim">
            Real briefs from real shops. Every case lays out the goal, the
            workflow, the engine choices, and a one-line receipt — what
            shipped, in how long, for what it would have cost the old way.
            Click in to read the full unfold; clone the templates to start
            from the same canvas.
          </p>
          <Link
            href="/reels"
            className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-dim hover:text-ink"
          >
            Browse the template library →
          </Link>
        </div>
      </header>

      {/* Stat strip — three numbers that frame what's on the page. The
          mono+uppercase styling matches the project's chrome rails so it
          reads as part of the surface, not an ad-hoc badge. */}
      <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-[14px] border border-border bg-border">
        <Stat
          number={SHOWCASE_CASES.length}
          label="Production cases"
          hint="Each with brief, workflow, receipt"
        />
        <Stat
          number={industriesCovered}
          label="Industries covered"
          hint="From e-commerce to game IP"
        />
        <Stat
          number={totalDeliverables}
          label="Assets delivered"
          hint="Stills + clips across all cases"
        />
      </dl>

      {/* Industry filter */}
      <div className="flex flex-wrap items-center gap-2">
        {INDUSTRIES.map((ind) => (
          <Chip
            key={ind.id}
            active={filter === ind.id}
            onClick={() => setFilter(ind.id)}
          >
            {ind.label}
          </Chip>
        ))}
      </div>

      {/* Case grid */}
      <ul className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {cases.map((c) => (
          <li key={c.id}>
            <CaseCard caseData={c} />
          </li>
        ))}
      </ul>

      {cases.length === 0 && (
        <div className="rounded-[14px] border border-border bg-panel/30 p-12 text-center">
          <p className="text-ink-dim">
            No cases yet for this industry — drop your work in the contact
            form and we&rsquo;ll feature it here.
          </p>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────── Card ─────────────────────────────────────

/** One column of the hero stat strip. Three of these sit side-by-side
 *  separated by `bg-border` gaps that come from the parent `gap-px`. */
function Stat({
  number,
  label,
  hint,
}: {
  number: number;
  label: string;
  hint: string;
}) {
  return (
    <div className="bg-bg-2 p-5">
      <div
        className="font-serif text-ink"
        style={{
          fontSize: "clamp(28px, 3.6vw, 44px)",
          letterSpacing: "-0.02em",
          lineHeight: 1,
        }}
      >
        {number}
      </div>
      <div className="mt-2 font-mono text-[10px] uppercase tracking-[0.16em] text-ink">
        {label}
      </div>
      <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.10em] text-ink-dim">
        {hint}
      </div>
    </div>
  );
}

function CaseCard({ caseData }: { caseData: ShowcaseCase }) {
  const detailHref = `/showcase/${caseData.id}`;
  const browseHref = `/reels?industry=${caseData.industry}`;

  return (
    <article className="group flex flex-col overflow-hidden rounded-[16px] border border-border bg-panel/40 transition-colors hover:border-ink-dim">
      {/* Hero asset — wrap in the detail link so the entire image is
          clickable, not just the title. */}
      <Link
        href={detailHref}
        className="relative block aspect-[16/10] overflow-hidden bg-black"
      >
        {caseData.heroKind === "video" ? (
          <video
            src={caseData.hero}
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={caseData.hero}
            alt={caseData.title}
            className="absolute inset-0 h-full w-full object-cover"
            loading="lazy"
          />
        )}
        {/* Industry tag, top-left */}
        <span className="absolute left-3 top-3 inline-flex h-6 items-center rounded-full bg-bg/85 px-2 font-mono text-[9px] uppercase tracking-[0.16em] text-ink-dim backdrop-blur-sm">
          {caseData.industry}
        </span>
      </Link>

      {/* Body */}
      <div className="flex flex-1 flex-col gap-4 p-5">
        <div>
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-dim">
            {caseData.client}
          </span>
          <h3
            className="font-serif mt-1 text-ink"
            style={{
              fontSize: "clamp(20px, 1.8vw, 24px)",
              letterSpacing: "-0.01em",
              lineHeight: 1.2,
            }}
          >
            <Link href={detailHref} className="hover:text-accent">
              {caseData.title}
            </Link>
          </h3>
        </div>

        <p className="text-[13px] leading-relaxed text-ink-dim">
          {caseData.brief}
        </p>

        {/* Receipt — the proof line */}
        <div className="rounded-[10px] border border-border bg-bg-2 p-3">
          <span className="block font-mono text-[9px] uppercase tracking-[0.16em] text-ink-dim">
            Receipt
          </span>
          <p className="mt-1.5 text-[12px] leading-relaxed text-ink">
            {caseData.receipt}
          </p>
        </div>

        {/* Supports strip */}
        {caseData.supports && caseData.supports.length > 0 && (
          <ul className="grid grid-cols-3 gap-1.5">
            {caseData.supports.slice(0, 3).map((s) => (
              <li
                key={s.src}
                className="relative aspect-square overflow-hidden rounded-[8px] border border-border bg-black"
              >
                {s.kind === "video" ? (
                  <video
                    src={s.src}
                    muted
                    loop
                    playsInline
                    preload="metadata"
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={s.src}
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover"
                    loading="lazy"
                  />
                )}
              </li>
            ))}
          </ul>
        )}

        {/* Engines + dual CTA */}
        <div className="mt-auto flex flex-col gap-2 pt-2">
          <ul className="flex flex-wrap gap-1.5">
            {caseData.engines.map((e) => (
              <li
                key={e}
                className="inline-flex h-6 items-center rounded-full border border-border px-2 font-mono text-[9px] uppercase tracking-[0.12em] text-ink-dim"
              >
                {e}
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between gap-3">
            <Link
              href={detailHref}
              className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.12em] text-ink hover:text-accent"
            >
              Read the case study →
            </Link>
            <Link
              href={browseHref}
              className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-dim hover:text-ink"
            >
              Templates
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}
