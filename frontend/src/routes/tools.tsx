import { createFileRoute } from "@tanstack/react-router";
import { ToolsScreen } from "@/components/lumo/tools";
export const Route = createFileRoute("/tools")({
  head: () => ({
    meta: [
      { title: "Your toolkit — LUMO" },
      {
        name: "description",
        content: "Local utilities and clearly defined integrations for your LUMO workspace.",
      },
      { property: "og:title", content: "Your toolkit — LUMO" },
      {
        property: "og:description",
        content: "Local utilities and clearly defined integrations for your LUMO workspace.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ToolsScreen,
});
