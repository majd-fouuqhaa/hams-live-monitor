import { sse } from "msw";
import { describe, expect, it } from "vite-plus/test";
import { worker } from "./worker";

// Toolchain contract: MSW's sse() must drive a real browser EventSource, including event ids and the
// `since` query param, because every stream test in this repo relies on it.
describe("MSW sse() with a real EventSource", () => {
  it("delivers framed events and exposes the since param", async () => {
    const seenSince: (string | null)[] = [];
    worker.use(
      sse("*/events", ({ client, request }) => {
        seenSince.push(new URL(request.url).searchParams.get("since"));
        client.send({ id: "1", data: JSON.stringify({ id: 1, type: "token", text: "مرحبا" }) });
        client.send({ id: "2", data: JSON.stringify({ id: 2, type: "token", text: " hi" }) });
      }),
    );

    const source = new EventSource("http://localhost:4000/events?since=0");
    const received = await new Promise<{ lastEventId: string; data: unknown }[]>(
      (resolve, reject) => {
        const out: { lastEventId: string; data: unknown }[] = [];
        source.onmessage = (e) => {
          out.push({ lastEventId: e.lastEventId, data: JSON.parse(e.data as string) });
          if (out.length === 2) resolve(out);
        };
        source.onerror = () => reject(new Error("stream errored before both events arrived"));
      },
    );
    source.close();

    expect(seenSince).toEqual(["0"]);
    expect(received.map((e) => e.lastEventId)).toEqual(["1", "2"]);
    expect(received[0]?.data).toMatchObject({ text: "مرحبا" });
  });

  it("surfaces a server-side drop as onerror", async () => {
    worker.use(
      sse("*/events", ({ client }) => {
        client.send({ id: "1", data: "{}" });
        queueMicrotask(() => client.error());
      }),
    );

    const source = new EventSource("http://localhost:4000/events");
    await new Promise<void>((resolve) => {
      source.onerror = () => resolve();
    });
    source.close();
  });
});
