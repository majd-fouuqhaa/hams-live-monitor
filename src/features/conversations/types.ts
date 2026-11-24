import type { StoreApi } from "zustand/vanilla";

type Role = "customer" | "ai" | "human";
export type Status = "ai" | "needs_human" | "human" | "closed";

export interface Conversation {
  id: string;
  customer: string;
  status: Status;
  lastMessage: string;
  unread: number;
  updatedAt: string;
}

export interface Snapshot {
  lastEventId: number;
  conversations: Conversation[];
}

export interface Message {
  id: string;
  conversationId: string;
  role: Role;
  text: string;
  createdAt: string;
  /** An AI reply that is still being written. */
  streaming?: true;
  /** Echoed back from our POST, to match the pending reply. */
  clientMessageId?: string;
}

/** GET /conversations/:id/messages: the thread as of event `lastEventId`. */
export interface ThreadSnapshot {
  lastEventId: number;
  messages: Message[];
}

export type ServerEvent = { id: number } & (
  | { type: "message"; conversationId: string; message: Message }
  | { type: "message_start"; conversationId: string; messageId: string; role: "ai" }
  | { type: "token"; conversationId: string; messageId: string; text: string }
  | { type: "message_end"; conversationId: string; messageId: string }
  | { type: "status"; conversationId: string; status: Status }
  | { type: "tool_call"; conversationId: string; name: string; args: Record<string, unknown> }
);

export interface RowView extends Conversation {
  /** An AI reply is streaming (between message_start and message_end). */
  typing: boolean;
  /** When a live hand-off made this row Needs human (not set for rows already waiting at load). */
  handedOffAt?: string;
}

export interface ListState {
  byId: Record<string, RowView>;
  /** Row ids in the order the snapshot listed them; never reordered. */
  order: string[];
  lastEventId: number;
  /** Text of AI replies still streaming, by message id. Kept off the rows so tokens never re-render the list. */
  drafts: Record<string, string>;
  /** The server's ever-increasing unread counter, mirrored (ADR 0004). */
  serverUnread: Record<string, number>;
  /** serverUnread at the moment each conversation was last read. */
  baselines: Record<string, number>;
  /** The conversation on screen; its baseline follows every new message. */
  openId: string | null;
  /** Hand-offs seen in the stream, oldest first. The server never stores them (ADR 0007). */
  handoffs: Record<string, Handoff[]>;
  /** The event that created each message we saw created; places hand-offs by event id. */
  createdBy: Record<string, number>;
  /** The event that last set each row's preview, so a refetched preview never goes backwards. */
  previewEventId: Record<string, number>;
  /** Rows whose reply ended without us knowing its text (missed start): conversation id → event id. */
  stalePreviews: Record<string, number>;
}

export interface Handoff {
  eventId: number;
  reason: string;
  receivedAt: string;
}

/** A reply we sent that the stream has not echoed yet. */
export interface PendingReply {
  clientMessageId: string;
  text: string;
  /** `sent`: the server answered 201; still waiting for the echo to place it in event order. */
  state: "sending" | "sent";
}

/** One opened conversation's messages, kept live (ADR 0007). */
export interface ThreadState {
  conversationId: string;
  /** false until the first snapshot arrives. */
  loaded: boolean;
  /** Watermark: events at or below it are already in the snapshot. */
  lastEventId: number;
  /** Message ids and `handoff:<eventId>` keys, oldest first. */
  order: string[];
  byId: Record<string, Message>;
  pending: PendingReply[];
  /** Events held while a fetch is in flight; null when none is. */
  buffer: ServerEvent[] | null;
  /** The thread got an event it cannot apply; its contents may be wrong until refetched. */
  outOfSync: boolean;
}

/** Read state kept in localStorage between sessions (ADR 0004). */
export interface PersistedReadState {
  baselines: Record<string, number>;
  lastEventId: number;
}

// ---- Live stream (events.ts) -----------------------------------------------------------------

export type ConnectionState = "connecting" | "live" | "reconnecting" | "disconnected";

export interface EventsConnection {
  /** Opens a fresh connection after the stream gave up, resuming after the last applied event. */
  reconnect(): void;
  close(): void;
}

export interface ConnectEventsOptions {
  baseUrl: string;
  /** The last event applied; read on every (re)connect, so the server replays only what we lack. */
  since: () => number;
  onEvent: (event: ServerEvent) => void;
  onState: (state: ConnectionState) => void;
  /** Failures in a row (no successful open in between) before giving up. */
  maxFailures?: number;
  /** Wait before reopening after a drop. */
  retryMs?: number;
}

// ---- Store (store.ts) ------------------------------------------------------------------------

export interface ConversationsStoreDeps {
  connect: (options: Omit<ConnectEventsOptions, "baseUrl">) => EventsConnection;
  storage: Storage;
  api: Api;
  now?: () => Date;
}

export interface ConversationsState {
  /** null until the snapshot has loaded. */
  list: ListState | null;
  connection: ConnectionState;
  /** Every thread opened so far, by conversation id. */
  threads: Record<string, ThreadState>;
  /** Unsent composer text, by conversation id. */
  replyDrafts: Record<string, string>;
  /** The last send error, by conversation id; cleared by the next send. */
  sendErrors: Record<string, string>;
}

// ---- REST (api.ts) ---------------------------------------------------------------------------

export interface Api {
  getConversations(signal?: AbortSignal): Promise<Snapshot>;
  getMessages(conversationId: string, signal?: AbortSignal): Promise<ThreadSnapshot>;
  takeOver(conversationId: string): Promise<void>;
  sendMessage(conversationId: string, text: string, clientMessageId: string): Promise<void>;
}

export type ConversationsStore = StoreApi<ConversationsState>;

export interface ConversationsActions {
  /** Loads the list and opens the stream from the snapshot's event id. Ignored once loaded. */
  receiveSnapshot: (snapshot: Snapshot) => void;
  /** Manual retry after the stream gave up: resumes after the last event we have. */
  reconnect: () => void;
  /** The conversation on screen (null = none). Marks it read, and keeps it read while open. */
  open: (id: string | null) => void;
  /**
   * Starts holding a thread's events, before its snapshot request goes out. Returns the fetch's id: only
   * the latest fetch may settle the thread, so an aborted one (e.g. StrictMode's remount) cannot.
   */
  beginThreadFetch: (conversationId: string) => number;
  receiveThread: (conversationId: string, snapshot: ThreadSnapshot, fetchId: number) => void;
  /** The snapshot request failed: a loaded thread applies what it held; a new one is dropped. */
  failThreadFetch: (conversationId: string, fetchId: number) => void;
  setReplyDraft: (conversationId: string, text: string) => void;
  /** Sends the conversation's draft optimistically; rolls back with an error if the server rejects it. */
  send: (conversationId: string) => void;
}

/** The data store and the actions that write to it, created together because they share the stream. */
export interface Conversations {
  store: ConversationsStore;
  actions: ConversationsActions;
  /** The REST client, shared with the hooks that track requests in react-query. */
  api: Api;
}
