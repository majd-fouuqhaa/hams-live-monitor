import { http, HttpResponse, sse } from "msw";
import { describe, expect, it } from "vite-plus/test";
import { page } from "vite-plus/test/browser/context";
import { config } from "@/config";
import { renderApp } from "@/test/render-app";
import { worker } from "@/test/msw/worker";
import type { Conversation, ServerEvent } from "../types";

const conv = (
  id: string,
  customer: string,
  status: Conversation["status"],
  extra: Partial<Conversation> = {},
) => ({
  id,
  customer,
  status,
  lastMessage: `Hello from ${customer}`,
  unread: 0,
  updatedAt: new Date().toISOString(),
  ...extra,
});

/** Serves a snapshot and a stream that the test can push events into. The stream opens after the
 *  snapshot has loaded, so events pushed before it connects are held and sent once it does. */
function serve(conversations: Conversation[], lastEventId = 10) {
  const held: ServerEvent[] = [];
  let send: ((event: ServerEvent) => void) | undefined;
  worker.use(
    http.get(`${config.apiUrl}/conversations`, () =>
      HttpResponse.json({ lastEventId, conversations }),
    ),
    sse(`${config.apiUrl}/events`, ({ client }) => {
      send = (event) => client.send({ id: String(event.id), data: JSON.stringify(event) });
      held.splice(0).forEach(send);
    }),
  );
  return { push: (event: ServerEvent) => (send ? send(event) : held.push(event)) };
}

/** A request can wait on `opened` until the test calls `open()`. Created up front, so opening works
 *  whether or not the request has reached its handler yet. */
function gate() {
  let open = () => {};
  const opened = new Promise<void>((resolve) => (open = resolve));
  return { opened, open };
}

describe("conversations list", () => {
  it("lists every conversation in the order the server sent them", async () => {
    serve([
      conv("c-1", "Sara Alqahtani", "ai"),
      conv("c-2", "محمد العتيبي", "needs_human", { unread: 3 }),
      conv("c-3", "John Carter", "closed"),
    ]);

    renderApp();

    const nav = page.getByRole("navigation", { name: "Conversations" });
    await expect.element(nav.getByRole("link", { name: /John Carter/ })).toBeVisible();
    const names = nav
      .getByRole("link")
      .elements()
      .map((link) => link.getAttribute("aria-label"));
    expect(names).toEqual([
      expect.stringMatching(/^Sara Alqahtani, AI handling, /),
      expect.stringMatching(/^محمد العتيبي, Needs human, 3 unread, /),
      expect.stringMatching(/^John Carter, Closed, /),
    ]);
  });

  it("opens the stream from the snapshot's event id, so nothing between the two is lost", async () => {
    const sinceSeen: (string | null)[] = [];
    worker.use(
      http.get(`${config.apiUrl}/conversations`, () =>
        HttpResponse.json({
          lastEventId: 10,
          conversations: [conv("c-1", "Daniel Kim", "ai")],
        }),
      ),
      sse(`${config.apiUrl}/events`, ({ client, request }) => {
        sinceSeen.push(new URL(request.url).searchParams.get("since"));
        // Happened on the server after the snapshot was taken: only a resume from 10 replays it.
        client.send({
          id: "11",
          data: JSON.stringify({
            id: 11,
            type: "status",
            conversationId: "c-1",
            status: "needs_human",
          }),
        });
      }),
    );

    renderApp();

    await expect
      .element(
        page
          .getByRole("navigation", { name: "Conversations" })
          .getByRole("link", { name: /Daniel Kim, Needs human/ }),
      )
      .toBeVisible();
    expect(sinceSeen).toEqual(["10"]);
  });

  it("announces that the conversations are loading, then shows them", async () => {
    const snapshotGate = gate();
    worker.use(
      http.get(`${config.apiUrl}/conversations`, async () => {
        await snapshotGate.opened;
        return HttpResponse.json({
          lastEventId: 10,
          conversations: [conv("c-1", "Sara Alqahtani", "ai")],
        });
      }),
      sse(`${config.apiUrl}/events`, () => {}),
    );
    renderApp();
    const loading = page.getByRole("status", { name: "Loading conversations" });
    await expect.element(loading).toBeInTheDocument();

    snapshotGate.open();

    await expect
      .element(
        page
          .getByRole("navigation", { name: "Conversations" })
          .getByRole("link", { name: /Sara Alqahtani/ }),
      )
      .toBeVisible();
    await expect.element(loading).not.toBeInTheDocument();
  });

  it("updates a live hand-off in place and announces it", async () => {
    const server = serve([conv("c-1", "Sara Alqahtani", "ai"), conv("c-2", "Daniel Kim", "ai")]);
    renderApp();
    const nav = page.getByRole("navigation", { name: "Conversations" });
    await expect.element(nav.getByRole("link", { name: /Daniel Kim/ })).toBeVisible();

    server.push({ id: 11, type: "status", conversationId: "c-2", status: "needs_human" });

    await expect.element(nav.getByRole("link", { name: /Daniel Kim, Needs human/ })).toBeVisible();
    expect(
      nav
        .getByRole("link")
        .elements()
        .map((l) => l.getAttribute("aria-label")),
    ).toEqual([expect.stringMatching(/^Sara Alqahtani/), expect.stringMatching(/^Daniel Kim/)]);
    await expect
      .element(page.getByRole("status").getByText("Daniel Kim needs a human"))
      .toBeInTheDocument();
  });

  it("shows that the AI is replying while a reply streams, then the reply itself", async () => {
    const server = serve([conv("c-1", "Sara Alqahtani", "ai", { lastMessage: "Any update?" })]);
    renderApp();
    const row = page.getByRole("navigation", { name: "Conversations" }).getByRole("link");
    await expect.element(row).toHaveAccessibleName(/Any update\?$/);

    server.push({
      id: 11,
      type: "message_start",
      conversationId: "c-1",
      messageId: "m-1",
      role: "ai",
    });
    server.push({
      id: 12,
      type: "token",
      conversationId: "c-1",
      messageId: "m-1",
      text: "On its way",
    });

    await expect.element(row.getByText("AI is replying", { exact: true })).toBeVisible();
    await expect.element(row).toHaveAccessibleName(/AI is replying, .*: Any update\?$/);

    server.push({ id: 13, type: "message_end", conversationId: "c-1", messageId: "m-1" });

    await expect.element(row).toHaveAccessibleName(/: On its way$/);
    await expect.element(row.getByText("AI is replying", { exact: true })).not.toBeInTheDocument();
  });

  it("opens a conversation on click and clears its unread count", async () => {
    serve([conv("c-1", "Sara Alqahtani", "ai", { unread: 3 }), conv("c-2", "Daniel Kim", "ai")]);
    const { router } = renderApp();
    const nav = page.getByRole("navigation", { name: "Conversations" });

    await nav.getByRole("link", { name: /Sara Alqahtani, AI handling, 3 unread/ }).click();

    await expect
      .element(page.getByRole("heading", { name: "Sara Alqahtani", level: 2 }))
      .toBeVisible();
    expect(router.state.location.pathname).toBe("/conversations/c-1");
    const opened = nav.getByRole("link", { name: /Sara Alqahtani/ });
    await expect.element(opened).toHaveAttribute("aria-current", "page");
    await expect.element(opened).not.toHaveAccessibleName(/unread/);
  });

  it("shows the connection state and lets the user reconnect after the stream gives up", async () => {
    let up = true;
    const sinceSeen: (string | null)[] = [];
    worker.use(
      http.get(`${config.apiUrl}/conversations`, () =>
        HttpResponse.json({
          lastEventId: 10,
          conversations: [conv("c-1", "Sara Alqahtani", "ai")],
        }),
      ),
      http.get(`${config.apiUrl}/events`, () => (up ? undefined : HttpResponse.error())),
      sse(`${config.apiUrl}/events`, ({ client, request }) => {
        sinceSeen.push(new URL(request.url).searchParams.get("since"));
        client.send({
          id: "11",
          data: JSON.stringify({ id: 11, type: "status", conversationId: "c-1", status: "human" }),
        });
        if (sinceSeen.length === 1) {
          up = false; // the server goes down right after dropping us
          setTimeout(() => client.close(), 50);
        }
      }),
    );
    renderApp();
    const connection = page.getByRole("status", { name: "Connection" });

    await expect.element(connection).toHaveTextContent("Disconnected");

    up = true;
    await page.getByRole("button", { name: "Reconnect" }).click();

    await expect.element(connection).toHaveTextContent("Live");
    expect(sinceSeen).toEqual(["10", "11"]);
  });

  it("explains a dropped connection while it reconnects, and clears it once back online", async () => {
    let connections = 0;
    worker.use(
      http.get(`${config.apiUrl}/conversations`, () =>
        HttpResponse.json({
          lastEventId: 10,
          conversations: [conv("c-1", "Sara Alqahtani", "ai")],
        }),
      ),
      sse(`${config.apiUrl}/events`, ({ client }) => {
        connections++;
        if (connections === 1) setTimeout(() => client.close(), 50);
      }),
    );
    renderApp({ retryMs: 1500 }); // long enough to observe the reconnecting state
    const banner = page.getByText("Connection lost. Reconnecting…");

    await expect.element(banner).toBeVisible();
    await expect
      .element(page.getByText("Live updates are paused. What you see may be out of date."))
      .toBeVisible();

    // Back online: the banner goes.
    await expect.element(banner).not.toBeInTheDocument();
  });

  it("shows 99+ for very large unread counts but reads out the exact number", async () => {
    serve([conv("c-1", "Sara Alqahtani", "ai", { unread: 150 })]);
    renderApp();
    const row = page.getByRole("navigation", { name: "Conversations" }).getByRole("link");

    await expect.element(row.getByText("99+", { exact: true })).toBeVisible();
    await expect.element(row).toHaveAccessibleName(/^Sara Alqahtani, AI handling, 150 unread, /);
  });

  it("says so when the conversation in the URL does not exist, and still shows the list", async () => {
    serve([conv("c-1", "Sara Alqahtani", "ai")]);
    renderApp({ path: "/conversations/c-404" });

    await expect.element(page.getByText("Conversation not found")).toBeVisible();
    await expect
      .element(
        page
          .getByRole("navigation", { name: "Conversations" })
          .getByRole("link", { name: /Sara Alqahtani/ }),
      )
      .toBeVisible();
  });

  it("offers a retry when the conversations cannot be loaded", async () => {
    let failing = true;
    serve([conv("c-1", "Sara Alqahtani", "ai")]);
    worker.use(
      http.get(`${config.apiUrl}/conversations`, () =>
        failing ? HttpResponse.json({ error: "down" }, { status: 503 }) : undefined,
      ),
    );
    renderApp();

    const alert = page.getByRole("alert");
    await expect.element(alert.getByText("Couldn't load conversations")).toBeVisible();

    failing = false;
    await alert.getByRole("button", { name: "Retry" }).click();

    await expect
      .element(
        page
          .getByRole("navigation", { name: "Conversations" })
          .getByRole("link", { name: /Sara Alqahtani/ }),
      )
      .toBeVisible();
  });

  it("says there are no conversations yet when the inbox is empty", async () => {
    serve([]);
    renderApp();

    await expect.element(page.getByText("No conversations yet")).toBeVisible();
  });
});
