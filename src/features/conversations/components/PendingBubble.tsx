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
      <span className="mt-1 text-xs">Sending…</span>
    </Bubble>
  );
});
