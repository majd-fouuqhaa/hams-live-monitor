// The live event stream: one EventSource for every conversation, reopened by us after each drop so it
// always resumes from the last event we applied. See docs/adr/0002.
import { MAX_STREAM_FAILURES, STREAM_RETRY_MS } from "./constants";
import { ServerEventSchema } from "./schemas";
import type { ConnectEventsOptions, ConnectionState, EventsConnection, ServerEvent } from "./types";

function parseEvent(data: string): ServerEvent | null {
  let json: unknown;
  try {
    json = JSON.parse(data);
  } catch {}

  const result = ServerEventSchema.safeParse(json);

  if (result.success) return result.data;

  if (import.meta.env.DEV) console.warn("Skipping unreadable stream event", data);

  return null;
}

export function connectEvents({
  baseUrl,
  since,
  onEvent,
  onState,
  maxFailures = MAX_STREAM_FAILURES,
  retryMs = STREAM_RETRY_MS,
}: ConnectEventsOptions): EventsConnection {
  let state: ConnectionState | undefined;
  const report = (next: ConnectionState) => {
    if (next !== state) onState((state = next));
  };

  let source: EventSource | undefined;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let failures = 0;

  // Every connection asks for the events after the last one we applied. The browser's own reconnect
  // would reuse this URL, and the server prefers `since` over Last-Event-ID, so it would replay from
  // an old id on every drop. We close on error and reopen with the current id instead.
  function open() {
    const current = new EventSource(`${baseUrl}/events?since=${since()}`);
    source = current;
    current.onopen = () => {
      failures = 0;
      report("live");
    };
    current.onerror = () => {
      // CLOSED here means the browser gave up by itself (e.g. an HTTP error status): don't retry.
      const refused = current.readyState === EventSource.CLOSED;
      current.close();
      failures += 1;
      if (refused || failures >= maxFailures) {
        report("disconnected");
        return;
      }
      report("reconnecting");
      retry = setTimeout(open, retryMs);
    };
    current.onmessage = (e: MessageEvent<string>) => {
      const event = parseEvent(e.data);
      if (event) onEvent(event);
    };
  }

  function stop() {
    clearTimeout(retry);
    source?.close();
  }

  report("connecting");
  open();

  return {
    reconnect() {
      stop();
      failures = 0;
      report("connecting");
      open();
    },
    close: stop,
  };
}
