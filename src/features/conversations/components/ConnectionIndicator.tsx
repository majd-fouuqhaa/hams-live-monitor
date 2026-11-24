import { cn } from "cn";
import { CONNECTION_LABEL } from "../constants";
import { useConversations } from "../context";
import type { ConnectionState } from "../types";

const DOT_CLASS: Record<ConnectionState, string> = {
  connecting: "bg-amber-500 motion-safe:animate-pulse",
  live: "bg-emerald-500",
  reconnecting: "bg-amber-500 motion-safe:animate-pulse",
  disconnected: "bg-destructive",
};

export function ConnectionIndicator() {
  const connection = useConversations((s) => s.connection);

  return (
    <p
      role="status"
      aria-label="Connection"
      className="flex items-center gap-1.5 text-xs text-muted-foreground"
    >
      <span aria-hidden className={cn("size-1.5 rounded-full", DOT_CLASS[connection])} />
      {CONNECTION_LABEL[connection]}
    </p>
  );
}
