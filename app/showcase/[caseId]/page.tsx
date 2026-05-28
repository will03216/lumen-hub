import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { SHOWCASE_CASES, findCase } from "@/lib/showcase/cases";
import { CaseDetail } from "./case-detail";

/** Pre-render every case at build time so /showcase/<id> is a static
 *  HTML response — these pages are content, not user-state. */
export function generateStaticParams() {
  return SHOWCASE_CASES.map((c) => ({ caseId: c.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ caseId: string }>;
}): Promise<Metadata> {
  const { caseId } = await params;
  const c = findCase(caseId);
  if (!c) return { title: "Case not found — Lumen Hub" };
  return {
    title: `${c.client} — ${c.title} · Lumen Hub`,
    description: c.brief,
  };
}

export default async function ShowcaseCasePage({
  params,
}: {
  params: Promise<{ caseId: string }>;
}) {
  const { caseId } = await params;
  const showcaseCase = findCase(caseId);
  if (!showcaseCase) notFound();

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-[1240px] px-4 py-10 md:px-7 md:py-14">
        <CaseDetail caseData={showcaseCase} />
      </main>
    </>
  );
}
