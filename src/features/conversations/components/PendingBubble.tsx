import { memo } from "react";
import { useConversations } from "../context";
import { Bubble } from "./MessageBubble";

interface PendingBubbleProps {
  conversationId: string;
  clientMessageId: string;
}

export const PendingBubble = memo(function PendingBubble({
  conversationId,
  clientMessageId,
}: PendingBubbleProps) {
  const reply = useConversations((s) =>
    s.threads[conversationId]?.pending.find((p) => p.clientMessageId === clientMessageId),
  );
  if (!reply) return null;
  return (
    <Bubble role="human" text={reply.text} className="opacity-70">
      {/* Sent: the server accepted it; its echo on the stream will place it among the messages. */}
      <span className="mt-1 text-xs">{reply.state === "sent" ? "Sent" : "Sending…"}</span>
    </Bubble>
  );
});
