// The thread reducer: one conversation's messages, kept live from its snapshot onward (ADR 0007).
// Pure: no React, no network. The list reducer (model.ts) runs beside it on every event.
import { produce } from "immer";
import type {
  Handoff,
  Message,
  PendingReply,
  ServerEvent,
  ThreadSnapshot,
  ThreadState,
} from "./types";

const HANDOFF_KEY_PREFIX = "handoff:";

export const handoffKey = (eventId: number) => `${HANDOFF_KEY_PREFIX}${eventId}`;

/** The hand-off event id behind an `order` key, or null for a message id. */
export function handoffEventId(key: string): number | null {
  return key.startsWith(HANDOFF_KEY_PREFIX) ? Number(key.slice(HANDOFF_KEY_PREFIX.length)) : null;
}

/** A thread whose snapshot request is in flight: its events are held until the snapshot lands. */
export function emptyThread(conversationId: string): ThreadState {
  return {
    conversationId,
    loaded: false,
    lastEventId: 0,
    order: [],
    byId: {},
    pending: [],
    buffer: [],
    waiting: null,
    outOfSync: false,
  };
}

/** Starts (or restarts, for Retry) a fetch: events are held from now on so none fall between. */
export function beginFetch(thread: ThreadState | undefined, conversationId: string): ThreadState {
  if (!thread) return emptyThread(conversationId);
  return thread.buffer ? thread : { ...thread, buffer: [] };
}

/**
 * Replaces the thread with its snapshot, places hand-offs we saw before it, then replays the held events.
 * Pending replies survive: they are still waiting for their echo.
 *
 * @param handoffs every hand-off the list saw for this conversation
 * @param createdBy the event that created each message the list saw created
 */
export function loadThread(
  thread: ThreadState,
  snapshot: ThreadSnapshot,
  handoffs: readonly Handoff[],
  createdBy: Readonly<Record<string, number>>,
  now: Date,
): ThreadState {
  // Hand-offs after the snapshot come back through the held events, in order.
  const earlier = handoffs.filter((h) => h.eventId <= snapshot.lastEventId);
  const order: string[] = [];
  const byId: Record<string, Message> = {};
  let next = 0;
  for (const message of snapshot.messages) {
    // A message with no known creating event predates the list snapshot, so every hand-off we saw is newer.
    const createdAt = createdBy[message.id] ?? 0;
    while (next < earlier.length && earlier[next]!.eventId < createdAt) {
      order.push(handoffKey(earlier[next++]!.eventId));
    }
    order.push(message.id);
    byId[message.id] = message;
  }
  while (next < earlier.length) order.push(handoffKey(earlier[next++]!.eventId));

  const pending = thread.pending.filter(
    (p) => !snapshot.messages.some((m) => m.clientMessageId === p.clientMessageId),
  );
  const loaded: ThreadState = {
    conversationId: thread.conversationId,
    loaded: true,
    lastEventId: snapshot.lastEventId,
    order,
    byId,
    pending,
    buffer: null,
    waiting: null,
    outOfSync: false,
  };
  return (thread.buffer ?? []).reduce((t, e) => applyThreadEvent(t, e, now), loaded);
}

/** The fetch failed: a loaded thread applies what it held and stays live; a new one has nothing to keep. */
export function abandonFetch(thread: ThreadState, now: Date): ThreadState | undefined {
  if (!thread.loaded) return undefined;
  const live: ThreadState = { ...thread, buffer: null, waiting: null };
  return (thread.buffer ?? []).reduce((t, e) => applyThreadEvent(t, e, now), live);
}

export function applyThreadEvent(thread: ThreadState, event: ServerEvent, now: Date): ThreadState {
  if (thread.buffer) return { ...thread, buffer: [...thread.buffer, event] };
  // Already in the snapshot, or a replayed event we applied before.
  if (event.id <= thread.lastEventId) return thread;

  return produce(thread, (draft) => {
    draft.lastEventId = event.id;
    switch (event.type) {
      case "message": {
        const { message } = event;
        const existing = draft.byId[message.id];
        if (existing) {
          if (existing.text !== message.text) draft.outOfSync = true;
          break;
        }
        draft.byId[message.id] = message;
        draft.order.push(message.id);
        // The echo of our own reply: the real message takes the pending one's place, in event order.
        if (message.clientMessageId) {
          draft.pending = draft.pending.filter(
            (p) => p.clientMessageId !== message.clientMessageId,
          );
        }
        break;
      }
      case "message_start": {
        if (draft.byId[event.messageId]) {
          draft.outOfSync = true;
          break;
        }
        draft.byId[event.messageId] = {
          id: event.messageId,
          conversationId: event.conversationId,
          role: event.role,
          text: "",
          createdAt: now.toISOString(),
          streaming: true,
        };
        draft.order.push(event.messageId);
        break;
      }
      case "token": {
        // The snapshot includes replies still streaming, so an unknown message means we lost track.
        const message = draft.byId[event.messageId];
        if (message) message.text += event.text;
        else draft.outOfSync = true;
        break;
      }
      case "message_end": {
        const message = draft.byId[event.messageId];
        if (message) delete message.streaming;
        else draft.outOfSync = true;
        break;
      }
      case "tool_call": {
        if (event.name === "transfer_to_human") draft.order.push(handoffKey(event.id));
        break;
      }
      case "status":
        break;
    }
  });
}

export function addPending(thread: ThreadState, reply: PendingReply): ThreadState {
  return { ...thread, pending: [...thread.pending, reply] };
}

/** The server answered 201. The echo, not the response, places the message (it has the event id). */
export function markSent(thread: ThreadState, clientMessageId: string): ThreadState {
  if (!thread.pending.some((p) => p.clientMessageId === clientMessageId)) return thread;
  return {
    ...thread,
    pending: thread.pending.map((p) =>
      p.clientMessageId === clientMessageId ? { ...p, state: "sent" } : p,
    ),
  };
}

export function removePending(thread: ThreadState, clientMessageId: string): ThreadState {
  return {
    ...thread,
    pending: thread.pending.filter((p) => p.clientMessageId !== clientMessageId),
  };
}
