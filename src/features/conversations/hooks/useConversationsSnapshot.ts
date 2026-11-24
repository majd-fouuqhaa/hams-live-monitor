import { useQuery } from "@tanstack/react-query";
import { useConversationsActions, useConversationsApi } from "../context";

/** Loads GET /conversations (ADR 0001). The query only tracks the request: loading, error, retry. */
export function useConversationsSnapshot() {
  const { receiveSnapshot } = useConversationsActions();
  const api = useConversationsApi();

  return useQuery({
    queryKey: ["conversations", "snapshot"],
    queryFn: async ({ signal }) => {
      const snapshot = await api.getConversations(signal);
      receiveSnapshot(snapshot);
      return snapshot;
    },
    staleTime: Infinity,
  });
}
