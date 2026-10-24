import { createFileRoute } from "@tanstack/react-router";
import { BrowserWorkspace } from "@/components/lumo/browser-workspace";
export const Route = createFileRoute("/workspaces/browser")({
  head: () => ({
    meta: [
      { title: "Browser workspace — LUMO" },
      { name: "description", content: "Browse the web inside your LUMO workspace." },
      { property: "og:title", content: "Browser workspace — LUMO" },
      { property: "og:description", content: "Browse the web inside your LUMO workspace." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: BrowserWorkspace,
});
