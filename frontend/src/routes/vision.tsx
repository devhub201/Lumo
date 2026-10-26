import { createFileRoute } from "@tanstack/react-router";
import { VisionScreen } from "@/components/lumo/media";
export const Route = createFileRoute("/vision")({
  head: () => ({
    meta: [
      { title: "Vision — LUMO" },
      { name: "description", content: "Capture a new perspective with the LUMO camera workspace." },
      { property: "og:title", content: "Vision — LUMO" },
      {
        property: "og:description",
        content: "Capture a new perspective with the LUMO camera workspace.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: VisionScreen,
});
