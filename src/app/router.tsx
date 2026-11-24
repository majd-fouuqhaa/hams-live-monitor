import {
  createRootRoute,
  createRoute,
  createRouter,
  type RouterHistory,
} from "@tanstack/react-router";
import {
  ConversationPane,
  NoConversationSelected,
} from "@/features/conversations/components/ConversationPane";
import { Shell } from "./Shell";

const rootRoute = createRootRoute({ component: Shell });

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: NoConversationSelected,
});

const conversationRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/conversations/$conversationId",
  component: ConversationPane,
});

const routeTree = rootRoute.addChildren([indexRoute, conversationRoute]);

export function createAppRouter({ history }: { history?: RouterHistory } = {}) {
  return createRouter({ routeTree, history, defaultPreload: false });
}

export type AppRouter = ReturnType<typeof createAppRouter>;

declare module "@tanstack/react-router" {
  interface Register {
    router: AppRouter;
  }
}
