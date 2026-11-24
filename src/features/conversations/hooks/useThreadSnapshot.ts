import { useQuery } from "@tanstack/react-query";
import { useConversationsActions, useConversationsApi } from "../context";

/**
 * Loads a thread once; the stream keeps it live after that (ADR 0007). The query tracks only the request
 * (loading, error, Retry, cancel) and keeps just the snapshot's event id: the messages live in the store.
 */
export function useThreadSnapshot(conversationId: string) {
  const { beginThreadFetch, receiveThread, failThreadFetch } = useConversationsActions();
  const api = useConversationsApi();

  return useQuery({
    queryKey: ["thread", conversationId],
    queryFn: async ({ signal }) => {
      // Hold this conversation's events first, so none fall between the snapshot and the stream.
      const fetchId = beginThreadFetch(conversationId);
      try {
        const snapshot = await api.getMessages(conversationId, signal);
        receiveThread(conversationId, snapshot, fetchId);
        return snapshot.lastEventId;
      } catch (error) {
        failThreadFetch(conversationId, fetchId);
        throw error;
      }
    },
    staleTime: Infinity,
    gcTime: Infinity,
  });
}
