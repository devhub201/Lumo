import { createFileRoute } from "@tanstack/react-router";
import { HomeScreen } from "@/components/lumo/home";
export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "LUMO — Your personal AI workspace" },
      {
        name: "description",
        content:
          "A focused personal workspace for ideas, conversations, and everyday intelligence.",
      },
      { property: "og:title", content: "LUMO — Your personal AI workspace" },
      { property: "og:description", content: "A space to think, create, and explore with LUMO." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HomeScreen,
});
