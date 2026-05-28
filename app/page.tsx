import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { PlaceholderTile } from "@/components/ui/placeholder-tile";
import { MediaTile } from "@/components/ui/media-tile";
import { Ticker } from "@/components/ui/ticker";

const SHOT_LIST: ReadonlyArray<{
  label: string;
  meta: string;
  src: string;
  kind: "image" | "video";
}> = [
  {
    label: "HUMMINGBIRD",
    meta: "MACRO · 5.0",
    src: "/reels/arch-viz/arch-detail-material-macro.jpg",
    kind: "image",
  },
  {
    label: "TOKYO TUNNEL",
    meta: "i2v · 720P",
    src: "/landing/fig-03-neon.mp4",
    kind: "video",
  },
  {
    label: "RED DRESS CLIFF",
    meta: "t2v · 21:9",
    src: "/reels/editorial/editorial-runway-paris-side-track.mp4",
    kind: "video",
  },
  {
    label: "BRUTALIST INTERIOR",
    meta: "STILL · 4K",
    src: "/reels/arch-viz/arch-staged-furnished-empty-1.jpg",
    kind: "image",
  },
  {
    label: "ICE SHARD MACRO",
    meta: "STILL · 1080",
    src: "/reels/editorial/editorial-flat-lay-autumn.jpg",
    kind: "image",
  },
  {
    label: "PARADE, NIGHT",
    meta: "t2v · 10s",
    src: "/reels/advertising/ad-social-cut-vertical-flash.mp4",
    kind: "video",
  },
];

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        {/* HERO */}
        <section className="relative mx-auto w-full max-w-[1440px] px-7 pt-12 pb-10">
          {/* §01 — Top meta rail */}
          <div className="grid grid-cols-3 gap-6 pb-9 font-mono text-[11px] uppercase tracking-[0.12em] text-ink-dim animate-rise">
            <span>Vol. 04 · 2026</span>
            <span className="text-center">A Studio for Synthetic Cinema</span>
            <span className="text-right">SEEDREAM × SEEDANCE</span>
          </div>

          {/* §02 — Mega headline */}
          <h1
            className="font-serif text-center animate-rise tracking-[-0.02em]"
            style={{
              fontSize: "clamp(64px, 13vw, 220px)",
              lineHeight: 1.02,
              animationDelay: "80ms",
            }}
          >
            Direct <span style={{ color: "var(--accent)" }}>light</span>
            <br />
            into <span className="italic">motion.</span>
          </h1>

          {/* §03 — CTA row */}
          <div
            className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] items-end gap-6 mt-12 pb-6 border-b border-border animate-rise"
            style={{ animationDelay: "160ms" }}
          >
            <p className="max-w-[360px] text-[14px] leading-[1.55] text-ink-dim">
              Lumen Hub is a self-hosted atelier for generative imagery &
              video. Seedream renders stills at four-thousand pixels. Seedance
              stages ten-second shots with native motion.
            </p>
            <div className="flex gap-2.5 justify-self-center">
              <Button asChild size="lg" variant="primary">
                <Link href="/generate">
                  Enter the studio
                  <span className="font-serif italic">→</span>
                </Link>
              </Button>
              <Button size="lg" variant="default">
                Watch reel
              </Button>
            </div>
            <div className="flex flex-col items-end gap-2 text-right">
              <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-dim">
                Latest frame
              </div>
              <div className="font-mono text-[12px] text-ink">
                task_ff29a1 · 07s ago
              </div>
            </div>
          </div>

          {/* §04 — Mosaic (5 Seedance 2.0 shots, all with strong camera moves) */}
          <div
            className="mt-9 grid grid-cols-12 gap-3 animate-rise"
            style={{ animationDelay: "240ms" }}
          >
            <div className="col-span-12 md:col-span-5">
              <MediaTile
                src="/landing/fig-01-canyon.mp4"
                kind="video"
                label="CANYON / PULL-BACK REVEAL"
                meta="seedance 2.0 · 720p · 8s · 3:4"
                ratio="4/5"
                alt="Aerial pull-back reveal from astronaut to vast Martian canyon"
              />
            </div>
            <div className="col-span-6 md:col-span-4 grid grid-rows-2 gap-3">
              <MediaTile
                src="/landing/fig-02-desert.mp4"
                kind="video"
                label="DESERT / LATERAL TRACK"
                meta="seedance 2.0 · 720p · 5s"
              />
              <MediaTile
                src="/landing/fig-03-neon.mp4"
                kind="video"
                label="NEON / DOLLY PUSH-IN"
                meta="seedance 2.0 · 720p · 6s"
              />
            </div>
            <div className="col-span-6 md:col-span-3 grid grid-rows-2 gap-3">
              <MediaTile
                src="/landing/fig-04-underwater.mp4"
                kind="video"
                label="ABYSS / DESCENDING CRANE"
                meta="seedance 2.0 · 6s"
              />
              <MediaTile
                src="/landing/fig-05-observatory.mp4"
                kind="video"
                label="OBSERVATORY / VERTICAL CRANE-UP"
                meta="seedance 2.0 · 8s · 9:16"
              />
            </div>
          </div>

          {/* §05 — Footnote rail */}
          <div className="mt-3.5 grid grid-cols-2 md:grid-cols-4 gap-3 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-dim">
            <span>Fig. 01 · cinematic-wide</span>
            <span>Fig. 02 · handheld-loose</span>
            <span>Fig. 03 · anamorphic-2.39</span>
            <span>Fig. 04 · tripod-static</span>
          </div>
        </section>

        {/* §06 — Ticker */}
        <Ticker
          items={[
            { n: "01", t: "Seedream 5.0 Lite — text to image, 4K, adaptive ratio" },
            { n: "02", t: "Seedance 1.5 Pro — t2v · i2v · first+last frame" },
            { n: "03", t: "Seedance 2.0 — multi-reference · 15s · native audio" },
            { n: "04", t: "self-hosted · no tracking · BYO key" },
            { n: "05", t: "Vol. 04 — released April 2026" },
          ]}
        />

        {/* §07 — INSTRUMENTS */}
        <section className="mx-auto w-full max-w-[1440px] px-7">
          <SectionHead
            index="§01"
            title="INSTRUMENTS"
            sub={
              <>
                Two engines. One <span className="italic">atelier</span>.
              </>
            }
            right="Swap freely · keep your prompt"
          />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 py-7 pb-16">
            <InstrumentCard
              idx="A"
              name="Seedream"
              version="5.0 Lite"
              kicker="Still images"
              desc="Photoreal subjects, product plates, illustration. Responds to art direction in plain language — lenses, stocks, lighting, wardrobe, era."
              bullets={[
                "Text → Image",
                "Image editing",
                "Multi-image fusion",
                "Up to 4K",
              ]}
              glyph="S"
              hue={18}
              media={{
                src: "/reels/editorial/editorial-portrait-cover.jpg",
                kind: "image",
              }}
            />
            <InstrumentCard
              idx="B"
              name="Seedance"
              version="1.5 Pro / 2.0"
              kicker="Moving images"
              desc="Cinematic motion with camera control. Stage a ten-second shot from a single frame, or fill the gap between a first and last keyframe."
              bullets={[
                "Text → Video",
                "Image → Video",
                "First + last frame",
                "Multi-reference · audio (2.0)",
              ]}
              glyph="D"
              hue={210}
              media={{ src: "/landing/fig-04-underwater.mp4", kind: "video" }}
            />
          </div>

          {/* §08 — METHOD */}
          <SectionHead
            index="§02"
            title="METHOD"
            sub={
              <>
                Language is the <span className="italic">lens.</span>
              </>
            }
          />
          <div className="grid grid-cols-1 md:grid-cols-3 py-7 pb-14">
            {[
              {
                n: "i.",
                t: "Prompt, directed",
                b: "Camera, ratio, duration and motion live inside your sentence. No UI switching — only intention.",
              },
              {
                n: "ii.",
                t: "Async by design",
                b: "Video renders in the background. Stage the next shot while the last one bakes. Progress streams back to the dock.",
              },
              {
                n: "iii.",
                t: "Keyframe control",
                b: "Hand Seedance a first frame, a last frame, or both. It fills in the motion between — respecting your composition.",
              },
            ].map((f, i) => (
              <div
                key={i}
                className={
                  i === 0
                    ? "py-7 pr-7"
                    : "py-7 px-7 md:border-l border-border"
                }
              >
                <div
                  className="font-serif leading-none"
                  style={{ fontSize: 44, color: "var(--accent)" }}
                >
                  {f.n}
                </div>
                <h3 className="font-serif mt-3 mb-2.5 tracking-[-0.015em]" style={{ fontSize: 28 }}>
                  {f.t}
                </h3>
                <p className="text-ink-dim text-[14px] leading-[1.6] max-w-[340px]">
                  {f.b}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* §09 — MANIFEST */}
        <section
          className="border-y border-border"
          style={{ background: "var(--bg-2)" }}
        >
          <div className="mx-auto w-full max-w-[1440px] px-7 py-20 grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
            <div>
              <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-dim">
                §03 — MANIFEST
              </div>
              <p
                className="font-serif mt-4 tracking-[-0.015em]"
                style={{ fontSize: "clamp(28px, 3.4vw, 48px)", lineHeight: 1.08 }}
              >
                A studio should feel like a <span className="italic">room</span>{" "}
                — dim, quiet, attentive. The tools should recede. Only the{" "}
                <span className="italic">picture</span> should speak.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <MediaTile
                src="/reels/arch-viz/arch-time-of-day-library-1.jpg"
                kind="image"
                label="COLOR / 3200K"
                meta="#1 of 4"
                ratio="3/4"
              />
              <MediaTile
                src="/landing/fig-05-observatory.mp4"
                kind="video"
                label="MOTION / 24FPS"
                meta="#2 of 4"
                ratio="3/4"
              />
            </div>
          </div>
        </section>

        {/* §10 — SHOT LIST */}
        <section className="mx-auto w-full max-w-[1440px] px-7">
          <SectionHead
            index="§04"
            title="SHOT LIST"
            sub={
              <>
                Recently <span className="italic">developed.</span>
              </>
            }
            right={<Button size="sm" variant="default">All frames →</Button>}
          />
          <div className="py-7 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {SHOT_LIST.map((s) => (
              <MediaTile
                key={s.label}
                src={s.src}
                kind={s.kind}
                label={s.label}
                meta={s.meta}
                ratio="3/4"
              />
            ))}
          </div>
        </section>

        {/* §11 — GO CTA */}
        <section className="border-t border-border">
          <div className="mx-auto w-full max-w-[1440px] px-7 py-20 pb-24 text-center">
            <div className="inline-flex font-mono text-[11px] uppercase tracking-[0.14em] text-ink-dim">
              §05 — Go
            </div>
            <h2
              className="font-serif my-3 tracking-[-0.02em]"
              style={{
                fontSize: "clamp(56px, 10vw, 160px)",
                lineHeight: 1.0,
              }}
            >
              Your{" "}
              <span className="italic" style={{ color: "var(--accent)" }}>
                first frame
              </span>{" "}
              awaits.
            </h2>
            <Button asChild size="lg" variant="primary">
              <Link href="/generate">
                Begin a session <span className="font-serif italic">→</span>
              </Link>
            </Button>
            <div className="mt-4 font-mono text-[11px] uppercase tracking-[0.12em] text-ink-dim">
              No account · keys stay on your machine ·{" "}
              <kbd className="rounded border border-border px-1 py-0.5 text-[10px]">
                G
              </kbd>{" "}
              to skip the tour
            </div>
          </div>
        </section>

        {/* §12 — Footer */}
        <footer className="border-t border-border">
          <div className="mx-auto w-full max-w-[1440px] px-7 py-9 grid grid-cols-2 md:grid-cols-4 gap-6">
            <div>
              <div
                className="font-serif tracking-[-0.02em]"
                style={{ fontSize: 32 }}
              >
                Lumen Hub
              </div>
              <div className="mt-1 font-mono text-[11px] tracking-[0.10em] text-ink-dim">
                est. 2026 · self-hosted · no tracking
              </div>
            </div>
            {[
              {
                h: "Instruments",
                l: ["Seedream", "Seedance", "Reference", "Keyframes"],
              },
              {
                h: "Method",
                l: ["Docs", "Prompt atlas", "Changelog", "Status"],
              },
              {
                h: "Credits",
                l: [
                  "Built on BytePlus",
                  "Next.js 16",
                  "Source on GitHub",
                  "License · MIT",
                ],
              },
            ].map((c) => (
              <div key={c.h}>
                <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-dim">
                  {c.h}
                </div>
                <ul className="mt-2.5 grid gap-2 list-none p-0">
                  {c.l.map((x) => (
                    <li key={x} className="text-[13px] text-ink hover:text-accent transition-colors">
                      <a href="#">{x}</a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="border-t border-border">
            <div className="mx-auto w-full max-w-[1440px] px-7 py-4 flex justify-between font-mono text-[11px] tracking-[0.10em] text-ink-dim">
              <span>© LUMEN · VOL. 04 · MMXXVI</span>
              <span>RENDERED IN THE DARK</span>
            </div>
          </div>
        </footer>
      </main>
    </>
  );
}

function SectionHead({
  index,
  title,
  sub,
  right,
}: {
  index: string;
  title: string;
  sub: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-6 pt-16 pb-2 border-b border-border">
      <div>
        <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-dim">
          {index} — {title}
        </div>
        <h2
          className="font-serif mt-2 tracking-[-0.02em]"
          style={{ fontSize: "clamp(32px, 4.4vw, 56px)", lineHeight: 1 }}
        >
          {sub}
        </h2>
      </div>
      {typeof right === "string" ? (
        <span className="hidden md:inline-block pb-2.5 font-mono text-[11px] uppercase tracking-[0.12em] text-ink-dim">
          {right}
        </span>
      ) : (
        right
      )}
    </div>
  );
}

function InstrumentCard({
  idx,
  name,
  version,
  kicker,
  desc,
  bullets,
  glyph,
  hue,
  media,
}: {
  idx: string;
  name: string;
  version: string;
  kicker: string;
  desc: string;
  bullets: string[];
  glyph: string;
  hue: number;
  /** Right-side visual. When omitted falls back to the letter-glyph
   *  PlaceholderTile so the card still reads if the media goes missing. */
  media?: { src: string; kind: "image" | "video" };
}) {
  return (
    <div
      className="relative overflow-hidden rounded-[16px] border border-border"
      style={{ background: "var(--bg-2)" }}
    >
      <div className="grid grid-cols-1 md:grid-cols-[1.1fr_1fr]">
        <div className="flex flex-col gap-4 p-7 min-h-[380px]">
          <div className="flex justify-between items-baseline">
            <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-dim">
              Instrument {idx}
            </span>
            <span className="font-mono text-[11px] uppercase tracking-[0.10em] text-accent">
              {kicker}
            </span>
          </div>
          <div>
            <div
              className="font-serif tracking-[-0.025em]"
              style={{ fontSize: 64, lineHeight: 0.95 }}
            >
              {name}
            </div>
            <div
              className="font-serif italic mt-1 text-ink-dim"
              style={{ fontSize: 24 }}
            >
              {version}
            </div>
          </div>
          <p className="text-ink-dim text-[14px] leading-[1.6] max-w-[420px]">
            {desc}
          </p>
          <div className="flex flex-wrap gap-1.5 mt-auto">
            {bullets.map((b) => (
              <Chip key={b}>{b}</Chip>
            ))}
          </div>
          <Button
            asChild
            variant="default"
            size="md"
            className="self-start mt-2"
          >
            <Link href="/generate">
              Open instrument <span className="font-serif italic">→</span>
            </Link>
          </Button>
        </div>
        <div className="relative min-h-[260px] border-l border-border overflow-hidden">
          {media ? (
            <MediaTile
              src={media.src}
              kind={media.kind}
              alt={`${name} sample`}
              ratio="auto"
              className="rounded-none border-0"
            />
          ) : (
            <PlaceholderTile
              ratio="auto"
              hue={hue}
              glyph={glyph}
              label={name.toUpperCase()}
              meta={version}
              className="absolute inset-0 rounded-none border-0"
            />
          )}
        </div>
      </div>
    </div>
  );
}
