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

/** Wait before reopening the stream after a drop; the same as the mock server's `retry: 3000`. */
export const STREAM_RETRY_MS = 3000;

export const READ_STATE_KEY = "hams.readState";

/** Refreshes of GET /conversations for one missed-start preview before giving up on it. */
export const PREVIEW_REFRESH_MAX_ATTEMPTS = 3;

export const UNREAD_DISPLAY_MAX = 99;

export const HANDOFF_FLASH_WINDOW_MS = 2000;

export const TYPING_DOT_DELAYS_MS = [0, 150, 300] as const;

/** Within this distance of the bottom, new thread content keeps the view pinned to the newest message. */
export const THREAD_FOLLOW_THRESHOLD_PX = 80;

/** Rows rendered beyond the visible window, above and below. */
export const THREAD_OVERSCAN = 8;

/** First guess for a row's height, before it is measured. */
export const THREAD_ESTIMATED_ROW_PX = 72;

export const THREAD_SKELETON_ROWS = 6;
