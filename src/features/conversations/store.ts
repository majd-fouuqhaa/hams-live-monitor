import { z } from "zod";
import { createStore } from "zustand/vanilla";
import { READ_STATE_KEY } from "./constants";
import { applyEvent, loadSnapshot, openConversation, selectPersisted } from "./model";
import type {
  Conversations,
  ConversationsActions,
  ConversationsState,
  ConversationsStoreDeps,
  EventsConnection,
  PersistedReadState,
  ServerEvent,
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
  now = () => new Date(),
}: ConversationsStoreDeps): Conversations {
  let connection: EventsConnection | undefined;
  let buffer: ServerEvent[] = [];

  const store = createStore<ConversationsState>()(() => ({ list: null, connection: "connecting" }));
  const { getState: get, setState: set } = store;

  store.subscribe(({ list }, previous) => {
    if (!list || list.baselines === previous.list?.baselines) return;
    storage.setItem(READ_STATE_KEY, JSON.stringify(selectPersisted(list)));
  });

  const actions: ConversationsActions = {
    start() {
      if (connection) return;
      connection = connect({
        onEvent(event) {
          const { list } = get();
          if (list) set({ list: applyEvent(list, event, now()) });
          else buffer.push(event);
        },
        onState: (state) => set({ connection: state }),
      });
    },

    receiveSnapshot(snapshot) {
      // Once live, the stream keeps the list current; a re-delivered snapshot would undo the stable order.
      if (get().list) return;

      // applyEvent drops anything the snapshot already contains (id <= snapshot.lastEventId).
      const list = buffer.reduce(
        (s, e) => applyEvent(s, e, now()),
        loadSnapshot(snapshot, readSaved(storage)),
      );
      buffer = [];
      set({ list });
    },

    reconnect() {
      // Before the snapshot, resume after the last buffered event; the snapshot dedupes the rest.
      const since = get().list?.lastEventId ?? buffer.at(-1)?.id ?? 0;
      connection?.reconnect(since);
    },

    open(id) {
      const { list } = get();
      if (list) set({ list: openConversation(list, id) });
    },
  };

  return { store, actions };
}
