import { describe, expect, it } from "vite-plus/test";
import {
  applyEvent,
  applyPreviewRefresh,
  loadSnapshot,
  openConversation,
  selectPersisted,
  selectRows,
} from "../model";
import type { Conversation, ServerEvent, Snapshot } from "../types";

const T0 = "2026-11-24T10:00:00.000Z";

function conv(id: string, status: Conversation["status"], extra: Partial<Conversation> = {}) {
  return {
    id,
    customer: `Customer ${id}`,
    status,
    lastMessage: `last ${id}`,
    unread: 0,
    updatedAt: T0,
    ...extra,
  } satisfies Conversation;
}

const NOW = new Date("2026-11-24T10:05:00.000Z");

/** Applies events in order, the way the stream delivers them. */
function apply(state: ReturnType<typeof loadSnapshot>, ...events: ServerEvent[]) {
  return events.reduce((s, e) => applyEvent(s, e, NOW), state);
}

function snapshot(conversations: Conversation[], lastEventId = 10): Snapshot {
  return { lastEventId, conversations };
}

/** The list as the supervisor sees it, top to bottom: `id:status`. */
function layout(state: ReturnType<typeof loadSnapshot>) {
  return selectRows(state).map((r) => `${r.id}:${r.status}`);
}

describe("status changes", () => {
  const start = () =>
    loadSnapshot(snapshot([conv("c-1", "needs_human"), conv("c-2", "ai"), conv("c-3", "ai")]));

  it("stamps a live hand-off with the time it arrived, so it can be highlighted", () => {
    const state = apply(start(), {
      id: 11,
      type: "status",
      conversationId: "c-3",
      status: "needs_human",
    });

    expect(row(state, "c-3")?.handedOffAt).toBe(NOW.toISOString());
    // Rows that were already waiting at load time are not "new".
    expect(row(state, "c-1")?.handedOffAt).toBeUndefined();
  });

  it("forgets the hand-off stamp once someone else handles it", () => {
    const state = apply(
      start(),
      { id: 11, type: "status", conversationId: "c-3", status: "needs_human" },
      { id: 12, type: "status", conversationId: "c-3", status: "human" },
    );

    expect(row(state, "c-3")?.handedOffAt).toBeUndefined();
  });
});

describe("replayed events", () => {
  const status = (id: number, s: Conversation["status"]): ServerEvent => ({
    id,
    type: "status",
    conversationId: "c-1",
    status: s,
  });

  it("ignores events the snapshot already contains", () => {
    const state = apply(loadSnapshot(snapshot([conv("c-1", "ai")], 10)), status(10, "closed"));

    expect(layout(state)).toEqual(["c-1:ai"]);
  });

  it("ignores events it has already applied when the server replays them after a reconnect", () => {
    const state = apply(
      loadSnapshot(snapshot([conv("c-1", "ai")], 10)),
      status(11, "needs_human"),
      status(12, "ai"),
      // reconnect: the server replays from 3 events early, then drops again before resending 12
      status(11, "needs_human"),
    );

    expect(layout(state)).toEqual(["c-1:ai"]);
  });
});

function row(state: ReturnType<typeof loadSnapshot>, id: string) {
  return selectRows(state).find((r) => r.id === id);
}

let nextMessage = 0;
function message(conversationId: string, role: "customer" | "ai" | "human", text: string) {
  return {
    id: `m-${++nextMessage}`,
    conversationId,
    role,
    text,
    createdAt: NOW.toISOString(),
  };
}

describe("new messages", () => {
  it("shows the message as the preview and bumps the time without moving the row", () => {
    const state = apply(loadSnapshot(snapshot([conv("c-1", "ai"), conv("c-2", "ai")])), {
      id: 11,
      type: "message",
      conversationId: "c-2",
      message: message("c-2", "customer", "مرحبا"),
    });

    expect(row(state, "c-2")).toMatchObject({ lastMessage: "مرحبا", updatedAt: NOW.toISOString() });
    expect(layout(state)).toEqual(["c-1:ai", "c-2:ai"]);
  });
});

describe("unread count", () => {
  it("counts new customer messages but not AI or human ones", () => {
    const state = apply(
      loadSnapshot(snapshot([conv("c-1", "ai", { unread: 2 })])),
      { id: 11, type: "message", conversationId: "c-1", message: message("c-1", "customer", "hi") },
      { id: 12, type: "message", conversationId: "c-1", message: message("c-1", "human", "hello") },
      { id: 13, type: "message", conversationId: "c-1", message: message("c-1", "customer", "?") },
    );

    expect(row(state, "c-1")?.unread).toBe(4);
  });

  const customerSays = (id: number, text = "hi"): ServerEvent => ({
    id,
    type: "message",
    conversationId: "c-1",
    message: message("c-1", "customer", text),
  });

  it("counts again once another conversation is opened", () => {
    let state = loadSnapshot(snapshot([conv("c-1", "ai", { unread: 3 }), conv("c-2", "ai")]));
    state = openConversation(state, "c-1");
    state = openConversation(state, "c-2");
    state = apply(state, customerSays(11), customerSays(12));

    expect(row(state, "c-1")?.unread).toBe(2);
  });
});

describe("read state across reloads", () => {
  it("forgets read state when the server was restarted (its event ids went backwards)", () => {
    let state = loadSnapshot(snapshot([conv("c-1", "ai", { unread: 40 })], 500));
    state = openConversation(state, "c-1");
    const saved = selectPersisted(state);

    // The in-memory mock restarted: counters and event ids start over.
    const reloaded = loadSnapshot(snapshot([conv("c-1", "ai", { unread: 2 })], 30), saved);

    expect(row(reloaded, "c-1")?.unread).toBe(2);
  });
});

describe("events for conversations not in the snapshot", () => {
  it("leaves the list untouched", () => {
    const start = loadSnapshot(snapshot([conv("c-1", "ai")]));
    const state = apply(
      start,
      { id: 11, type: "status", conversationId: "c-99", status: "needs_human" },
      {
        id: 12,
        type: "message",
        conversationId: "c-99",
        message: message("c-99", "customer", "hi"),
      },
      { id: 13, type: "message_start", conversationId: "c-99", messageId: "m-x", role: "ai" },
      { id: 14, type: "token", conversationId: "c-99", messageId: "m-x", text: "a" },
      { id: 15, type: "message_end", conversationId: "c-99", messageId: "m-x" },
    );

    expect(selectRows(state)).toEqual(selectRows(start));
  });
});

describe("a reply whose start was missed (it began before the page loaded)", () => {
  const start = () => loadSnapshot(snapshot([conv("c-1", "ai"), conv("c-2", "ai")]));
  const token = (id: number, conversationId = "c-1"): ServerEvent => ({
    id,
    type: "token",
    conversationId,
    messageId: `m-${conversationId}`,
    text: " tail",
  });
  const end = (id: number, conversationId = "c-1"): ServerEvent => ({
    id,
    type: "message_end",
    conversationId,
    messageId: `m-${conversationId}`,
  });
  const row = (state: ReturnType<typeof start>, id: string) => state.byId[id]!;

  it("shows that the AI is replying, but never uses the reply's tail as the preview", () => {
    let state = apply(start(), token(11));
    expect(row(state, "c-1").typing).toBe(true);

    state = apply(state, end(12));
    expect(row(state, "c-1").typing).toBe(false);
    expect(row(state, "c-1").lastMessage).toBe("last c-1");
    expect(state.stalePreviews).toEqual({ "c-1": 12 });
  });

  it("takes the finished text from a loaded thread when it has it", () => {
    const state = applyEvent(start(), end(11), NOW, () => "The whole reply");

    expect(row(state, "c-1").lastMessage).toBe("The whole reply");
    expect(state.stalePreviews).toEqual({});
  });

  it("never moves a refreshed preview back when the stream catches up with older events", () => {
    // The refresh is ahead of the stream: it already shows the message from event 15.
    let state = applyPreviewRefresh(
      apply(start(), end(11)),
      snapshot([conv("c-1", "ai", { lastMessage: "newest" }), conv("c-2", "ai")], 15),
    );

    state = apply(state, {
      id: 12,
      type: "message",
      conversationId: "c-1",
      message: {
        id: "m-12",
        conversationId: "c-1",
        role: "customer",
        text: "older",
        createdAt: T0,
      },
    });

    expect(row(state, "c-1").lastMessage).toBe("newest");
    // Everything else about the event still applies.
    expect(row(state, "c-1").unread).toBe(1);
  });
});
