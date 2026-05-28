import type { Metadata } from "next";
import { Suspense } from "react";
import { SiteHeader } from "@/components/site-header";
import { LibraryShell } from "./library-shell";

export const metadata: Metadata = {
  title: "Library — Lumen Hub",
  description:
    "Every render and reference, in one place. Generated stills and clips land here automatically; uploads and reference plates are filed alongside them.",
};

export default function LibraryPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-[1440px] px-4 py-10 md:px-7 md:py-14">
        {/* Suspense boundary required because LibraryShell calls
         *  useSearchParams() to honour `?kind=` deep-links from the
         *  Generator's "View all" link. Without it Next bails the
         *  page out of static prerendering. */}
        <Suspense fallback={null}>
          <LibraryShell />
        </Suspense>
      </main>
    </>
  );
}
