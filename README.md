# Hams Live Monitor

A supervisor screen for live customer conversations: a list on one side and the selected thread on the
other. AI replies appear word by word, and the supervisor can take over a conversation the AI handed off.

## Run

Needs Node 24 and pnpm.

```sh
pnpm install
pnpm mock      # mock server on http://localhost:4000
pnpm dev       # app on http://localhost:5173
```

If the mock runs on another port, set `VITE_API_URL` in `.env`. After restarting the mock, reload the app:
the server's event ids start again from 1.

Checks: `pnpm vp test` runs the tests; `pnpm vp run verify` runs lint, types, tests and the build.

## Server state and live state

- **TanStack Query** makes the REST requests: `GET /conversations`, `GET /conversations/:id/messages`,
  take over. It tracks loading, errors and Retry, and is not the source of truth for what is on screen.
- **A Zustand store** holds what is on screen: the conversations, every opened thread, the connection
  state, and UI state (unsent replies, send errors). After a snapshot loads, only stream events and the
  user's own actions change it.

The split exists because the stream changes the data many times a second. If React Query kept it, a
refetch could overwrite live changes, and every token would rewrite the cache. Instead, the store applies
each event with two pure functions, one for the list and one for the open threads, and saves both results
in a single update, so the list and the thread always agree.

Two requests go straight from the store instead of through Query. Sending a reply: its pending message,
rollback and placement by the stream's echo all live in the store. Refreshing a preview the stream could
not fill: the result is merged into the store's list.

## Resuming after a drop

Every event has an id that goes up by one. The store keeps the last id it applied, and ignores any event
at or below it. This one rule removes the duplicates the server sends on purpose after a reconnect.

1. On start, the app loads `GET /conversations`, then opens `/events?since=<its lastEventId>`. The server
   replays everything after the snapshot, so nothing is lost between the two.
2. When the connection drops, the app closes it and, after 3 seconds, opens a new one with
   `?since=<last applied id>`. It does not use the browser's own reconnect: that reuses the first URL, and
   the server prefers `since` over the `Last-Event-ID` header, so it would replay everything since page
   load on every drop.
3. After 3 failed attempts in a row, or at once if the server answers with an error status, the app shows
   **Disconnected** with a Reconnect button, which opens a connection the same way.
4. Each thread has its own last id: the one in its `GET /messages` response. A reply that is still
   streaming comes back with its text so far, and only later words are added, so no word appears twice.
   Events that arrive while a thread is loading are held, then applied after it; those it already has
   are skipped.

The connection state (Connecting, Live, Reconnecting, Disconnected) shows in the sidebar header.

## Choices worth knowing

- **Rows never move.** The list keeps the order of the first load. Changes show in place, and a new
  hand-off is highlighted and announced, so the supervisor does not lose their place.
- **Opened threads stay loaded and live.** Switching back to a conversation is instant.
- **Hand-offs are placed by event id, not time.** The `tool_call` event has no timestamp, and replayed
  events arrive late, so ordering by time would be wrong after every reconnect.
- **Take over only while Needs human**, as the brief describes. The mock also accepts it for conversations
  the AI is handling; the UI does not offer that.
- **Sent replies** appear at once and are confirmed by their echo on the stream (matched by
  `clientMessageId`), not by the 201. If the server rejects one, it is removed, the error shows, and the
  text goes back into the reply box unless a new reply was started there.
- **c-1 (5,000 messages)** is virtualized: only the visible rows are rendered, and a new word re-renders
  only its own message.
- **RTL / LTR** toggle in the sidebar header, saved between visits. Arabic and English text read correctly
  in both, and every line aligns to the layout's start edge.
- **Unread counts are kept in the browser.** The API has no way to mark a conversation read, and its
  `unread` only goes up. The app saves, per conversation, the server count when you last read it, and shows
  the difference. This does not sync across browsers.

## Skipped

- **Tests for the thread.** The list, the stream client and the reconnect have tests; the thread (token
  order, duplicates after a resume inside a thread, the hand-off entry, send rollback) does not yet.
- **Localization.** The interface text is English only. The RTL / LTR toggle changes the layout, not the
  language. Times use the browser's locale.
- Keyboard shortcuts to move between conversations.
- shadcn's AI Elements. `Conversation` is not virtualized, and `Message` / `PromptInput` do not support this
  project's component style or RTL yet.

## With more time

- Tests for the thread, as above.
- Arabic interface text, with the language and the layout direction switched together.
- Retry a failed send safely. The API has no idempotency key, so retrying after a network error (where the
  server may have saved the message) can send it twice.
- A "Take over anyway" action for conversations the AI is still handling.
- Free memory by unloading threads not viewed for a while; today every opened thread stays loaded.
- Move to AI Elements once they support this setup, keeping the virtualized list.

## Mock server notes

- The hand-off reason is only in the `tool_call` event; no REST endpoint returns it. After a reload, or for
  a conversation already waiting when the page loaded (c-7), the app shows "Reason not available".
- Taking over does not stop an AI reply that is already streaming: it keeps streaming after the status
  becomes Human handling.
- `message_end` carries no text. For a reply that started before the page loaded, the app has missed its
  first words, so it refetches `GET /conversations` to get the finished preview.
- Stream events have no timestamp, so a row's time is the moment its last message, finished reply or
  status change arrived. Replayed events after a reconnect show as "now".
