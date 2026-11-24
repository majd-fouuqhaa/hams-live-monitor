import { useQuery } from "@tanstack/react-query";
import { config } from "@/config";
import { useConversationsActions } from "../context";
import { SnapshotSchema } from "../schemas";

/** Loads GET /conversations (ADR 0001). The query only tracks the request: loading, error, retry. */
export function useConversationsSnapshot() {
  const { start, receiveSnapshot } = useConversationsActions();

  return useQuery({
    queryKey: ["conversations", "snapshot"],
    queryFn: async ({ signal }) => {
      start();
      const res = await fetch(`${config.apiUrl}/conversations`, { signal });

      if (!res.ok) throw new Error(`GET /conversations failed with ${res.status}`);

      const snapshot = SnapshotSchema.parse(await res.json());
      receiveSnapshot(snapshot);
      return snapshot;
    },
    staleTime: Infinity,
  });
}
