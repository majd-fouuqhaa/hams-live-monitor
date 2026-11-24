import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useConversationsApi } from "../context";

interface TakeOverButtonProps {
  conversationId: string;
  /** Called on click: the status event that swaps in the composer can arrive before the response. */
  onTakeOver: () => void;
}

export function TakeOverButton({ conversationId, onTakeOver }: TakeOverButtonProps) {
  const api = useConversationsApi();
  const takeOver = useMutation({
    mutationFn: () => api.takeOver(conversationId),
  });
  const busy = takeOver.isPending || takeOver.isSuccess;

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        onClick={() => {
          onTakeOver();
          takeOver.mutate();
        }}
        disabled={busy}
      >
        {busy ? "Taking over…" : "Take over"}
      </Button>
      {takeOver.isError && (
        <p role="alert" className="text-xs text-destructive">
          Couldn't take over: {takeOver.error.message}
        </p>
      )}
    </div>
  );
}
