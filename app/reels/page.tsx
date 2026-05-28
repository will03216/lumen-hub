import { SiteHeader } from "@/components/site-header";
import { ReelsBoard } from "./reels-board";

export const metadata = {
  title: "Reels — Lumen Hub",
  description:
    "Industry-vertical templates for Seedance 2.0, Seedream 5.0 Lite, and Seedream 4.5. Pick a shot, edit the prompt, render in Generator.",
};

export default function ReelsPage() {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <ReelsBoard />
      </main>
    </>
  );
}
