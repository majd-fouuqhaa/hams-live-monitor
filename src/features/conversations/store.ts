import { z } from "zod";
import { createStore } from "zustand/vanilla";
import { READ_STATE_KEY } from "./constants";
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
  ServerEvent,
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
  async function refreshStalePreviews() {
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
    // A reply that ended while the request was in flight is still waiting.
    if (Object.keys(get().list?.stalePreviews ?? {}).length > 0) void refreshStalePreviews();
  }

  /** Both reducers, one commit: the list and the thread never disagree on screen (ADR 0007). */
  function applyLive(event: ServerEvent) {
    const { list, threads } = get();
    if (!list) return;
    const current = threads[event.conversationId];
    const thread = current && applyThreadEvent(current, event, now());
    const threadText: ThreadText = (_, messageId) =>
      thread?.buffer === null ? thread.byId[messageId]?.text : undefined;
    const nextList = applyEvent(list, event, now(), threadText);
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
    storage.setItem(READ_STATE_KEY, JSON.stringify(selectPersisted(list)));
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
        onState: (state) => set({ connection: state }),
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
      if (!thread?.buffer) return;
      const loaded = loadThread(
        thread,
        snapshot,
        list?.handoffs[conversationId] ?? [],
        list?.createdBy ?? {},
        now(),
      );
      set({
        threads: { ...threads, [conversationId]: loaded },
        ...(list ? { list: syncTypingFromThread(list, loaded) } : {}),
      });
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
