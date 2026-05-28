import { SiteHeader } from "@/components/site-header";
import { StoryEditor } from "./story-editor";

export default async function StoryEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <StoryEditor storyId={id} />
      </main>
    </>
  );
}
