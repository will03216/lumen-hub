import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { ForgeConsole } from "./forge-console";

export const metadata: Metadata = {
  title: "Forge — Agentic Production Lines — Lumen Hub",
  description:
    "Turn a brief into a guarded production line. Pick a vertical, let the agent plan a Production Spec, review the freeze gate with a cost estimate, then run it deterministically on the canvas.",
};

export default function ForgePage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-[1180px] px-4 py-10 md:px-7 md:py-14">
        <ForgeConsole />
      </main>
    </>
  );
}
