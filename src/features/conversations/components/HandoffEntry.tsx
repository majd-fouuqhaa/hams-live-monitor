import { memo } from "react";
import { formatLong, useNow } from "@/utils/relative-time";
import { useConversations } from "../context";

interface HandoffEntryProps {
  conversationId: string;
  eventId: number;
}

export const HandoffEntry = memo(function HandoffEntry({
  conversationId,
  eventId,
}: HandoffEntryProps) {
  const now = useNow();
  const handoff = useConversations((s) =>
    s.list?.handoffs[conversationId]?.find((h) => h.eventId === eventId),
  );
  if (!handoff) return null;
  return (
    <div className="flex justify-center px-4 py-2">
      <p className="max-w-[min(85%,40rem)] rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-center text-xs text-amber-900 dark:text-amber-200">
        <span className="font-medium">Handed to a human</span>
        {" · "}
        <bdi>{handoff.reason}</bdi>
        {" · "}
        <time dateTime={handoff.receivedAt}>{formatLong(handoff.receivedAt, now)}</time>
      </p>
    </div>
  );
});
