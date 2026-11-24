import { describe, expect, it } from "vite-plus/test";
import { selectRows } from "../model";
import { createConversations } from "../store";
import type {
  Api,
  ConnectEventsOptions,
  Conversation,
  ConversationsStoreDeps,
  EventsConnection,
  Message,
  ServerEvent,
  Snapshot,
} from "../types";

const conv = (id: string, status: Conversation["status"], unread = 0): Conversation => ({
  id,
  customer: `Customer ${id}`,
  status,
  lastMessage: `last ${id}`,
  unread,
  updatedAt: "2026-11-24T10:00:00.000Z",
});

const status = (id: number, conversationId: string, s: Conversation["status"]): ServerEvent => ({
  id,
  type: "status",
  conversationId,
  status: s,
});

/** A stand-in for the live stream that the test drives by hand. */
function fakeStream() {
  type Options = Parameters<ConversationsStoreDeps["connect"]>[0];
  let options: Options | undefined;
  const calls = { connect: 0, reconnect: 0, close: 0 };
  const connect = (o: Options): EventsConnection => {
    calls.connect++;
    options = o;
    return { reconnect: () => calls.reconnect++, close: () => calls.close++ };
  };
  return {
    connect,
    calls,
    /** Where the stream would resume from now. */
    since: () => options!.since(),
    emit: (...events: ServerEvent[]) => events.forEach((e) => options!.onEvent(e)),
    setState: (s: Parameters<ConnectEventsOptions["onState"]>[0]) => options!.onState(s),
  };
}

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, v),
  };
}

const notCalled = () => Promise.reject(new Error("not used in these tests"));
const unusedApi: Api = {
  getConversations: notCalled,
  getMessages: notCalled,
  takeOver: notCalled,
  sendMessage: notCalled,
};

function setup(storage = memoryStorage(), api: Api = unusedApi) {
  const stream = fakeStream();
  const { store, actions } = createConversations({
    connect: stream.connect,
    storage,
    api,
  });
  return { store, actions, stream, storage };
}

/** A promise the test settles by hand. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => ((resolve = res), (reject = rej)));
  return { promise, resolve, reject };
}

/** Lets pending promise callbacks run. */
const settle = () => new Promise((r) => setTimeout(r, 0));

const layout = (store: ReturnType<typeof setup>["store"]) => {
  const list = store.getState().list;
  return list ? selectRows(list).map((r) => `${r.id}:${r.status}`) : null;
};

describe("conversations store", () => {
  it("opens one stream however often the snapshot is delivered (the loader re-runs on retry)", () => {
    const { actions, stream } = setup();
    const snapshot = { lastEventId: 10, conversations: [conv("c-1", "ai")] };
    actions.receiveSnapshot(snapshot);
    actions.receiveSnapshot(snapshot);

    expect(stream.calls.connect).toBe(1);
  });

  const unreadOf = (store: ReturnType<typeof setup>["store"], id: string) =>
    store.getState().list?.byId[id]?.unread;

  it("remembers what was read across a reload", () => {
    const storage = memoryStorage();
    const first = setup(storage);
    first.actions.receiveSnapshot({ lastEventId: 10, conversations: [conv("c-1", "ai", 3)] });
    first.actions.open("c-1");
    expect(unreadOf(first.store, "c-1")).toBe(0);

    // Reload: two more customer messages arrived on the server meanwhile.
    const second = setup(storage);
    second.actions.receiveSnapshot({ lastEventId: 20, conversations: [conv("c-1", "ai", 5)] });

    expect(unreadOf(second.store, "c-1")).toBe(2);
  });

  it("keeps working when read state cannot be saved (e.g. storage is full)", () => {
    const storage = memoryStorage();
    storage.setItem = () => {
      throw new Error("QuotaExceededError");
    };
    const { store, actions } = setup(storage);
    actions.receiveSnapshot({ lastEventId: 10, conversations: [conv("c-1", "ai", 3)] });

    expect(() => actions.open("c-1")).not.toThrow();
    expect(unreadOf(store, "c-1")).toBe(0);
  });

  it("ignores saved read state it cannot read", () => {
    const storage = memoryStorage();
    storage.setItem("hams.readState", "{not json");
    const { store, actions } = setup(storage);
    actions.receiveSnapshot({ lastEventId: 10, conversations: [conv("c-1", "ai", 3)] });

    expect(unreadOf(store, "c-1")).toBe(3);
  });

  it("keeps the live list when the snapshot is delivered again (the loader can re-run)", () => {
    const { store, actions, stream } = setup();
    const snapshot = { lastEventId: 10, conversations: [conv("c-1", "ai"), conv("c-2", "ai")] };
    actions.receiveSnapshot(snapshot);
    stream.emit(status(11, "c-1", "human"));

    actions.receiveSnapshot(snapshot);

    expect(layout(store)).toEqual(["c-1:human", "c-2:ai"]);
  });

  const message = (
    id: number,
    conversationId: string,
    m: Partial<Message> & { id: string },
  ): ServerEvent => ({
    id,
    type: "message",
    conversationId,
    message: {
      conversationId,
      role: "customer",
      text: m.id,
      createdAt: "2026-11-24T10:00:00.000Z",
      ...m,
    },
  });
  const threadTexts = (store: ReturnType<typeof setup>["store"], id: string) => {
    const thread = store.getState().threads[id];
    return thread?.loaded ? thread.order.map((key) => thread.byId[key]?.text ?? key) : null;
  };

  describe("a thread", () => {
    it("waits for the list to catch up when its snapshot is ahead, so hand-offs land in place", () => {
      const { store, actions, stream } = setup();
      actions.receiveSnapshot({ lastEventId: 100, conversations: [conv("c-1", "ai")] });

      // The stream is behind (e.g. reconnecting): the thread snapshot already includes events to 110.
      const fetchId = actions.beginThreadFetch("c-1");
      actions.receiveThread(
        "c-1",
        {
          lastEventId: 110,
          messages: [
            {
              id: "m-1",
              conversationId: "c-1",
              role: "customer",
              text: "Refund please",
              createdAt: "",
            },
            { id: "m-2", conversationId: "c-1", role: "customer", text: "Hello?", createdAt: "" },
          ],
        },
        fetchId,
      );
      expect(threadTexts(store, "c-1")).toBeNull();

      // The stream catches up. The hand-off at 105 is only in the stream: REST never returns it.
      stream.emit(
        message(103, "c-1", { id: "m-1", text: "Refund please" }),
        {
          id: 105,
          type: "tool_call",
          conversationId: "c-1",
          name: "transfer_to_human",
          args: { reason: "Refund above limit" },
        },
        status(106, "c-1", "needs_human"),
        message(107, "c-1", { id: "m-2", text: "Hello?" }),
      );
      expect(threadTexts(store, "c-1")).toBeNull();
      stream.emit(status(110, "c-1", "needs_human"));

      expect(threadTexts(store, "c-1")).toEqual(["Refund please", "handoff:105", "Hello?"]);
    });

    it("turns the row's typing off when it loads with no reply streaming", () => {
      const { store, actions, stream } = setup();
      actions.receiveSnapshot({ lastEventId: 10, conversations: [conv("c-1", "ai")] });
      stream.emit({
        id: 11,
        type: "message_start",
        conversationId: "c-1",
        messageId: "m-9",
        role: "ai",
      });
      expect(store.getState().list?.byId["c-1"]?.typing).toBe(true);

      // The thread snapshot is ahead of the list: the reply already ended there, at 12.
      const fetchId = actions.beginThreadFetch("c-1");
      actions.receiveThread(
        "c-1",
        {
          lastEventId: 12,
          messages: [{ id: "m-9", conversationId: "c-1", role: "ai", text: "Done", createdAt: "" }],
        },
        fetchId,
      );
      stream.emit({ id: 12, type: "message_end", conversationId: "c-1", messageId: "m-9" });

      expect(threadTexts(store, "c-1")).toEqual(["Done"]);
      expect(store.getState().list?.byId["c-1"]?.typing).toBe(false);
    });
  });

  describe("a reply whose start was missed", () => {
    it("retries the preview refresh for a reply that ended while the request was in flight", async () => {
      const responses = [deferred<Snapshot>(), deferred<Snapshot>()];
      let calls = 0;
      const api = { ...unusedApi, getConversations: () => responses[calls++]!.promise };
      const { store, actions, stream } = setup(memoryStorage(), api);
      actions.receiveSnapshot({
        lastEventId: 10,
        conversations: [conv("c-1", "ai"), conv("c-2", "ai")],
      });
      const end = (id: number, c: string): ServerEvent => ({
        id,
        type: "message_end",
        conversationId: c,
        messageId: `m-${c}`,
      });

      stream.emit(end(11, "c-1")); // starts the refresh
      stream.emit(end(13, "c-2")); // ends while the request is in flight
      responses[0]!.resolve({
        lastEventId: 12,
        conversations: [conv("c-1", "ai"), conv("c-2", "ai")].map((c) => ({
          ...c,
          lastMessage: `${c.id} at 12`,
        })),
      });
      await settle();
      responses[1]!.resolve({
        lastEventId: 13,
        conversations: [conv("c-1", "ai"), conv("c-2", "ai")].map((c) => ({
          ...c,
          lastMessage: `${c.id} at 13`,
        })),
      });
      await settle();

      const preview = (id: string) => store.getState().list?.byId[id]?.lastMessage;
      expect(calls).toBe(2);
      expect(preview("c-1")).toBe("c-1 at 12");
      expect(preview("c-2")).toBe("c-2 at 13");
    });
  });

  describe("a reply whose start was missed, when the server never catches up", () => {
    it("stops refreshing after a few tries (e.g. the server restarted and its ids went back)", async () => {
      let calls = 0;
      const api = {
        ...unusedApi,
        getConversations: async () => {
          calls++;
          return { lastEventId: 3, conversations: [conv("c-1", "ai")] };
        },
      };
      const { store, actions, stream } = setup(memoryStorage(), api);
      actions.receiveSnapshot({ lastEventId: 10, conversations: [conv("c-1", "ai")] });

      stream.emit({ id: 11, type: "message_end", conversationId: "c-1", messageId: "m-1" });
      for (let i = 0; i < 10; i++) await settle();

      expect(calls).toBe(3);
      expect(store.getState().list?.stalePreviews).toEqual({});
    });
  });

  describe("a thread held because its snapshot is ahead", () => {
    it("loads anyway once the stream gives up, since the list can no longer catch up", () => {
      const { store, actions, stream } = setup();
      actions.receiveSnapshot({ lastEventId: 100, conversations: [conv("c-1", "ai")] });
      const fetchId = actions.beginThreadFetch("c-1");
      actions.receiveThread("c-1", { lastEventId: 110, messages: [] }, fetchId);
      expect(store.getState().threads["c-1"]?.loaded).toBe(false);

      stream.setState("disconnected");

      expect(store.getState().threads["c-1"]?.loaded).toBe(true);
    });
  });

  describe("sending a reply", () => {
    function humanThread(api: Api) {
      const app = setup(memoryStorage(), api);
      app.actions.receiveSnapshot({ lastEventId: 10, conversations: [conv("c-1", "human")] });
      const fetchId = app.actions.beginThreadFetch("c-1");
      app.actions.receiveThread("c-1", { lastEventId: 10, messages: [] }, fetchId);
      return app;
    }

    it("shows the reply at once and swaps in the real message when the stream echoes it", async () => {
      const response = deferred<void>();
      let sent: string[] = [];
      const api = {
        ...unusedApi,
        sendMessage: (_: string, text: string, clientMessageId: string) => {
          sent = [text, clientMessageId];
          return response.promise;
        },
      };
      const { store, actions, stream } = humanThread(api);

      actions.setReplyDraft("c-1", "  On it  ");
      actions.send("c-1");
      const thread = () => store.getState().threads["c-1"]!;
      expect(thread().pending).toEqual([
        { clientMessageId: sent[1], text: "On it", state: "sending" },
      ]);
      expect(store.getState().replyDrafts["c-1"]).toBe("");

      response.resolve();
      await settle();
      expect(thread().pending[0]?.state).toBe("sent");

      stream.emit(
        message(11, "c-1", { id: "m-5", role: "human", text: "On it", clientMessageId: sent[1] }),
      );
      expect(thread().pending).toEqual([]);
      expect(threadTexts(store, "c-1")).toEqual(["On it"]);
    });

    it("does not overwrite a new reply the user started while the rejected one was in flight", async () => {
      const response = deferred<void>();
      const { store, actions } = humanThread({ ...unusedApi, sendMessage: () => response.promise });

      actions.setReplyDraft("c-1", "On it");
      actions.send("c-1");
      actions.setReplyDraft("c-1", "Something else");
      response.reject(new Error("Random failure, please retry"));
      await settle();

      expect(store.getState().replyDrafts["c-1"]).toBe("Something else");
    });
  });
});
