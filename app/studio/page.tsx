import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { Dashboard } from "./dashboard";

export const metadata: Metadata = {
  title: "My Studio — Lumen Hub",
  description:
    "All your Studio projects. Create from a template or start blank — each project is its own canvas, saved locally to this device.",
};

export default function StudioDashboardPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-[1440px] px-4 py-10 md:px-7 md:py-14">
        <Dashboard />
      </main>
    </>
  );
}
