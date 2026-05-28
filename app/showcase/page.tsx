import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { ShowcaseShell } from "./showcase-shell";

export const metadata: Metadata = {
  title: "Showcase — Lumen Hub",
  description:
    "Real work made on Lumen, organised by industry. See the brief, the workflow, and the receipts — then clone the project to make it yours.",
};

export default function ShowcasePage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-[1440px] px-4 py-10 md:px-7 md:py-14">
        <ShowcaseShell />
      </main>
    </>
  );
}
