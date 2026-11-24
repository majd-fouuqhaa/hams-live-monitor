import { createContext, useContext } from "react";
import { useStore } from "zustand";
import type {
  Api,
  Conversations,
  ConversationsActions,
  ConversationsState,
  ConversationsStore,
} from "./types";

export const ConversationsContext = createContext<Conversations | null>(null);

function useConversationsContext(): Conversations {
  const conversations = useContext(ConversationsContext);
  if (!conversations)
    throw new Error("Conversations hooks must be used inside ConversationsContext");
  return conversations;
}

/** The raw data store, for imperative subscriptions. Prefer `useConversations` for rendering. */
export function useConversationsStore(): ConversationsStore {
  return useConversationsContext().store;
}

/** Stable across renders: the actions never change, so they don't need a selector. */
export function useConversationsActions(): ConversationsActions {
  return useConversationsContext().actions;
}

export function useConversations<T>(selector: (state: ConversationsState) => T): T {
  return useStore(useConversationsStore(), selector);
}

/** The REST client, for hooks that track a request in react-query. */
export function useConversationsApi(): Api {
  return useConversationsContext().api;
}
