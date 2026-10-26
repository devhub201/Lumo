import { createFileRoute } from "@tanstack/react-router";
import { ChatScreen } from "@/components/lumo/chat";
export const Route = createFileRoute("/chat_/$threadId")({
  head: () => ({
    meta: [
      { title: "Conversation workspace — LUMO" },
      {
        name: "description",
        content:
          "A focused LUMO conversation with visit-only history and a refined writing workspace.",
      },
      { property: "og:title", content: "Conversation workspace — LUMO" },
      {
        property: "og:description",
        content:
          "A focused LUMO conversation with visit-only history and a refined writing workspace.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ThreadPage,
});
function ThreadPage() {
  const { threadId } = Route.useParams();
  return <ChatScreen key={threadId} threadId={threadId} />;
}
