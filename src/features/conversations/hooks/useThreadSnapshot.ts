import { useQuery } from "@tanstack/react-query";
import { useConversationsActions, useConversationsApi } from "../context";

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
