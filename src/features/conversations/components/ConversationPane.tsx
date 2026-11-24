import { getRouteApi } from "@tanstack/react-router";
import { useEffect } from "react";
import { useConversations, useConversationsActions } from "../context";
import { STATUS_LABEL } from "../constants";

const route = getRouteApi("/conversations/$conversationId");

export function ConversationPane() {
  const { conversationId } = route.useParams();
  const { open } = useConversationsActions();
  const loaded = useConversations((s) => s.list !== null);
  const row = useConversations((s) => s.list?.byId[conversationId]);

  useEffect(() => {
    open(conversationId);
    return () => open(null);
  }, [open, conversationId]);

  if (!loaded) return null;
  if (!row) return <ConversationNotFound />;

  return (
    <section aria-labelledby="conversation-title" className="flex flex-col gap-1 p-6">
      <h2 id="conversation-title" className="text-start text-lg font-semibold">
        <bdi>{row.customer}</bdi>
      </h2>
      <p className="text-sm text-muted-foreground">{STATUS_LABEL[row.status]}</p>
    </section>
  );
}

export function NoConversationSelected() {
  return (
    <div className="grid flex-1 place-items-center p-6 text-sm text-muted-foreground">
      Select a conversation
    </div>
  );
}

function ConversationNotFound() {
  return (
    <div role="status" className="grid flex-1 place-items-center p-6 text-sm text-muted-foreground">
      Conversation not found
    </div>
  );
}
