import { SiteHeader } from "@/components/site-header";
import { CompareShell } from "./compare-shell";
import { resolveQuery } from "@/lib/compare/pairs";

export const metadata = {
  title: "Compare · Lumen Hub",
  description:
    "Render the same prompt through two engines side-by-side. Pick the tradeoff you can see.",
};

/**
 * /compare — side-by-side engine comparison.
 *
 * Phase 1: image pairs only (Seedream 5.0 Lite vs Seedream 4.5).
 * Video pairs land in Phase 2; URL/state shape already accounts for them.
 */
export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const initial = resolveQuery(params);

  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <CompareShell initial={initial} />
      </main>
    </>
  );
}
