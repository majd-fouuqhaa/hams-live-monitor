import { QueryClient } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { App } from "./app/App";
import { createAppRouter } from "./app/router";
import { config } from "./config";
import { createApi } from "./features/conversations/api";
import { connectEvents } from "./features/conversations/events";
import { createConversations } from "./features/conversations/store";
import { applySavedDirection } from "./hooks/use-direction";

const queryClient = new QueryClient();
const router = createAppRouter();
const conversations = createConversations({
  connect: (options) => connectEvents({ ...options, baseUrl: config.apiUrl }),
  storage: localStorage,
  api: createApi(config.apiUrl),
});

applySavedDirection();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App router={router} queryClient={queryClient} conversations={conversations} />
  </StrictMode>,
);
