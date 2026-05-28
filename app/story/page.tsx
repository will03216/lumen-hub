import { SiteHeader } from "@/components/site-header";
import { StoriesShell } from "./stories-shell";

export default function StoryPage() {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <StoriesShell />
      </main>
    </>
  );
}
