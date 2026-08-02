"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Settings } from "lucide-react";
import { UserButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/ui/wordmark";
import { useAuth } from "@/lib/cloud/auth";
import { cn } from "@/lib/utils";

/**
 * Top-level nav follows the four-pillar IA: Generator, Canvas, Library,
 * Showcase. Templates and Compare live one click below — Templates is the
 * creator-facing entry that hydrates Generator; Compare folds into
 * Generator's double-side mode in a follow-up. Index sits at the front as
 * the marketing landing.
 *
 * Labels are decoupled from URLs deliberately: the `/studio` and `/reels`
 * directories keep their paths so we don't break in-flight deep links;
 * the user-facing word reflects the new IA.
 */
const NAV = [
  { label: "Index", href: "/", match: (p: string) => p === "/" },
  { label: "Generator", href: "/generate", match: (p: string) => p.startsWith("/generate") },
  { label: "Edit", href: "/edit", match: (p: string) => p.startsWith("/edit") },
  { label: "Story", href: "/story", match: (p: string) => p.startsWith("/story") },
  { label: "Canvas", href: "/studio", match: (p: string) => p.startsWith("/studio") },
  { label: "Library", href: "/library", match: (p: string) => p.startsWith("/library") },
  { label: "Showcase", href: "/showcase", match: (p: string) => p.startsWith("/showcase") },
  { label: "Templates", href: "/reels", match: (p: string) => p.startsWith("/reels") },
];

export function SiteHeader() {
  const pathname = usePathname();
  const { status } = useAuth();
  return (
    <header
      className="sticky top-0 z-40 border-b border-border backdrop-blur-[14px]"
      style={{ background: "rgba(5,5,10,0.65)" }}
    >
      {/* Mobile: shrink horizontal padding + gaps and let the nav pill group
          shrink with tighter padding. The three grid cells stay 1fr_auto_1fr
          at every size — pushing nav to its own row would fight the sticky
          blur rail. ENGINE-ONLINE pill is already md:only which frees up the
          right cell; the ⌘K button is sm+ only. */}
      <div className="mx-auto grid w-full max-w-[1440px] grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 py-3.5 md:gap-6 md:px-7">
        <div>
          <Link href="/" className="inline-block">
            <Wordmark size={22} />
          </Link>
        </div>
        {/* min-w-0 + overflow-x-auto so the pill group scrolls instead of
            pushing the right-hand rail out of the header. The grid's `auto`
            column would otherwise size to content and overflow — an eighth
            nav item put the row into the width band where that starts to
            bite. Scrollbar hidden: this is a spill valve, not a control. */}
        <nav className="flex min-w-0 max-w-full items-center gap-0.5 overflow-x-auto [scrollbar-width:none] md:gap-1 [&::-webkit-scrollbar]:hidden">
          {NAV.map((item) => {
            const active = item.match?.(pathname);
            return (
              <Link
                key={item.label}
                href={item.href}
                className={cn(
                  "rounded-full px-2 py-1.5 text-[12px] font-medium transition-colors md:px-3",
                  active
                    ? "bg-ink text-[var(--bg)]"
                    : "text-ink-dim hover:text-ink",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center justify-end gap-2">
          <span className="hidden md:inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.10em] text-ink-dim">
            <span className="size-1.5 rounded-full bg-ok animate-pulse-soft" />
            ENGINE ONLINE
          </span>
          {/* Auth pill — hidden in `disabled` state so single-device setups
              don't see a useless sign-in CTA. Stays as compact as the
              ⌘K affordance so it doesn't crowd the right rail. */}
          {status === "anonymous" && (
            <Link
              href="/sign-in"
              className="hidden sm:inline-flex items-center rounded-full border border-border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-dim hover:border-ink-dim hover:text-ink"
            >
              Sign in →
            </Link>
          )}
          {status === "signed-in" && (
            <>
              <Link
                href="/settings"
                aria-label="Settings"
                title="API keys & settings"
                className={cn(
                  "inline-flex items-center justify-center rounded-full border p-1.5 transition-colors",
                  pathname.startsWith("/settings")
                    ? "border-ink-dim text-ink"
                    : "border-border text-ink-dim hover:border-ink-dim hover:text-ink",
                )}
              >
                <Settings className="size-4" />
              </Link>
              <UserButton />
            </>
          )}
          <Button size="sm" variant="default" className="hidden sm:inline-flex">
            <span className="font-mono text-[10px] tracking-[0.12em]">⌘K</span>
          </Button>
          <Button asChild size="sm" variant="primary">
            <Link href="/generate">Enter Generator →</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}

