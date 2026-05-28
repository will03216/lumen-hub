"use client";

/**
 * BrandLogo — small square brand mark used in the Engine dropdown so users
 * can tell which provider runs which model at a glance.
 *
 * Three brands ship today:
 *   • BytePlus — Seedream + Seedance (orange tile, "B")
 *   • MiniMax  — Hailuo + T2V Director + Speech (violet tile, "M")
 *   • OpenAI   — GPT Image 2 via fal (black tile, official knot SVG)
 *
 * `resolveModelBrand` keeps callers free of brand-mapping boilerplate.
 * If a model declares `provider`, that wins; otherwise we fall back to
 * the id prefix (e.g. `openai/...`) and default to BytePlus.
 */

import * as React from "react";

export type ModelBrand = "byteplus" | "minimax" | "openai";

/** Map a model id (and optional provider hint) to a brand. Provider wins
 *  over id-sniffing because the `provider` field is the source of truth
 *  in studio/models.ts. */
export function resolveModelBrand(
  id: string,
  provider?: string,
): ModelBrand {
  if (provider === "minimax") return "minimax";
  if (provider === "fal" || id.startsWith("openai/")) return "openai";
  return "byteplus";
}

const TILE_BASE =
  "inline-flex shrink-0 items-center justify-center rounded-[5px] bg-black text-white";

const SIZE: Record<"sm" | "md", string> = {
  sm: "size-4",
  md: "size-5",
};

export function BrandLogo({
  brand,
  size = "md",
  className = "",
}: {
  brand: ModelBrand;
  size?: "sm" | "md";
  className?: string;
}) {
  if (brand === "openai") {
    return (
      <span
        className={`${TILE_BASE} ${SIZE[size]} ${className}`}
        aria-hidden
      >
        {/* Official OpenAI knot mark (public brand asset). */}
        <svg
          viewBox="0 0 24 24"
          className="size-[70%]"
          fill="currentColor"
        >
          <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 0-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.792a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z" />
        </svg>
      </span>
    );
  }
  if (brand === "minimax") {
    // Approximates the MiniMax wordmark icon — a continuous soundwave
    // ribbon made of five vertical strokes joined alternately at the
    // top and bottom by smooth half-arcs. The original logo uses a
    // pink → orange gradient; we render mono white-on-black to match
    // the rest of the dropdown brand strip.
    return (
      <span
        className={`${TILE_BASE} ${SIZE[size]} ${className}`}
        aria-hidden
      >
        <svg
          viewBox="0 0 24 24"
          className="size-[78%]"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4 4 V18 Q6 20 8 18 V8 Q10 6 12 8 V14 Q14 16 16 14 V6 Q18 4 20 6 V16" />
        </svg>
      </span>
    );
  }
  // byteplus — official ByteDance "byte" mark: two full-height bars
  // flanking a shorter, lower-offset middle bar. Rendered mono-white
  // on the shared black tile to stay aligned with the other brand
  // logos in the strip.
  return (
    <span
      className={`${TILE_BASE} ${SIZE[size]} ${className}`}
      aria-hidden
    >
      <svg
        viewBox="0 0 24 24"
        className="size-[72%]"
        fill="currentColor"
      >
        <rect x="4" y="3" width="3.6" height="18" rx="0.6" />
        <rect x="10.2" y="9" width="3.6" height="12" rx="0.6" />
        <rect x="16.4" y="3" width="3.6" height="18" rx="0.6" />
      </svg>
    </span>
  );
}
