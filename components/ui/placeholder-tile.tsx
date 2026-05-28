import * as React from "react";
import { cn } from "@/lib/utils";

type Kind = "stripes" | "duotone" | "scan";

export type PlaceholderTileProps = {
  label?: string;
  meta?: string;
  hue?: number;
  ratio?: string;
  kind?: Kind;
  glyph?: string;
  className?: string;
  children?: React.ReactNode;
};

function bgStyle(kind: Kind, h: number): React.CSSProperties {
  if (kind === "duotone") {
    return {
      background: `radial-gradient(circle at 30% 20%, oklch(0.55 0.18 ${h}) 0%, transparent 60%), radial-gradient(circle at 80% 90%, oklch(0.20 0.12 ${(h + 180) % 360}) 0%, transparent 55%), linear-gradient(180deg, oklch(0.18 0.08 ${h}), oklch(0.08 0.04 ${h}))`,
    };
  }
  if (kind === "scan") {
    return {
      background: `linear-gradient(180deg, oklch(0.22 0.08 ${h}), oklch(0.08 0.03 ${h}))`,
    };
  }
  return {
    background: `repeating-linear-gradient(100deg, oklch(0.16 0.06 ${h}) 0 18px, oklch(0.11 0.05 ${h}) 18px 36px)`,
  };
}

export function PlaceholderTile({
  label,
  meta,
  hue = 28,
  ratio = "3/4",
  kind = "stripes",
  glyph,
  className,
  children,
}: PlaceholderTileProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[12px] border border-border",
        className,
      )}
      style={{ aspectRatio: ratio, ...bgStyle(kind, hue) }}
    >
      {kind === "scan" && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "repeating-linear-gradient(0deg, transparent 0 2px, rgba(0,0,0,0.35) 2px 3px)",
          }}
        />
      )}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "linear-gradient(180deg, transparent 60%, rgba(0,0,0,0.55))",
          mixBlendMode: "multiply",
        }}
      />
      <CornerTicks />
      {glyph && (
        <div
          className="absolute inset-0 grid place-items-center font-serif italic leading-none"
          style={{
            fontSize: "clamp(56px, 14vw, 180px)",
            color: "rgba(242,240,232,0.88)",
          }}
        >
          {glyph}
        </div>
      )}
      {children}
      {label && (
        <div className="absolute left-3 bottom-2.5 font-mono text-[10px] uppercase tracking-[0.14em] text-ink/85">
          {label}
        </div>
      )}
      {meta && (
        <div className="absolute right-3 top-2.5 font-mono text-[10px] tracking-[0.10em] text-ink/55">
          {meta}
        </div>
      )}
    </div>
  );
}

export function CornerTicks() {
  const base =
    "absolute size-2.5 border-ink/40 pointer-events-none";
  return (
    <>
      <span className={cn(base, "left-1.5 top-1.5 border-l border-t")} />
      <span className={cn(base, "right-1.5 top-1.5 border-r border-t")} />
      <span className={cn(base, "left-1.5 bottom-1.5 border-l border-b")} />
      <span className={cn(base, "right-1.5 bottom-1.5 border-r border-b")} />
    </>
  );
}
