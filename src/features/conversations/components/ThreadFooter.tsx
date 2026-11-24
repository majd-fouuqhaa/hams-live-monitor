import { useState } from "react";
import { useConversations } from "../context";
import type { Status } from "../types";
import { Composer } from "./Composer";
import { TakeOverButton } from "./TakeOverButton";

interface ThreadFooterProps {
  conversationId: string;
  status: Status;
}

export function ThreadFooter({ conversationId, status }: ThreadFooterProps) {
  const [tookOver, setTookOver] = useState(false);
  const reason = useConversations((s) => s.list?.handoffs[conversationId]?.at(-1)?.reason);

  return (
    <footer className="border-t p-3">
      {status === "human" && <Composer conversationId={conversationId} autoFocus={tookOver} />}
      {status === "needs_human" && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
          <p className="min-w-0 flex-1 text-start text-sm">
            <span className="font-medium">Needs human</span>
            {" · "}
            {reason ? (
              <bdi>{reason}</bdi>
            ) : (
              <span className="text-muted-foreground">
                Reason not available (handed off before you opened this page)
              </span>
            )}
          </p>
          <TakeOverButton conversationId={conversationId} onTakeOver={() => setTookOver(true)} />
        </div>
      )}
      {status === "ai" && (
        <p className="text-center text-sm text-muted-foreground">
          AI is handling this conversation
        </p>
      )}
      {status === "closed" && (
        <p className="text-center text-sm text-muted-foreground">This conversation is closed</p>
      )}
    </footer>
  );
}
