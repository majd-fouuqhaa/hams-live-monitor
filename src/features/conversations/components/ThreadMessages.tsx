import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown } from "lucide-react";
import { useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { THREAD_ESTIMATED_ROW_PX, THREAD_OVERSCAN } from "../constants";
import { useConversations } from "../context";
import { useStickToBottom } from "../hooks/useStickToBottom";
import { handoffEventId } from "../thread";
import type { PendingReply } from "../types";
import { HandoffEntry } from "./HandoffEntry";
import { MessageBubble } from "./MessageBubble";
import { PendingBubble } from "./PendingBubble";

const PENDING_KEY_PREFIX = "pending:";
const NO_KEYS: string[] = [];
const NO_PENDING: PendingReply[] = [];

interface ThreadMessagesProps {
  conversationId: string;
}

export function ThreadMessages({ conversationId }: ThreadMessagesProps) {
  const order = useConversations((s) => s.threads[conversationId]?.order ?? NO_KEYS);
  const pending = useConversations((s) => s.threads[conversationId]?.pending ?? NO_PENDING);
  const keys = useMemo(
    () => [...order, ...pending.map((p) => PENDING_KEY_PREFIX + p.clientMessageId)],
    [order, pending],
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: keys.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => THREAD_ESTIMATED_ROW_PX,
    overscan: THREAD_OVERSCAN,
    getItemKey: (index) => keys[index]!,
  });

  const { showJump, onScroll, jump } = useStickToBottom({
    scrollRef,
    virtualizer,
    rowCount: keys.length,
    pendingCount: pending.length,
  });

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div ref={scrollRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto py-3">
        <div
          role="list"
          aria-label="Messages"
          className="relative w-full"
          style={{ height: virtualizer.getTotalSize() }}
        >
          {virtualizer.getVirtualItems().map((item) => {
            const key = keys[item.index]!;
            return (
              <div
                key={key}
                role="listitem"
                data-index={item.index}
                ref={virtualizer.measureElement}
                className="absolute inset-x-0 top-0"
                style={{ transform: `translateY(${item.start}px)` }}
              >
                <ThreadRow conversationId={conversationId} rowKey={key} />
              </div>
            );
          })}
        </div>
      </div>
      {showJump && (
        <Button
          size="sm"
          variant="secondary"
          onClick={jump}
          className="absolute bottom-3 start-1/2 -translate-x-1/2 rounded-full shadow-md rtl:translate-x-1/2"
        >
          <ArrowDown data-icon="inline-start" />
          New messages
        </Button>
      )}
    </div>
  );
}

interface ThreadRowProps {
  conversationId: string;
  rowKey: string;
}

function ThreadRow({ conversationId, rowKey }: ThreadRowProps) {
  if (rowKey.startsWith(PENDING_KEY_PREFIX)) {
    return (
      <PendingBubble
        conversationId={conversationId}
        clientMessageId={rowKey.slice(PENDING_KEY_PREFIX.length)}
      />
    );
  }
  const eventId = handoffEventId(rowKey);
  if (eventId !== null) return <HandoffEntry conversationId={conversationId} eventId={eventId} />;
  return <MessageBubble conversationId={conversationId} messageId={rowKey} />;
}
