import { describe, expect, it } from "vite-plus/test";
import { applyThreadEvent, beginFetch, emptyThread, handoffKey, loadThread } from "../thread";
import type { Handoff, Message, ServerEvent, ThreadSnapshot, ThreadState } from "../types";

const NOW = new Date("2026-11-24T10:05:00.000Z");
const C = "c-1";

const msg = (id: string, text: string, extra: Partial<Message> = {}): Message => ({
  id,
  conversationId: C,
  role: "customer",
  text,
  createdAt: "2026-11-24T10:00:00.000Z",
  ...extra,
});

const ev = {
  message: (id: number, message: Message): ServerEvent => ({
    id,
    type: "message",
    conversationId: C,
    message,
  }),
  start: (id: number, messageId: string): ServerEvent => ({
    id,
    type: "message_start",
    conversationId: C,
    messageId,
    role: "ai",
  }),
  token: (id: number, messageId: string, text: string): ServerEvent => ({
    id,
    type: "token",
    conversationId: C,
    messageId,
    text,
  }),
  end: (id: number, messageId: string): ServerEvent => ({
    id,
    type: "message_end",
    conversationId: C,
    messageId,
  }),
  handoff: (id: number, reason = "Refund above limit"): ServerEvent => ({
    id,
    type: "tool_call",
    conversationId: C,
    name: "transfer_to_human",
    args: { reason },
  }),
};

const handoff = (eventId: number): Handoff => ({
  eventId,
  reason: "Refund above limit",
  receivedAt: NOW.toISOString(),
});

/** Loads a snapshot into a thread whose fetch just started, then applies live events in order. */
function load(
  snapshot: ThreadSnapshot,
  {
    handoffs = [],
    createdBy = {},
  }: { handoffs?: Handoff[]; createdBy?: Record<string, number> } = {},
  ...live: ServerEvent[]
): ThreadState {
  const loaded = loadThread(emptyThread(C), snapshot, handoffs, createdBy, NOW);
  return live.reduce((t, e) => applyThreadEvent(t, e, NOW), loaded);
}

const texts = (t: ThreadState) => t.order.map((key) => t.byId[key]?.text ?? key);

describe("streaming a reply", () => {
  it("continues a reply the snapshot caught mid-stream, without repeating the words it already has", () => {
    const snapshot = {
      lastEventId: 12,
      messages: [msg("m-2", "Your order", { role: "ai", streaming: true })],
    };

    // The server replays from 3 events early: tokens 11 and 12 are already in the snapshot's text.
    const thread = load(
      snapshot,
      {},
      ev.token(11, "m-2", "Your"),
      ev.token(12, "m-2", " order"),
      ev.token(13, "m-2", " shipped"),
      ev.end(14, "m-2"),
    );

    expect(texts(thread)).toEqual(["Your order shipped"]);
  });
});

describe("duplicate events after a resume", () => {
  it("applies each event once, however often the server replays it", () => {
    const words = [ev.start(11, "m-2"), ev.token(12, "m-2", "On"), ev.token(13, "m-2", " its way")];

    const thread = load(
      { lastEventId: 10, messages: [] },
      {},
      ...words,
      ...words, // replayed after a reconnect
      ev.token(14, "m-2", " now"),
    );

    expect(texts(thread)).toEqual(["On its way now"]);
  });

  it("keeps events that arrive while the thread loads, skipping those the snapshot has", () => {
    let thread = beginFetch(undefined, C);
    thread = applyThreadEvent(thread, ev.message(10, msg("m-1", "Hi")), NOW); // already in the snapshot
    thread = applyThreadEvent(thread, ev.message(11, msg("m-2", "Anyone?")), NOW);

    const loaded = loadThread(
      thread,
      { lastEventId: 10, messages: [msg("m-1", "Hi")] },
      [],
      {},
      NOW,
    );

    expect(texts(loaded)).toEqual(["Hi", "Anyone?"]);
  });
});

describe("hand-off", () => {
  it("appears at its place in a thread that is already open", () => {
    const thread = load(
      { lastEventId: 10, messages: [msg("m-1", "Refund please")] },
      {},
      ev.handoff(11),
      ev.message(12, msg("m-2", "Hello?")),
    );

    expect(texts(thread)).toEqual(["Refund please", handoffKey(11), "Hello?"]);
  });

  it("is placed by event id in a thread opened after it happened", () => {
    // m-1 predates the page (no creating event seen); m-2 and m-3 were created by events 12 and 14.
    const thread = load(
      {
        lastEventId: 20,
        messages: [msg("m-1", "Hi"), msg("m-2", "Refund please"), msg("m-3", "Hello?")],
      },
      { handoffs: [handoff(13)], createdBy: { "m-2": 12, "m-3": 14 } },
    );

    expect(texts(thread)).toEqual(["Hi", "Refund please", handoffKey(13), "Hello?"]);
  });

  it("appears once when it arrives during the load and is also known to the list", () => {
    let thread = beginFetch(undefined, C);
    thread = applyThreadEvent(thread, ev.handoff(11), NOW);
    thread = applyThreadEvent(thread, ev.handoff(13), NOW);

    const loaded = loadThread(
      thread,
      { lastEventId: 12, messages: [msg("m-1", "Hi")] },
      [handoff(11), handoff(13)],
      {},
      NOW,
    );

    expect(texts(loaded)).toEqual(["Hi", handoffKey(11), handoffKey(13)]);
  });
});

describe("out of sync", () => {
  it("is flagged when a word arrives for a reply the thread does not have", () => {
    const thread = load({ lastEventId: 10, messages: [] }, {}, ev.token(11, "m-9", "lost"));

    expect(thread.outOfSync).toBe(true);
  });
});
