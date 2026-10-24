import { createFileRoute } from "@tanstack/react-router";
import { SettingsScreen } from "@/components/lumo/settings";
export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Workspace preferences — LUMO" },
      {
        name: "description",
        content: "Personalize appearance, accessibility, and your local LUMO workspace.",
      },
      { property: "og:title", content: "Workspace preferences — LUMO" },
      {
        property: "og:description",
        content: "Personalize appearance, accessibility, and your local LUMO workspace.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SettingsScreen,
});
