// The live event stream: one native EventSource for every conversation. See docs/adr/0002.
import { MAX_STREAM_FAILURES } from "./constants";
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
  onEvent,
  onState,
  maxFailures = MAX_STREAM_FAILURES,
}: ConnectEventsOptions): EventsConnection {
  let state: ConnectionState | undefined;
  const report = (next: ConnectionState) => {
    if (next !== state) onState((state = next));
  };

  let source: EventSource;
  let failures = 0;

  function open(url: string) {
    report("connecting");
    failures = 0;
    source = new EventSource(url);
    source.onopen = () => {
      failures = 0;
      report("live");
    };

    // The browser retries on its own after `retry` ms. We count failures in a row and give up after
    // `maxFailures`, or at once when the browser itself gives up (e.g. an HTTP error status).
    source.onerror = () => {
      failures += 1;
      if (source.readyState === EventSource.CLOSED || failures >= maxFailures) {
        source.close();
        report("disconnected");
      } else {
        report("reconnecting");
      }
    };
    source.onmessage = (e: MessageEvent<string>) => {
      const event = parseEvent(e.data);
      if (event) onEvent(event);
    };
  }

  // No `since` here: native reconnects reuse this URL and send Last-Event-ID instead (ADR 0002).
  open(`${baseUrl}/events`);

  return {
    reconnect(since) {
      source.close();
      open(`${baseUrl}/events?since=${since}`);
    },
    close: () => source.close(),
  };
}
