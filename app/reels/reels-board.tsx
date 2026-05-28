"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Chip } from "@/components/ui/chip";
import { MediaTile } from "@/components/ui/media-tile";
import { CornerTicks } from "@/components/ui/placeholder-tile";
import { cn } from "@/lib/utils";
import {
  INDUSTRIES,
  INDUSTRY_HERO,
  MODELS,
  MODEL_LABELS,
  SUB_CATEGORIES,
  TEMPLATES,
  compareTemplates,
  getFeaturedFor,
  type Industry,
  type ModelId,
  type ReelTemplate,
  type SubCategory,
} from "@/lib/reels/templates";

type IndustryFilter = "all" | Industry;
type ModelFilter = "all" | ModelId;
type SubCatFilter = "all" | SubCategory;

export function ReelsBoard() {
  const [industry, setIndustry] = useState<IndustryFilter>("all");
  const [model, setModel] = useState<ModelFilter>("all");
  const [subCat, setSubCat] = useState<SubCatFilter>("all");

  // Reset sub-category whenever industry changes — sub-cats are scoped per industry.
  useEffect(() => {
    setSubCat("all");
  }, [industry]);

  const visible = useMemo(() => {
    return TEMPLATES.filter(
      (t) =>
        (industry === "all" || t.industry === industry) &&
        (model === "all" || t.model === model) &&
        (subCat === "all" || t.subCategory === subCat),
    ).sort(compareTemplates);
  }, [industry, model, subCat]);

  // Split into Video / Image so the user sees a third tier of structure
  // under industry → sub-category. Each group is hidden when empty so a
  // model-pinned filter (which is single-kind by definition) still reads
  // clean.
  const grouped = useMemo(
    () => ({
      video: visible.filter((t) => t.kind === "video"),
      image: visible.filter((t) => t.kind === "image"),
    }),
    [visible],
  );

  const liveCount = TEMPLATES.filter((t) => t.src).length;

  return (
    <>
      {/* §00 — HERO (default or industry-scoped) */}
      {industry === "all" ? (
        <DefaultHero liveCount={liveCount} />
      ) : (
        <IndustryHero industry={industry} onClear={() => setIndustry("all")} />
      )}

      {/* §01 — CAPABILITY CARDS */}
      <section
        id="capabilities"
        className="mx-auto w-full max-w-[1440px] px-7 pb-12"
      >
        <SectionLabel index="01" title="Engines" right="3 in service" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {MODELS.map((m) => {
            const matchCount = TEMPLATES.filter((t) => t.model === m.id).length;
            const active = model === m.id;
            return (
              <article
                key={m.id}
                className={cn(
                  "group relative overflow-hidden rounded-[14px] border bg-panel transition-all",
                  active
                    ? "border-accent"
                    : "border-border hover:border-[var(--line-strong)]",
                )}
              >
                {m.sample ? (
                  <MediaTile
                    src={m.sample.src}
                    kind={m.sample.kind}
                    alt={`${m.label} sample`}
                    ratio="16/9"
                    className="rounded-none border-0 border-b border-border"
                  />
                ) : (
                  <div
                    className="relative aspect-[16/9] overflow-hidden border-b border-border"
                    style={{
                      background:
                        m.family === "seedream-5-lite"
                          ? "linear-gradient(135deg, #2b1108 0%, #0a0507 100%)"
                          : "linear-gradient(135deg, #150a1f 0%, #060309 100%)",
                    }}
                  >
                    <div
                      className="absolute inset-0 pointer-events-none"
                      style={{
                        backgroundImage:
                          "repeating-linear-gradient(90deg, rgba(242,240,232,0.04) 0 1px, transparent 1px 80px), repeating-linear-gradient(0deg, rgba(242,240,232,0.04) 0 1px, transparent 1px 80px)",
                      }}
                    />
                    <CornerTicks />
                    <div
                      className="absolute inset-0 grid place-items-center font-serif italic text-ink-dim/40"
                      style={{ fontSize: 88, letterSpacing: "-0.02em" }}
                    >
                      {m.short.split(" ").pop()}
                    </div>
                  </div>
                )}

                <div className="p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-dim">
                      {m.kind === "video" ? "Video engine" : "Image engine"}
                    </span>
                    <span className="font-mono text-[10px] tracking-[0.10em] text-ink-dim">
                      {matchCount} shot{matchCount === 1 ? "" : "s"}
                    </span>
                  </div>
                  <h3
                    className="mt-2 font-serif text-ink"
                    style={{
                      fontSize: 28,
                      lineHeight: 1.05,
                      letterSpacing: "-0.01em",
                    }}
                  >
                    {m.tagline}
                  </h3>
                  <p className="mt-2 text-[12.5px] leading-[1.55] text-ink-dim">
                    {m.blurb}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {m.capabilities.map((c) => (
                      <span
                        key={c}
                        className="inline-flex items-center rounded-full border border-border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.10em] text-ink-dim"
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setModel(active ? "all" : m.id);
                      document.getElementById("grid")?.scrollIntoView({
                        behavior: "smooth",
                        block: "start",
                      });
                    }}
                    className={cn(
                      "mt-4 inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.14em] transition-colors cursor-pointer",
                      active ? "text-accent" : "text-ink hover:text-accent",
                    )}
                  >
                    {active ? "Showing all this engine" : `View shots`}
                    <span className="font-serif italic text-[14px]">→</span>
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* §02 — INDUSTRY FILTER (sticky under header) */}
      <div
        className="sticky top-[57px] z-30 border-y border-border backdrop-blur-[14px]"
        style={{ background: "rgba(5,5,10,0.72)" }}
      >
        <div className="mx-auto w-full max-w-[1440px] px-7 py-3 flex items-center gap-3 overflow-x-auto">
          <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-dim">
            Industry ·
          </span>
          <Chip
            active={industry === "all"}
            onClick={() => setIndustry("all")}
          >
            All
          </Chip>
          {INDUSTRIES.map((i) => {
            const count = TEMPLATES.filter((t) => t.industry === i.id).length;
            return (
              <Chip
                key={i.id}
                active={industry === i.id}
                onClick={() => setIndustry(i.id)}
              >
                {i.label}
                <span className="ml-1.5 font-mono text-[9px] tracking-[0.08em] opacity-60">
                  {count}
                </span>
              </Chip>
            );
          })}
          {model !== "all" && (
            <>
              <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-dim ml-3">
                · Engine ·
              </span>
              <Chip active onClick={() => setModel("all")}>
                {MODEL_LABELS[model]} ✕
              </Chip>
            </>
          )}
          <span className="ml-auto shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-dim">
            {visible.length} / {TEMPLATES.length} shown
          </span>
        </div>
      </div>

      {/* §02b — SUB-CATEGORY chip row (contextual, only when an industry is active) */}
      {industry !== "all" && SUB_CATEGORIES[industry].length > 0 && (
        <div className="mx-auto w-full max-w-[1440px] px-7 pt-5">
          <div className="flex items-center gap-3 overflow-x-auto">
            <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-dim">
              {INDUSTRIES.find((i) => i.id === industry)?.label} ·
            </span>
            <Chip
              active={subCat === "all"}
              onClick={() => setSubCat("all")}
            >
              All shots
            </Chip>
            {SUB_CATEGORIES[industry].map((s) => {
              const count = TEMPLATES.filter(
                (t) => t.industry === industry && t.subCategory === s.id,
              ).length;
              const disabled = count === 0;
              return (
                <Chip
                  key={s.id}
                  active={subCat === s.id}
                  onClick={() => !disabled && setSubCat(s.id)}
                  className={cn(
                    disabled && "opacity-40 cursor-not-allowed",
                  )}
                  title={s.blurb}
                >
                  {s.label}
                  <span className="ml-1.5 font-mono text-[9px] tracking-[0.08em] opacity-60">
                    {count}
                  </span>
                </Chip>
              );
            })}
          </div>
        </div>
      )}

      {/* §03 — REEL GRID (grouped by kind) */}
      <section
        id="grid"
        className="mx-auto w-full max-w-[1440px] px-7 pt-7 pb-16 scroll-mt-32"
      >
        {visible.length === 0 ? (
          <EmptyGrid
            onReset={() => {
              setIndustry("all");
              setModel("all");
              setSubCat("all");
            }}
          />
        ) : (
          <div className="flex flex-col gap-10">
            {grouped.video.length > 0 && (
              <KindGroup kind="video" templates={grouped.video} />
            )}
            {grouped.image.length > 0 && (
              <KindGroup kind="image" templates={grouped.image} />
            )}
          </div>
        )}
      </section>

      {/* §04 — COMPARE (placeholder for v1.5) */}
      <section className="mx-auto w-full max-w-[1440px] px-7 pb-14">
        <SectionLabel index="04" title="Compare" right="Coming next" />
        <div className="rounded-[16px] border border-dashed border-border bg-panel/40 p-10 text-center">
          <p
            className="font-serif text-ink"
            style={{ fontSize: 32, lineHeight: 1.1 }}
          >
            Same brief, <span className="italic">two engines.</span>
          </p>
          <p className="mx-auto mt-3 max-w-[480px] text-[13.5px] leading-[1.55] text-ink-dim">
            Side-by-side renders of the same prompt across Seedance 1.5 vs 2.0,
            and Seedream 4.5 vs 5.0. Lands in v1.5 with three head-to-head
            briefs.
          </p>
        </div>
      </section>

      {/* §05 — SUBMIT CTA */}
      <section className="mx-auto w-full max-w-[1440px] px-7 pb-20">
        <div className="rounded-[16px] border border-border bg-bg-2 p-7 grid md:grid-cols-[1fr_auto] items-center gap-5">
          <div>
            <span className="plate inline-flex">§ contribute</span>
            <h3
              className="font-serif mt-3 text-ink"
              style={{
                fontSize: 36,
                letterSpacing: "-0.02em",
                lineHeight: 1.05,
              }}
            >
              Built a reel you&apos;re <span className="italic">proud of?</span>
            </h3>
            <p className="mt-2 max-w-[520px] text-[13.5px] leading-[1.55] text-ink-dim">
              Open a PR against{" "}
              <code className="font-mono text-[12px] text-ink">
                lib/reels/templates.ts
              </code>{" "}
              with your prompt, model, and a 720p sample. We&apos;ll cut the
              card and credit your handle.
            </p>
          </div>
          <Link
            href="https://github.com/Simon-ZSM/lumen-hub"
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-11 items-center gap-2 rounded-full border border-accent bg-accent text-[var(--bg)] px-5 text-[13px] font-medium hover:bg-accent/90 transition-colors"
          >
            Submit a reel
            <span className="font-serif italic text-[15px]">→</span>
          </Link>
        </div>
      </section>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// HEROES

function DefaultHero({ liveCount }: { liveCount: number }) {
  return (
    <section className="relative mx-auto w-full max-w-[1440px] px-7 pt-12 pb-8">
      <div className="grid grid-cols-3 gap-6 pb-9 font-mono text-[11px] uppercase tracking-[0.12em] text-ink-dim animate-rise">
        <span>Reels · Vol. 01</span>
        <span className="text-center">
          Industry templates · ready to direct
        </span>
        <span className="text-right">
          {TEMPLATES.length} shots · {liveCount} live
        </span>
      </div>

      <h1
        className="font-serif animate-rise tracking-[-0.02em]"
        style={{
          fontSize: "clamp(56px, 10vw, 160px)",
          lineHeight: 1.02,
          animationDelay: "80ms",
        }}
      >
        A library,{" "}
        <span className="italic" style={{ color: "var(--accent)" }}>
          not
        </span>
        <br />
        a generator.
      </h1>

      <div
        className="mt-9 grid grid-cols-1 md:grid-cols-[1fr_auto] items-end gap-6 pb-6 border-b border-border animate-rise"
        style={{ animationDelay: "160ms" }}
      >
        <p className="max-w-[560px] text-[14.5px] leading-[1.6] text-ink-dim">
          Curated reference shots organised by what you&apos;re shipping —
          e-commerce, advertising, film, social. Each card is a working preset:
          pick one, hit <span className="text-ink">Use template</span>, land in
          Generator with the prompt, model, ratio, and timing already filled.
        </p>
        <div className="flex flex-col items-end gap-2.5 justify-self-end">
          <div className="flex gap-2.5">
            <Link
              href="#grid"
              className="inline-flex h-10 items-center gap-2 rounded-full border border-border bg-panel px-4 text-[12px] text-ink hover:border-[var(--line-strong)] transition-colors"
            >
              Browse {liveCount} live shots ↓
            </Link>
            <Link
              href="#capabilities"
              className="inline-flex h-10 items-center gap-2 rounded-full border border-accent bg-accent-soft px-4 text-[12px] text-accent hover:bg-accent/10 transition-colors"
            >
              Compare engines →
            </Link>
          </div>
          {/* Cross-link to Showcase — Reels is the creator's starting
              point; Showcase is the audience-facing receipts surface. */}
          <Link
            href="/showcase"
            className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-dim hover:text-ink"
          >
            Looking for finished work? See Showcase →
          </Link>
        </div>
      </div>
    </section>
  );
}

function IndustryHero({
  industry,
  onClear,
}: {
  industry: Industry;
  onClear: () => void;
}) {
  const meta = INDUSTRY_HERO[industry];
  const industryMeta = INDUSTRIES.find((i) => i.id === industry);
  const featured = getFeaturedFor(industry);
  const subCount = SUB_CATEGORIES[industry].length;
  const tplCount = TEMPLATES.filter((t) => t.industry === industry).length;

  return (
    <section className="relative mx-auto w-full max-w-[1440px] px-7 pt-12 pb-8">
      <div className="grid grid-cols-3 gap-6 pb-9 font-mono text-[11px] uppercase tracking-[0.12em] text-ink-dim animate-rise">
        <button
          type="button"
          onClick={onClear}
          className="text-left text-ink-dim hover:text-ink transition-colors cursor-pointer"
        >
          ← Reels · all industries
        </button>
        <span className="text-center">
          {industryMeta?.label} · {tplCount} shot{tplCount === 1 ? "" : "s"} · {subCount}{" "}
          sub-categor{subCount === 1 ? "y" : "ies"}
        </span>
        <span className="text-right">
          Engines: {meta.recommended_engines.length} recommended
        </span>
      </div>

      <h1
        className="font-serif animate-rise tracking-[-0.02em]"
        style={{
          fontSize: "clamp(48px, 8.5vw, 132px)",
          lineHeight: 1.04,
          animationDelay: "80ms",
        }}
      >
        {meta.tagline.split(" ").map((word, i, arr) => {
          // Italicise the last word of the tagline for editorial rhythm.
          const isLast = i === arr.length - 1;
          return (
            <span key={i} className={isLast ? "italic" : undefined}>
              {word}
              {i < arr.length - 1 ? " " : ""}
            </span>
          );
        })}
      </h1>

      <div
        className="mt-9 grid grid-cols-1 md:grid-cols-[1.1fr_1fr] gap-7 pb-6 border-b border-border animate-rise"
        style={{ animationDelay: "160ms" }}
      >
        {/* Brief + priorities + recommended engines */}
        <div>
          <p className="max-w-[560px] text-[14.5px] leading-[1.6] text-ink-dim">
            {meta.brief}
          </p>
          <div className="mt-5 flex flex-wrap gap-1.5">
            {meta.directors_priorities.map((p) => (
              <span
                key={p}
                className="inline-flex items-center rounded-full border border-border bg-panel px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-ink"
              >
                {p}
              </span>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-dim">
            <span>Engines ·</span>
            {meta.recommended_engines.map((eid) => (
              <span
                key={eid}
                className="inline-flex items-center rounded-full border border-accent/30 bg-accent-soft px-2 py-0.5 text-accent"
              >
                {MODEL_LABELS[eid]}
              </span>
            ))}
          </div>
        </div>

        {/* Featured template — visual anchor */}
        <div className="md:justify-self-end w-full md:max-w-[420px]">
          {featured ? (
            <FeaturedHeroCard tpl={featured} />
          ) : (
            <FeaturedComingSoon industry={industry} />
          )}
        </div>
      </div>
    </section>
  );
}

function FeaturedHeroCard({ tpl }: { tpl: ReelTemplate }) {
  const isPlaceholder = !tpl.src;
  return (
    <article className="group relative overflow-hidden rounded-[14px] border border-accent/40 bg-bg-2 transition-all hover:border-accent">
      <div className="absolute left-3 top-3 z-20 inline-flex items-center gap-1.5 rounded-full bg-accent/90 px-2.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--bg)]">
        <span className="size-1 rounded-full bg-[var(--bg)]" />
        Featured
      </div>
      <div className="relative">
        {tpl.src ? (
          <MediaTile
            src={tpl.src}
            kind={tpl.kind}
            ratio={tpl.ratio}
            label=""
            meta=""
          />
        ) : (
          <PlaceholderShot ratio={tpl.ratio} title={tpl.title} />
        )}
        {tpl.src && (
          <Link
            href={`/generate?preset=${tpl.id}`}
            className="absolute inset-0 z-10 flex items-end justify-center pb-5 opacity-0 transition-opacity group-hover:opacity-100"
            style={{
              background:
                "linear-gradient(180deg, transparent 50%, rgba(0,0,0,0.65) 100%)",
            }}
          >
            <span className="inline-flex h-9 items-center gap-2 rounded-full border border-accent bg-accent text-[var(--bg)] px-4 font-mono text-[11px] uppercase tracking-[0.14em]">
              Use template
              <span className="font-serif italic text-[14px]">→</span>
            </span>
          </Link>
        )}
      </div>
      <div className="p-4">
        <h3
          className="font-serif text-ink"
          style={{ fontSize: 22, lineHeight: 1.15, letterSpacing: "-0.01em" }}
        >
          {tpl.title}
        </h3>
        <p className="mt-1.5 text-[12.5px] leading-[1.55] text-ink-dim">
          {tpl.brief_note ?? tpl.director_note}
        </p>
      </div>
    </article>
  );
}

function FeaturedComingSoon({ industry }: { industry: Industry }) {
  return (
    <div className="rounded-[14px] border border-dashed border-border bg-panel/40 px-5 py-10 text-center">
      <div className="font-serif italic text-ink-dim/60" style={{ fontSize: 36 }}>
        {INDUSTRIES.find((i) => i.id === industry)?.label}
      </div>
      <div className="mt-3 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-dim">
        Featured shot · coming next
      </div>
      <p className="mt-4 mx-auto max-w-[280px] text-[12.5px] leading-[1.55] text-ink-dim">
        This vertical is on the v2 roadmap. Open a PR or pick another industry
        from the sticky bar above.
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SHARED

function SectionLabel({
  index,
  title,
  right,
}: {
  index: string;
  title: string;
  right?: string;
}) {
  return (
    <div className="mb-5 flex items-baseline justify-between gap-4">
      <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-dim">
        § {index} {title}
      </div>
      {right && (
        <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-dim">
          {right}
        </div>
      )}
    </div>
  );
}

function KindGroup({
  kind,
  templates,
}: {
  kind: "video" | "image";
  templates: ReelTemplate[];
}) {
  const label = kind === "video" ? "Video" : "Image";
  // Subhead mirrors §01's SectionLabel rhythm so the third tier reads
  // as a sibling of the higher-level section bands rather than novel chrome.
  return (
    <div>
      <div className="mb-4 flex items-baseline justify-between gap-4 border-b border-border pb-2.5">
        <div className="flex items-baseline gap-3 font-mono text-[11px] uppercase tracking-[0.16em] text-ink">
          <span className="text-ink-dim">·</span>
          {label}
          <span className="text-ink-dim">
            {templates.length} shot{templates.length === 1 ? "" : "s"}
          </span>
        </div>
        <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-dim">
          {kind === "video" ? "Seedance" : "Seedream"}
        </div>
      </div>
      <div className="grid grid-cols-12 gap-3.5 grid-flow-dense">
        {templates.map((t) => (
          <div
            key={t.id}
            className={cn(
              "col-span-12",
              t.span === 4 && "md:col-span-4",
              t.span === 5 && "md:col-span-5",
              t.span === 6 && "md:col-span-6",
              t.span === 7 && "md:col-span-7",
              t.span === 8 && "md:col-span-8",
              t.span === 12 && "md:col-span-12",
              !t.span && "md:col-span-4",
            )}
          >
            <TemplateCard tpl={t} />
          </div>
        ))}
      </div>
    </div>
  );
}

function TemplateCard({ tpl }: { tpl: ReelTemplate }) {
  const industryLabel = INDUSTRIES.find((i) => i.id === tpl.industry)?.label;

  return (
    <article
      className={cn(
        "group relative overflow-hidden rounded-[14px] border bg-bg-2 transition-all",
        tpl.featured
          ? "border-accent/40 hover:border-accent"
          : "border-border hover:border-[var(--line-strong)]",
      )}
    >
      {tpl.featured && (
        <div className="absolute left-3 top-3 z-20 inline-flex items-center gap-1.5 rounded-full bg-accent/90 px-2.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--bg)]">
          Featured
        </div>
      )}

      <div className="relative">
        {tpl.src ? (
          <MediaTile
            src={tpl.src}
            kind={tpl.kind}
            ratio={tpl.ratio}
            label=""
            meta=""
          />
        ) : (
          <PlaceholderShot ratio={tpl.ratio} title={tpl.title} />
        )}

        {/* Hover CTA */}
        {tpl.src && (
          <Link
            href={`/generate?preset=${tpl.id}`}
            className="absolute inset-0 z-10 flex items-end justify-center pb-5 opacity-0 transition-opacity group-hover:opacity-100"
            style={{
              background:
                "linear-gradient(180deg, transparent 50%, rgba(0,0,0,0.65) 100%)",
            }}
          >
            <span className="inline-flex h-9 items-center gap-2 rounded-full border border-accent bg-accent text-[var(--bg)] px-4 font-mono text-[11px] uppercase tracking-[0.14em]">
              Use template
              <span className="font-serif italic text-[14px]">→</span>
            </span>
          </Link>
        )}
      </div>

      <div className="p-3.5">
        <div className="flex items-center justify-between gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-dim">
          <span>
            {industryLabel} · {MODEL_LABELS[tpl.model]}
          </span>
          <span>
            {tpl.kind === "video" ? "video" : "still"} ·{" "}
            {tpl.ratio.replace("/", ":")}
          </span>
        </div>
        <h3
          className="mt-2 font-serif text-ink"
          style={{ fontSize: 22, lineHeight: 1.15, letterSpacing: "-0.01em" }}
        >
          {tpl.title}
        </h3>
        <p className="mt-1.5 text-[12.5px] leading-[1.55] text-ink-dim">
          {tpl.director_note}
        </p>

        {tpl.capabilities.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {tpl.capabilities.map((c) => (
              <span
                key={c}
                className="inline-flex items-center rounded-full border border-border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-ink-dim"
              >
                {c.replace("-", " ")}
              </span>
            ))}
          </div>
        )}

        {!tpl.src && (
          <span className="mt-3 inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-dim">
            <span className="size-1.5 rounded-full bg-[var(--line-strong)]" />
            {tpl.status === "stub" ? "Render queued" : "Coming soon"}
          </span>
        )}
      </div>
    </article>
  );
}

function PlaceholderShot({ ratio, title }: { ratio: string; title: string }) {
  return (
    <div
      className="relative w-full overflow-hidden rounded-[12px] border border-border bg-[var(--bg-2)]"
      style={{ aspectRatio: ratio }}
    >
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(135deg, oklch(0.18 0.06 35) 0%, oklch(0.12 0.04 280) 100%)",
        }}
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "repeating-linear-gradient(90deg, rgba(242,240,232,0.05) 0 1px, transparent 1px 64px), repeating-linear-gradient(0deg, rgba(242,240,232,0.05) 0 1px, transparent 1px 64px)",
        }}
      />
      <div className="absolute inset-0 grid place-items-center text-center px-4">
        <div>
          <div
            className="font-serif italic text-ink-dim/60"
            style={{ fontSize: 56, lineHeight: 1, letterSpacing: "-0.02em" }}
          >
            {title.split(" ")[0]}
          </div>
          <div className="mt-2 font-mono text-[9px] uppercase tracking-[0.16em] text-ink-dim">
            sample pending
          </div>
        </div>
      </div>
      <CornerTicks />
    </div>
  );
}

function EmptyGrid({ onReset }: { onReset: () => void }) {
  return (
    <div className="rounded-[16px] border border-dashed border-border bg-panel/40 px-6 py-20 text-center">
      <p
        className="font-serif text-ink"
        style={{ fontSize: 30, lineHeight: 1.1 }}
      >
        Nothing matches <span className="italic">that combination</span> yet.
      </p>
      <p className="mt-2 text-[13px] text-ink-dim">
        Try widening the filter — or submit the reel that&apos;s missing.
      </p>
      <button
        type="button"
        onClick={onReset}
        className="mt-5 inline-flex h-9 items-center gap-2 rounded-full border border-border bg-panel px-4 font-mono text-[11px] uppercase tracking-[0.14em] text-ink hover:border-ink transition-colors cursor-pointer"
      >
        Reset filters
      </button>
    </div>
  );
}
