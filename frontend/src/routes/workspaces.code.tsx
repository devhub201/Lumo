import { createFileRoute } from "@tanstack/react-router";
import { CodeWorkspace } from "@/components/lumo/code-workspace";
export const Route = createFileRoute("/workspaces/code")({
  head: () => ({
    meta: [
      { title: "Coding workspace — LUMO" },
      {
        name: "description",
        content: "Project explorer, editor tabs, and an integrated terminal for LUMO.",
      },
      { property: "og:title", content: "Coding workspace — LUMO" },
      {
        property: "og:description",
        content: "Project explorer, editor tabs, and an integrated terminal for LUMO.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CodeWorkspace,
});
