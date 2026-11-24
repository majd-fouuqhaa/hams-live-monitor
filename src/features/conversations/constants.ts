import type { ConnectionState, Status } from "./types";

export const STATUS_LABEL: Record<Status, string> = {
  needs_human: "Needs human",
  human: "Human handling",
  ai: "AI handling",
  closed: "Closed",
};

export const CONNECTION_LABEL: Record<ConnectionState, string> = {
  connecting: "Connecting…",
  live: "Live",
  reconnecting: "Reconnecting…",
  disconnected: "Disconnected",
};

export const MAX_STREAM_FAILURES = 3;

export const READ_STATE_KEY = "hams.readState";

export const UNREAD_DISPLAY_MAX = 99;

export const HANDOFF_FLASH_WINDOW_MS = 2000;

export const TYPING_DOT_DELAYS_MS = [0, 150, 300] as const;
