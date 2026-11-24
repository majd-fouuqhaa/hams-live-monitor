import { QueryClient } from "@tanstack/react-query";
import { createMemoryHistory } from "@tanstack/react-router";
import { createRoot } from "react-dom/client";
import { afterEach } from "vite-plus/test";
import { App } from "@/app/App";
import { createAppRouter } from "@/app/router";
import { config } from "@/config";
import { createApi } from "@/features/conversations/api";
import { connectEvents } from "@/features/conversations/events";
import { createConversations } from "@/features/conversations/store";

const cleanups: (() => void)[] = [];
afterEach(() => {
  cleanups.splice(0).forEach((fn) => fn());
  localStorage.clear();
});

interface RenderAppOptions {
  path?: string;
  /** Wait before the stream reopens after a drop. Short by default, so tests don't wait 3 s. */
  retryMs?: number;
}

/** Renders the whole app at `path`, wired to `config.apiUrl` (mocked by MSW in tests). */
export function renderApp({ path = "/", retryMs = 10 }: RenderAppOptions = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let close = () => {};

  const conversations = createConversations({
    connect: (options) => {
      const connection = connectEvents({ ...options, baseUrl: config.apiUrl, retryMs });
      close = () => connection.close();
      return connection;
    },
    storage: localStorage,
    api: createApi(config.apiUrl),
  });

  const router = createAppRouter({ history: createMemoryHistory({ initialEntries: [path] }) });

  const container = document.createElement("div");
  document.body.append(container);

  const root = createRoot(container);
  root.render(<App router={router} queryClient={queryClient} conversations={conversations} />);

  cleanups.push(() => {
    root.unmount();
    container.remove();
    close();
  });

  return { router, ...conversations };
}
