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
}

/** Read state kept in localStorage between sessions (ADR 0004). */
export interface PersistedReadState {
  baselines: Record<string, number>;
  lastEventId: number;
}

// ---- Live stream (events.ts) -----------------------------------------------------------------

export type ConnectionState = "connecting" | "live" | "reconnecting" | "disconnected";

export interface EventsConnection {
  /** Opens a fresh connection that resumes after `since` (manual retry once disconnected). */
  reconnect(since: number): void;
  close(): void;
}

export interface ConnectEventsOptions {
  baseUrl: string;
  onEvent: (event: ServerEvent) => void;
  onState: (state: ConnectionState) => void;
  /** Failures in a row (no successful open in between) before giving up. */
  maxFailures?: number;
}

// ---- Store (store.ts) ------------------------------------------------------------------------

export interface ConversationsStoreDeps {
  connect: (options: Omit<ConnectEventsOptions, "baseUrl">) => EventsConnection;
  storage: Storage;
  now?: () => Date;
}

export interface ConversationsState {
  /** null until the snapshot has loaded. */
  list: ListState | null;
  connection: ConnectionState;
}

export type ConversationsStore = StoreApi<ConversationsState>;

export interface ConversationsActions {
  /** Opens the stream and buffers events until the snapshot arrives. Safe to call more than once. */
  start: () => void;
  receiveSnapshot: (snapshot: Snapshot) => void;
  /** Manual retry after the stream gave up: resumes after the last event we have. */
  reconnect: () => void;
  /** The conversation on screen (null = none). Marks it read, and keeps it read while open. */
  open: (id: string | null) => void;
}

/** The data store and the actions that write to it, created together because they share the stream. */
export interface Conversations {
  store: ConversationsStore;
  actions: ConversationsActions;
}
