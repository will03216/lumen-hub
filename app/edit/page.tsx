import { SiteHeader } from "@/components/site-header";
import { EditDashboard } from "./edit-dashboard";

export const metadata = {
  title: "Edit — Lumen Hub",
  description:
    "Mark up an image and describe the change. Seedream 5.0 Pro edits exactly the region you point at.",
};

export default function EditPage() {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <EditDashboard />
      </main>
    </>
  );
}
