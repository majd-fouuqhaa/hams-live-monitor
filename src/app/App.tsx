import { DirectionProvider } from "@base-ui/react/direction-provider";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { ConversationsContext } from "@/features/conversations/context";
import type { Conversations } from "@/features/conversations/types";
import { useDirection } from "@/hooks/use-direction";
import type { AppRouter } from "./router";

interface AppProps {
  router: AppRouter;
  queryClient: QueryClient;
  conversations: Conversations;
}

export function App({ router, queryClient, conversations }: AppProps) {
  // Base UI positions popups (tooltips, the mobile sheet) by this, not by <html dir>.
  const direction = useDirection();
  return (
    <DirectionProvider direction={direction}>
      <QueryClientProvider client={queryClient}>
        <ConversationsContext value={conversations}>
          <RouterProvider router={router} />
        </ConversationsContext>
      </QueryClientProvider>
    </DirectionProvider>
  );
}
