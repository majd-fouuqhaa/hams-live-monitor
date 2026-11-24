import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { ConversationsContext } from "@/features/conversations/context";
import type { Conversations } from "@/features/conversations/types";
import type { AppRouter } from "./router";

interface AppProps {
  router: AppRouter;
  queryClient: QueryClient;
  conversations: Conversations;
}

export function App({ router, queryClient, conversations }: AppProps) {
  return (
    <QueryClientProvider client={queryClient}>
      <ConversationsContext value={conversations}>
        <RouterProvider router={router} />
      </ConversationsContext>
    </QueryClientProvider>
  );
}
