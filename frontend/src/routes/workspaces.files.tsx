import { createFileRoute } from "@tanstack/react-router";
import { FilesWorkspace } from "@/components/lumo/files-workspace";
export const Route = createFileRoute("/workspaces/files")({
  head: () => ({
    meta: [
      { title: "Files & documents — LUMO" },
      { name: "description", content: "Open and preview local files and documents in LUMO." },
      { property: "og:title", content: "Files & documents — LUMO" },
      {
        property: "og:description",
        content: "Open and preview local files and documents in LUMO.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: FilesWorkspace,
});
