import { createFileRoute } from "@tanstack/react-router";
import { WorkspacesScreen } from "@/components/lumo/workspaces";
export const Route = createFileRoute("/workspaces/")({
  head: () => ({
    meta: [
      { title: "Workspaces — LUMO" },
      {
        name: "description",
        content:
          "Dedicated LUMO environments for coding, browsing, files, vision, voice, and study.",
      },
      { property: "og:title", content: "Workspaces — LUMO" },
      {
        property: "og:description",
        content:
          "Dedicated LUMO environments for coding, browsing, files, vision, voice, and study.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: WorkspacesScreen,
});
