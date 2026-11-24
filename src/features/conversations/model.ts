import { produce } from "immer";
import type { ListState, PersistedReadState, RowView, ServerEvent, Snapshot } from "./types";

/** Recomputes the displayed unread count from the server counter and the read baseline. */
function syncUnread(state: ListState, id: string) {
  const row = state.byId[id];
  if (!row) return;
  const server = state.serverUnread[id] ?? 0;
  if (id === state.openId) state.baselines[id] = server;
  const unread = Math.max(0, server - (state.baselines[id] ?? 0));
  if (row.unread !== unread) row.unread = unread;
}

export function loadSnapshot(snapshot: Snapshot, persisted?: PersistedReadState): ListState {
  const serverRestarted = !persisted || snapshot.lastEventId < persisted.lastEventId;
  const state: ListState = {
    byId: {},
    order: [],
    lastEventId: snapshot.lastEventId,
    drafts: {},
    serverUnread: {},
    baselines: serverRestarted ? {} : { ...persisted.baselines },
    openId: null,
  };
  for (const c of snapshot.conversations) {
    state.byId[c.id] = { ...c, typing: false };
    state.order.push(c.id);
    state.serverUnread[c.id] = c.unread;
    syncUnread(state, c.id);
  }
  return state;
}

export function selectPersisted(state: ListState): PersistedReadState {
  return { baselines: state.baselines, lastEventId: state.lastEventId };
}

/** Marks a conversation as the one on screen (null = none). It counts as read until another is opened. */
export function openConversation(state: ListState, id: string | null): ListState {
  return produce(state, (draft) => {
    draft.openId = id;
    if (id) syncUnread(draft, id);
  });
}

/** The rows top to bottom. */
export function selectRows(state: Pick<ListState, "order" | "byId">): RowView[] {
  return state.order.map((id) => state.byId[id]!);
}

export function applyEvent(state: ListState, event: ServerEvent, now: Date): ListState {
  // The server replays from 3 events early on every (re)connect; anything at or below what we have is old.
  if (event.id <= state.lastEventId) return state;
  return produce(state, (draft) => {
    draft.lastEventId = event.id;
    if (event.type === "token") {
      draft.drafts[event.messageId] = (draft.drafts[event.messageId] ?? "") + event.text;
      return;
    }
    const conversation = draft.byId[event.conversationId];
    if (!conversation) {
      // The mock never creates conversations; a real backend would need a creation event (ADR 0001).
      if (import.meta.env.DEV) console.warn(`Event ${event.id} for unknown conversation`, event);
      return;
    }
    switch (event.type) {
      case "status": {
        if (conversation.status === event.status) break;
        // The row stays where it is; a live hand-off is only stamped so the UI can highlight it.
        if (event.status === "needs_human") conversation.handedOffAt = now.toISOString();
        else delete conversation.handedOffAt;
        conversation.status = event.status;
        break;
      }
      case "message": {
        conversation.lastMessage = event.message.text;
        // Mirrors the server, which only counts customer messages.
        if (event.message.role === "customer") {
          draft.serverUnread[conversation.id] = (draft.serverUnread[conversation.id] ?? 0) + 1;
          syncUnread(draft, conversation.id);
        }
        // Events carry no timestamp; receive time is close enough (ADR 0006).
        conversation.updatedAt = now.toISOString();
        break;
      }
      case "message_start": {
        conversation.typing = true;
        draft.drafts[event.messageId] = "";
        break;
      }
      case "message_end": {
        conversation.typing = false;
        conversation.lastMessage = draft.drafts[event.messageId] ?? conversation.lastMessage;
        conversation.updatedAt = now.toISOString();
        delete draft.drafts[event.messageId];
        break;
      }
    }
  });
}
