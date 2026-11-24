import { SendHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useConversations, useConversationsActions } from "../context";

interface ComposerProps {
  conversationId: string;
  /** Focus the input on mount, e.g. right after taking over. */
  autoFocus?: boolean;
}

export function Composer({ conversationId, autoFocus }: ComposerProps) {
  const { setReplyDraft, send } = useConversationsActions();
  const draft = useConversations((s) => s.replyDrafts[conversationId] ?? "");
  const error = useConversations((s) => s.sendErrors[conversationId]);
  // A reply needs a loaded thread to show in; typing is fine while it loads.
  const loaded = useConversations((s) => s.threads[conversationId]?.loaded ?? false);
  const canSend = loaded && draft.trim().length > 0;

  const submit = (e: React.SubmitEvent) => {
    e.preventDefault();
    if (canSend) send(conversationId);
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      <div className="flex items-end gap-2">
        <Textarea
          aria-label="Reply"
          placeholder="Write a reply…"
          dir="auto"
          rows={1}
          autoFocus={autoFocus}
          value={draft}
          onChange={(e) => setReplyDraft(conversationId, e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
            e.preventDefault();
            if (canSend) send(conversationId);
          }}
          className="max-h-32 min-h-9 resize-none"
        />
        <Button type="submit" size="icon-lg" disabled={!canSend} aria-label="Send">
          <SendHorizontal className="rtl:-scale-x-100" />
        </Button>
      </div>
    </form>
  );
}
