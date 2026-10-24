import { createFileRoute } from "@tanstack/react-router";
import { ChatScreen } from "@/components/lumo/chat";
export const Route = createFileRoute("/chat")({
  validateSearch: (search: Record<string, unknown>) => ({
    prompt: typeof search["prompt"] === "string" ? search["prompt"] : "",
  }),
  head: () => ({
    meta: [
      { title: "Conversations — LUMO" },
      { name: "description", content: "A thoughtful, integrated conversation workspace for LUMO." },
      { property: "og:title", content: "Conversations — LUMO" },
      {
        property: "og:description",
        content: "A thoughtful, integrated conversation workspace for LUMO.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ChatPage,
});

function ChatPage() {
  const { prompt } = Route.useSearch();
  return <ChatScreen prompt={prompt} />;
}
