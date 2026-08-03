import { SiteHeader } from "@/components/site-header";
import { EditWorkspace } from "./edit-workspace";

export default async function EditSessionPage({
  params,
}: {
  // Next 16: dynamic params arrive as a Promise.
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <EditWorkspace sessionId={id} />
      </main>
    </>
  );
}
