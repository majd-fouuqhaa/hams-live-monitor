import { z } from "zod";
import { createStore } from "zustand/vanilla";
import { PREVIEW_REFRESH_MAX_ATTEMPTS, READ_STATE_KEY } from "./constants";
import {
  applyEvent,
  applyPreviewRefresh,
  dropStalePreviews,
  loadSnapshot,
  openConversation,
  selectPersisted,
  syncTypingFromThread,
  type ThreadText,
} from "./model";
import {
  abandonFetch,
  addPending,
  applyThreadEvent,
  beginFetch,
  loadThread,
  markSent,
  removePending,
} from "./thread";
import type {
  Conversations,
  ConversationsActions,
  ConversationsState,
  ConversationsStoreDeps,
  EventsConnection,
  PersistedReadState,
  ListState,
  ServerEvent,
  ThreadSnapshot,
  ThreadState,
} from "./types";

const PersistedSchema = z.object({
  baselines: z.record(z.string(), z.number()),
  lastEventId: z.number(),
}) satisfies z.ZodType<PersistedReadState>;

function readSaved(storage: Storage): PersistedReadState | undefined {
  try {
    return PersistedSchema.parse(JSON.parse(storage.getItem(READ_STATE_KEY) ?? "null"));
  } catch {
    return undefined;
  }
}

export function createConversations({
  connect,
  storage,
  api,
  now = () => new Date(),
}: ConversationsStoreDeps): Conversations {
  let connection: EventsConnection | undefined;
  let refreshingPreviews = false;
  let lastFetchId = 0;
  /** The fetch allowed to settle each thread; older ones were superseded. */
  const currentFetch = new Map<string, number>();

  const store = createStore<ConversationsState>()(() => ({
    list: null,
    connection: "connecting",
    threads: {},
    replyDrafts: {},
    sendErrors: {},
  }));
  const { getState: get, setState: set } = store;

  const setThread = (thread: ThreadState) =>
    set(({ threads }) => ({ threads: { ...threads, [thread.conversationId]: thread } }));

  /** Rows whose reply ended without a known text get their preview from a fresh GET /conversations. */
  async function refreshStalePreviews(attempt = 1) {
    if (refreshingPreviews) return;
    refreshingPreviews = true;
    try {
      const snapshot = await api.getConversations();
      const { list } = get();
      if (list) set({ list: applyPreviewRefresh(list, snapshot) });
    } catch {
      const { list } = get();
      if (list) set({ list: dropStalePreviews(list) });
    } finally {
      refreshingPreviews = false;
    }
    // A reply that ended while the request was in flight is still waiting. A server that never reaches
    // it (e.g. restarted, its ids went back) would keep us asking: give up after a few tries.
    const { list } = get();
    if (!list || Object.keys(list.stalePreviews).length === 0) return;
    if (attempt < PREVIEW_REFRESH_MAX_ATTEMPTS) void refreshStalePreviews(attempt + 1);
    else set({ list: dropStalePreviews(list) });
  }

  /** Loads a thread's snapshot and replays what it held; the row's typing follows the thread. */
  function loadInto(list: ListState, thread: ThreadState, snapshot: ThreadSnapshot) {
    const loaded = loadThread(
      thread,
      snapshot,
      list.handoffs[thread.conversationId] ?? [],
      list.createdBy,
      now(),
    );
    return { thread: loaded, list: syncTypingFromThread(list, loaded) };
  }

  /** The stream gave up, so the list cannot catch up: show held threads as they are (best effort). */
  function loadHeldThreads() {
    let { list, threads } = get();
    if (!list) return;
    for (const thread of Object.values(threads)) {
      if (!thread.waiting) continue;
      const loaded = loadInto(list, thread, thread.waiting);
      list = loaded.list;
      threads = { ...threads, [thread.conversationId]: loaded.thread };
    }
    set({ list, threads });
  }

  /** Both reducers, one commit: the list and the thread never disagree on screen (ADR 0007). */
  function applyLive(event: ServerEvent) {
    const { list, threads } = get();
    if (!list) return;
    const current = threads[event.conversationId];
    let thread = current && applyThreadEvent(current, event, now());
    const threadText: ThreadText = (_, messageId) =>
      thread?.buffer === null ? thread.byId[messageId]?.text : undefined;
    let nextList = applyEvent(list, event, now(), threadText);
    // A thread held because its snapshot was ahead loads once the list has caught up to it.
    if (thread?.waiting && nextList.lastEventId >= thread.waiting.lastEventId) {
      ({ thread, list: nextList } = loadInto(nextList, thread, thread.waiting));
    }
    set({
      list: nextList,
      ...(thread && thread !== current
        ? { threads: { ...threads, [thread.conversationId]: thread } }
        : {}),
    });
    if (
      nextList.stalePreviews !== list.stalePreviews &&
      Object.keys(nextList.stalePreviews).length > 0
    ) {
      void refreshStalePreviews();
    }
  }

  store.subscribe(({ list }, previous) => {
    if (!list || list.baselines === previous.list?.baselines) return;
    try {
      storage.setItem(READ_STATE_KEY, JSON.stringify(selectPersisted(list)));
    } catch {
      // Storage full or blocked: read state just won't survive a reload.
    }
  });

  const actions: ConversationsActions = {
    receiveSnapshot(snapshot) {
      // Once live, the stream keeps the list current; a re-delivered snapshot would undo the stable order.
      if (get().list) return;
      set({ list: loadSnapshot(snapshot, readSaved(storage)) });

      // Opened only now, from the snapshot's event id: nothing can fall between the two (ADR 0002).
      connection ??= connect({
        since: () => get().list?.lastEventId ?? snapshot.lastEventId,
        onEvent: applyLive,
        onState(state) {
          set({ connection: state });
          if (state === "disconnected") loadHeldThreads();
        },
      });
    },

    reconnect() {
      connection?.reconnect();
    },

    open(id) {
      const { list } = get();
      if (list) set({ list: openConversation(list, id) });
    },

    beginThreadFetch(conversationId) {
      setThread(beginFetch(get().threads[conversationId], conversationId));
      currentFetch.set(conversationId, ++lastFetchId);
      return lastFetchId;
    },

    receiveThread(conversationId, snapshot, fetchId) {
      if (currentFetch.get(conversationId) !== fetchId) return;
      currentFetch.delete(conversationId);
      const { list, threads } = get();
      const thread = threads[conversationId];
      // Not fetching any more (e.g. a fetch that was already settled): the live thread stays as it is.
      if (!list || !thread?.buffer) return;
      // Ahead of the list (e.g. while the stream reconnects): hold it until the list catches up, so the
      // list knows every hand-off and message the snapshot includes. Disconnected, it never would.
      if (snapshot.lastEventId > list.lastEventId && get().connection !== "disconnected") {
        setThread({ ...thread, waiting: snapshot });
        return;
      }
      const loaded = loadInto(list, thread, snapshot);
      set({ threads: { ...threads, [conversationId]: loaded.thread }, list: loaded.list });
    },

    failThreadFetch(conversationId, fetchId) {
      if (currentFetch.get(conversationId) !== fetchId) return;
      currentFetch.delete(conversationId);
      const thread = get().threads[conversationId];
      if (!thread?.buffer) return;
      const kept = abandonFetch(thread, now());
      set(({ threads }) => {
        const { [conversationId]: _, ...rest } = threads;
        return { threads: kept ? { ...rest, [conversationId]: kept } : rest };
      });
    },

    setReplyDraft(conversationId, text) {
      set(({ replyDrafts }) => ({ replyDrafts: { ...replyDrafts, [conversationId]: text } }));
    },

    send(conversationId) {
      const text = (get().replyDrafts[conversationId] ?? "").trim();
      const thread = get().threads[conversationId];
      if (!text || !thread) return;

      const clientMessageId = crypto.randomUUID();
      const { [conversationId]: _, ...sendErrors } = get().sendErrors;
      set(({ replyDrafts }) => ({
        replyDrafts: { ...replyDrafts, [conversationId]: "" },
        sendErrors,
      }));
      setThread(addPending(thread, { clientMessageId, text, state: "sending" }));

      const update = (change: (t: ThreadState) => ThreadState) => {
        const current = get().threads[conversationId];
        if (current) setThread(change(current));
      };

      api.sendMessage(conversationId, text, clientMessageId).then(
        () => update((t) => markSent(t, clientMessageId)),
        (error: unknown) => {
          // Rolled back. The text goes back into the composer unless the user started a new one.
          update((t) => removePending(t, clientMessageId));
          set(({ replyDrafts, sendErrors }) => ({
            replyDrafts: replyDrafts[conversationId]
              ? replyDrafts
              : { ...replyDrafts, [conversationId]: text },
            sendErrors: {
              ...sendErrors,
              [conversationId]: error instanceof Error ? error.message : "Couldn't send",
            },
          }));
        },
      );
    },
  };

  return { store, actions, api };
}
