import { createFileRoute } from "@tanstack/react-router";
import { VoiceScreen } from "@/components/lumo/media";
export const Route = createFileRoute("/voice")({
  head: () => ({
    meta: [
      { title: "Voice — LUMO" },
      {
        name: "description",
        content: "Explore live microphone input in the LUMO voice workspace.",
      },
      { property: "og:title", content: "Voice — LUMO" },
      {
        property: "og:description",
        content: "Explore live microphone input in the LUMO voice workspace.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: VoiceScreen,
});
