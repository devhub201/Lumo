import { createFileRoute } from "@tanstack/react-router";
import { StudyWorkspace } from "@/components/lumo/study-workspace";
export const Route = createFileRoute("/workspaces/study")({
  head: () => ({
    meta: [
      { title: "Study workspace — LUMO" },
      { name: "description", content: "Focus sessions and study topics in LUMO." },
      { property: "og:title", content: "Study workspace — LUMO" },
      { property: "og:description", content: "Focus sessions and study topics in LUMO." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StudyWorkspace,
});
