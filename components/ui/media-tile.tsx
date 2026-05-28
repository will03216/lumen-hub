import * as React from "react";
import { cn } from "@/lib/utils";
import { CornerTicks } from "./placeholder-tile";

export type MediaTileProps = {
  src: string;
  kind?: "image" | "video";
  poster?: string;
  alt?: string;
  label?: string;
  meta?: string;
  ratio?: string; // e.g. "4/5", "16/9", or "auto" to fill the grid cell
  className?: string;
  /** crop fit; defaults to cover so the tile always fills */
  fit?: "cover" | "contain";
};

export function MediaTile({
  src,
  kind = "image",
  poster,
  alt,
  label,
  meta,
  ratio,
  className,
  fit = "cover",
}: MediaTileProps) {
  const objectClass = fit === "cover" ? "object-cover" : "object-contain";
  return (
    <div
      className={cn(
        "relative h-full w-full overflow-hidden rounded-[12px] border border-border bg-[var(--bg-2)]",
        className,
      )}
      style={ratio && ratio !== "auto" ? { aspectRatio: ratio } : undefined}
    >
      {kind === "video" ? (
        <video
          src={src}
          poster={poster}
          autoPlay
          loop
          muted
          playsInline
          // metadata-only preload keeps initial bytes small; the player
          // upgrades on first paint once the element enters viewport.
          preload="metadata"
          className={cn("absolute inset-0 h-full w-full", objectClass)}
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt ?? label ?? ""}
          loading="lazy"
          decoding="async"
          className={cn("absolute inset-0 h-full w-full", objectClass)}
        />
      )}

      {/* Top + bottom darkening so meta/label stay readable on bright frames */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "linear-gradient(180deg, rgba(0,0,0,0.40) 0%, transparent 28%, transparent 64%, rgba(0,0,0,0.55) 100%)",
        }}
      />

      <CornerTicks />

      {label && (
        <div className="absolute left-3 bottom-2.5 font-mono text-[10px] uppercase tracking-[0.14em] text-ink/85">
          {label}
        </div>
      )}
      {meta && (
        <div className="absolute right-3 top-2.5 font-mono text-[10px] tracking-[0.10em] text-ink/65">
          {meta}
        </div>
      )}
    </div>
  );
}
