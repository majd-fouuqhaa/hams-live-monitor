import { HttpResponse, http, sse } from "msw";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { worker } from "@/test/msw/worker";
import { connectEvents } from "../events";
import type { ConnectionState, EventsConnection, ServerEvent } from "../types";

const BASE = "http://localhost:4000";

const statusEvent = (id: number): ServerEvent => ({
  id,
  type: "status",
  conversationId: "c-1",
  status: "needs_human",
});

/** Sends an event framed the way the mock server frames it. */
function frame(event: ServerEvent) {
  return { id: String(event.id), data: JSON.stringify(event) };
}

let connection: EventsConnection | undefined;
afterEach(() => connection?.close());

function connect(maxFailures?: number) {
  const events: ServerEvent[] = [];
  const states: ConnectionState[] = [];
  connection = connectEvents({
    baseUrl: BASE,
    // Resume after the last event received, as the store does with the last one it applied.
    since: () => events.at(-1)?.id ?? 0,
    onEvent: (e) => events.push(e),
    onState: (s) => states.push(s),
    maxFailures,
    retryMs: 10, // the app waits 3000, like the mock server's `retry`
  });
  return { events, states };
}

describe("connectEvents", () => {
  it("opens the stream from the last applied event and delivers parsed events in order", async () => {
    const urls: string[] = [];
    worker.use(
      sse(`${BASE}/events`, ({ client, request }) => {
        urls.push(request.url);
        client.send(frame(statusEvent(1)));
        client.send(frame(statusEvent(2)));
      }),
    );

    const { events, states } = connect();

    await expect.poll(() => events.map((e) => e.id)).toEqual([1, 2]);
    expect(events[0]).toEqual(statusEvent(1));
    expect(urls).toEqual([`${BASE}/events?since=0`]);
    expect(states).toEqual(["connecting", "live"]);
  });

  it("skips events it cannot understand and keeps delivering the rest", async () => {
    worker.use(
      sse(`${BASE}/events`, ({ client }) => {
        client.send({ id: "1", data: "not json" });
        client.send({ id: "2", data: JSON.stringify({ id: 2, type: "mystery" }) });
        client.send(frame(statusEvent(3)));
      }),
    );

    const { events } = connect();

    await expect.poll(() => events.map((e) => e.id)).toEqual([3]);
  });

  // The browser's own reconnect would reuse the first URL, and the server prefers `since` over
  // Last-Event-ID, so every drop would replay from the start. Each reconnect must ask for what is new.
  it("reconnects by itself after a drop, resuming after the last event received", async () => {
    const urls: string[] = [];
    worker.use(
      sse(`${BASE}/events`, ({ client, request }) => {
        urls.push(request.url);
        if (urls.length === 1) {
          client.send(frame(statusEvent(1)));
          // The server drops the connection once the frames are out.
          setTimeout(() => client.close(), 20);
        } else {
          client.send(frame(statusEvent(2)));
        }
      }),
    );

    const { events, states } = connect();

    await expect.poll(() => events.map((e) => e.id)).toEqual([1, 2]);
    expect(urls).toEqual([`${BASE}/events?since=0`, `${BASE}/events?since=1`]);
    expect(states).toEqual(["connecting", "live", "reconnecting", "live"]);
  });

  /** First connection works and then drops; every attempt after that fails (server down). */
  function serverGoesDown() {
    let attempts = 0;
    worker.use(
      http.get(`${BASE}/events`, () => (++attempts > 1 ? HttpResponse.error() : undefined)),
      sse(`${BASE}/events`, ({ client }) => {
        client.send(frame(statusEvent(1)));
        setTimeout(() => client.close(), 20);
      }),
    );
    return { attempts: () => attempts };
  }

  it("gives up and reports disconnected after repeated failures in a row", async () => {
    const server = serverGoesDown();

    const { states } = connect(3);

    await expect.poll(() => states.at(-1)).toBe("disconnected");
    expect(states).toEqual(["connecting", "live", "reconnecting", "disconnected"]);
    // The drop plus two failed attempts make three failures; no attempts after giving up.
    const attemptsWhenGivingUp = server.attempts();
    await new Promise((r) => setTimeout(r, 100));
    expect(server.attempts()).toBe(attemptsWhenGivingUp);
  });

  it("does not give up while each reconnect succeeds, however often the server drops", async () => {
    let connections = 0;
    worker.use(
      sse(`${BASE}/events`, ({ client }) => {
        connections++;
        client.send(frame(statusEvent(connections)));
        if (connections < 5) setTimeout(() => client.close(), 20);
      }),
    );

    const { events, states } = connect(3);

    await expect.poll(() => events.length).toBe(5);
    expect(states).not.toContain("disconnected");
    expect(states.at(-1)).toBe("live");
  });

  it("reports disconnected at once when the server answers with an error status", async () => {
    worker.use(http.get(`${BASE}/events`, () => new HttpResponse(null, { status: 503 })));

    const { states } = connect(3);

    await expect.poll(() => states).toEqual(["connecting", "disconnected"]);
  });

  it("reconnects manually after giving up, resuming after the last event received", async () => {
    serverGoesDown();
    const { events, states } = connect(3);
    await expect.poll(() => states.at(-1)).toBe("disconnected");

    const urls: string[] = [];
    worker.use(
      sse(`${BASE}/events`, ({ client, request }) => {
        urls.push(request.url);
        client.send(frame(statusEvent(2)));
      }),
    );
    connection!.reconnect();

    await expect.poll(() => events.map((e) => e.id)).toEqual([1, 2]);
    expect(urls).toEqual([`${BASE}/events?since=1`]);
    expect(states.slice(-2)).toEqual(["connecting", "live"]);
  });
});
