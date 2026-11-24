import { LoaderCircleIcon, WifiOffIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConversations, useConversationsActions } from "../context";

export function ConnectionBanner() {
  const connection = useConversations((s) => s.connection);
  const { reconnect } = useConversationsActions();

  if (connection === "reconnecting") {
    return (
      <div className="m-2 flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-900">
        <LoaderCircleIcon
          aria-hidden
          className="mt-0.5 size-3.5 shrink-0 motion-safe:animate-spin"
        />
        <div className="flex flex-col gap-0.5">
          <p className="font-medium">Connection lost. Reconnecting…</p>
          <p>Live updates are paused. What you see may be out of date.</p>
        </div>
      </div>
    );
  }

  if (connection === "disconnected") {
    return (
      <div className="m-2 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
        <WifiOffIcon aria-hidden className="mt-0.5 size-3.5 shrink-0" />
        <div className="flex flex-1 flex-col gap-0.5">
          <p className="font-medium">Disconnected.</p>
          <p>Live updates have stopped. What you see may be out of date.</p>
        </div>
        <Button size="xs" variant="outline" onClick={reconnect} className="shrink-0">
          Reconnect
        </Button>
      </div>
    );
  }

  return null;
}
