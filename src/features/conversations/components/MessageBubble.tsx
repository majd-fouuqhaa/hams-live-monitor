import { cn } from "cn";
import { memo } from "react";
import { formatLong, formatShort, useNow } from "@/utils/relative-time";
import { useConversations } from "../context";
import type { Message } from "../types";
import { TypingDots } from "./TypingDots";

const ROLE_LABEL: Record<Message["role"], string | null> = {
  customer: null,
  ai: "AI",
  human: "You",
};

interface MessageBubbleProps {
  conversationId: string;
  messageId: string;
}

export const MessageBubble = memo(function MessageBubble({
  conversationId,
  messageId,
}: MessageBubbleProps) {
  const message = useConversations((s) => s.threads[conversationId]?.byId[messageId]);
  if (!message) return null;
  return (
    <Bubble role={message.role} text={message.text} createdAt={message.createdAt}>
      {message.streaming && (
        <span className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
          <TypingDots />
          <span>Replying</span>
        </span>
      )}
    </Bubble>
  );
});

interface BubbleProps {
  role: Message["role"];
  text: string;
  /** Omitted while a reply is still being sent. */
  createdAt?: string;
  /** Extra status line under the text. */
  children?: React.ReactNode;
  className?: string;
}

/** Customer on the inline-start side, the AI and the supervisor on the inline-end side. */
export function Bubble({ role, text, createdAt, children, className }: BubbleProps) {
  const now = useNow();
  const label = ROLE_LABEL[role];
  return (
    <div className={cn("flex px-4 py-1", role === "customer" ? "justify-start" : "justify-end")}>
      <div
        className={cn(
          "flex max-w-[min(75%,40rem)] flex-col rounded-2xl px-3 py-2 text-sm",
          role === "customer" && "bg-muted",
          role === "ai" && "border bg-background",
          role === "human" && "bg-primary text-primary-foreground",
          className,
        )}
      >
        <span className="flex items-baseline gap-2 text-xs opacity-70">
          {label && <span className="font-medium">{label}</span>}
          {createdAt && (
            <time dateTime={createdAt} title={formatLong(createdAt, now)}>
              {formatShort(createdAt, now)}
            </time>
          )}
        </span>
        <p className="text-start break-words whitespace-pre-wrap">
          <bdi>{text}</bdi>
        </p>
        {children}
      </div>
    </div>
  );
}
