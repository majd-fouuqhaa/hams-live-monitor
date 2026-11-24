import { getRouteApi } from "@tanstack/react-router";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useConversations, useConversationsActions } from "../context";
import { useThreadSnapshot } from "../hooks/useThreadSnapshot";
import { StatusBadge } from "./StatusBadge";
import { ThreadFooter } from "./ThreadFooter";
import { ThreadMessages } from "./ThreadMessages";
import { ThreadSkeleton } from "./ThreadSkeleton";

const route = getRouteApi("/conversations/$conversationId");

export function ConversationPane() {
  const { conversationId } = route.useParams();
  const { open } = useConversationsActions();
  const loaded = useConversations((s) => s.list !== null);
  const customer = useConversations((s) => s.list?.byId[conversationId]?.customer);
  const status = useConversations((s) => s.list?.byId[conversationId]?.status);

  // Re-runs once the list loads: on a direct link or reload, the pane mounts before the list exists.
  useEffect(() => {
    open(conversationId);
    return () => open(null);
  }, [open, conversationId, loaded]);

  if (!loaded) return null;
  if (customer === undefined || !status) return <ConversationNotFound />;

  // The header comes from the list row, so it shows at once while the messages load.
  return (
    <section aria-labelledby="conversation-title" className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center gap-2 border-b px-4 py-3">
        <h2 id="conversation-title" className="min-w-0 truncate text-start text-base font-semibold">
          <bdi>{customer}</bdi>
        </h2>
        <StatusBadge status={status} />
      </header>
      <ThreadBody key={conversationId} conversationId={conversationId} />
      <ThreadFooter
        key={`footer-${conversationId}`}
        conversationId={conversationId}
        status={status}
      />
    </section>
  );
}

interface ThreadBodyProps {
  conversationId: string;
}

function ThreadBody({ conversationId }: ThreadBodyProps) {
  const snapshot = useThreadSnapshot(conversationId);
  const threadLoaded = useConversations((s) => s.threads[conversationId]?.loaded ?? false);
  const outOfSync = useConversations((s) => s.threads[conversationId]?.outOfSync ?? false);
  const retry = () => void snapshot.refetch();

  if (!threadLoaded) {
    if (snapshot.isError) {
      return (
        <div role="alert" className="grid flex-1 place-items-center p-6">
          <div className="flex flex-col items-center gap-3 text-center">
            <p className="text-sm">Couldn't load messages</p>
            <p className="text-xs text-muted-foreground">{snapshot.error.message}</p>
            <Button size="sm" onClick={retry}>
              Retry
            </Button>
          </div>
        </div>
      );
    }
    return <ThreadSkeleton />;
  }

  return (
    <>
      {outOfSync && (
        <div
          role="alert"
          className="flex items-center gap-3 border-b bg-muted/50 px-4 py-2 text-sm"
        >
          <p className="flex-1 text-start">This conversation may be out of date.</p>
          <Button size="sm" variant="outline" onClick={retry} disabled={snapshot.isFetching}>
            {snapshot.isFetching ? "Refreshing…" : "Retry"}
          </Button>
        </div>
      )}
      <ThreadMessages conversationId={conversationId} />
    </>
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
