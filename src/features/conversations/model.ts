import { produce } from "immer";
import type {
  ListState,
  PersistedReadState,
  RowView,
  ServerEvent,
  Snapshot,
  ThreadState,
} from "./types";

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
    handoffs: {},
    createdBy: {},
    previewEventId: {},
    stalePreviews: {},
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

/** Looks up a message's text in a loaded thread, for previews the list could not build itself. */
export type ThreadText = (conversationId: string, messageId: string) => string | undefined;

export function applyEvent(
  state: ListState,
  event: ServerEvent,
  now: Date,
  threadText: ThreadText = () => undefined,
): ListState {
  // The server replays from 3 events early on every (re)connect; anything at or below what we have is old.
  if (event.id <= state.lastEventId) return state;
  return produce(state, (draft) => {
    draft.lastEventId = event.id;
    const conversation = draft.byId[event.conversationId];
    if (!conversation) {
      // The mock never creates conversations; a real backend would need a creation event (ADR 0001).
      if (import.meta.env.DEV) console.warn(`Event ${event.id} for unknown conversation`, event);
      return;
    }
    const id = conversation.id;
    switch (event.type) {
      case "status": {
        if (conversation.status === event.status) break;
        // The row stays where it is; a live hand-off is only stamped so the UI can highlight it.
        if (event.status === "needs_human") conversation.handedOffAt = now.toISOString();
        else delete conversation.handedOffAt;
        conversation.status = event.status;
        // The server bumps updatedAt on a status change too (setStatus); receive time stands in for it.
        conversation.updatedAt = now.toISOString();
        break;
      }
      case "message": {
        draft.createdBy[event.message.id] = event.id;
        setPreview(draft, id, event.message.text, event.id);
        // Mirrors the server, which only counts customer messages.
        if (event.message.role === "customer") {
          draft.serverUnread[id] = (draft.serverUnread[id] ?? 0) + 1;
          syncUnread(draft, id);
        }
        // Events carry no timestamp; receive time is close enough (ADR 0006).
        conversation.updatedAt = now.toISOString();
        break;
      }
      case "message_start": {
        draft.createdBy[event.messageId] = event.id;
        conversation.typing = true;
        draft.drafts[event.messageId] = "";
        break;
      }
      case "token": {
        // Only a reply whose start we saw has a draft. One that began before the page loaded still proves
        // the AI is replying, but its tail alone must never become the preview (ADR 0007).
        if (event.messageId in draft.drafts) draft.drafts[event.messageId] += event.text;
        else conversation.typing = true;
        break;
      }
      case "message_end": {
        conversation.typing = false;
        conversation.updatedAt = now.toISOString();
        const text = draft.drafts[event.messageId] ?? threadText(id, event.messageId);
        delete draft.drafts[event.messageId];
        if (text !== undefined) setPreview(draft, id, text, event.id);
        // Only worth a refresh if no newer preview is already showing.
        else if (event.id > (draft.previewEventId[id] ?? 0)) draft.stalePreviews[id] = event.id;
        break;
      }
      case "tool_call": {
        const reason = event.args.reason;
        if (event.name !== "transfer_to_human" || typeof reason !== "string") break;
        (draft.handoffs[id] ??= []).push({
          eventId: event.id,
          reason,
          receivedAt: now.toISOString(),
        });
        break;
      }
    }
  });
}

/** Sets a row's preview, unless a newer one is already showing (a refresh can be ahead of the stream). */
function setPreview(state: ListState, id: string, text: string, eventId: number) {
  const row = state.byId[id];
  if (!row || eventId < (state.previewEventId[id] ?? 0)) return;
  row.lastMessage = text;
  state.previewEventId[id] = eventId;
  delete state.stalePreviews[id];
}

/**
 * Fills previews the stream could not (a reply whose start we missed) from a fresh GET /conversations.
 * A reply that ended after the snapshot was taken keeps waiting for the next refresh; a row whose
 * preview changed after the snapshot keeps it.
 */
export function applyPreviewRefresh(state: ListState, snapshot: Snapshot): ListState {
  return produce(state, (draft) => {
    for (const [id, endedAt] of Object.entries(draft.stalePreviews)) {
      if (snapshot.lastEventId < endedAt) continue;
      const fresh = snapshot.conversations.find((c) => c.id === id);
      if (fresh) setPreview(draft, id, fresh.lastMessage, snapshot.lastEventId);
      delete draft.stalePreviews[id];
    }
  });
}

/** The refetch failed: the old previews stay until the next message replaces them. */
export function dropStalePreviews(state: ListState): ListState {
  return produce(state, (draft) => {
    draft.stalePreviews = {};
  });
}

/**
 * A thread just loaded, at the same event as the list: its reply in progress, if any, is the truth for
 * the row's "AI is replying" (the list may have missed the reply's start).
 */
export function syncTypingFromThread(state: ListState, thread: ThreadState): ListState {
  const streaming = thread.order.some((key) => thread.byId[key]?.streaming === true);
  const row = state.byId[thread.conversationId];
  if (!row || row.typing === streaming) return state;
  return produce(state, (draft) => {
    draft.byId[thread.conversationId]!.typing = streaming;
  });
}
