import { http, HttpResponse, sse } from "msw";
import { describe, expect, it } from "vite-plus/test";
import { page } from "vite-plus/test/browser/context";
import { config } from "@/config";
import { renderApp } from "@/test/render-app";
import { worker } from "@/test/msw/worker";
import type { Conversation, Message, ServerEvent } from "../types";

const API = config.apiUrl;

const conv = (status: Conversation["status"], extra: Partial<Conversation> = {}): Conversation => ({
  id: "c-1",
  customer: "Sara Alqahtani",
  status,
  lastMessage: "Any update?",
  unread: 0,
  updatedAt: new Date().toISOString(),
  ...extra,
});

const msg = (id: string, text: string, extra: Partial<Message> = {}): Message => ({
  id,
  conversationId: "c-1",
  role: "customer",
  text,
  createdAt: new Date().toISOString(),
  ...extra,
});

/** Serves one conversation, its messages, and a stream the test pushes into (held until it connects). */
function serve(conversation: Conversation, messages: Message[] = [msg("m-1", "Any update?")]) {
  const held: ServerEvent[] = [];
  let send: ((event: ServerEvent) => void) | undefined;
  worker.use(
    http.get(`${API}/conversations`, () =>
      HttpResponse.json({ lastEventId: 10, conversations: [conversation] }),
    ),
    http.get(`${API}/conversations/c-1/messages`, () =>
      HttpResponse.json({ lastEventId: 10, messages }),
    ),
    sse(`${API}/events`, ({ client }) => {
      send = (event) => client.send({ id: String(event.id), data: JSON.stringify(event) });
      held.splice(0).forEach(send);
    }),
  );
  return {
    push: (...events: ServerEvent[]) => events.forEach((e) => (send ? send(e) : held.push(e))),
  };
}

const thread = () => page.getByRole("list", { name: "Messages" });
const row = () => page.getByRole("navigation", { name: "Conversations" }).getByRole("link");

describe("conversation thread", () => {
  it("shows the AI's reply word by word, in this conversation only", async () => {
    const server = serve(conv("ai"));
    renderApp({ path: "/conversations/c-1" });
    await expect.element(thread().getByText("Any update?")).toBeVisible();

    server.push(
      { id: 11, type: "message_start", conversationId: "c-1", messageId: "m-2", role: "ai" },
      { id: 12, type: "token", conversationId: "c-1", messageId: "m-2", text: "On" },
      { id: 13, type: "token", conversationId: "c-1", messageId: "m-2", text: " its way" },
    );

    await expect.element(thread().getByText("On its way")).toBeVisible();
    await expect.element(thread().getByText("Replying")).toBeVisible();
  });

  it("shows a hand-off's reason in the thread and offers to take over", async () => {
    const server = serve(conv("ai"));
    renderApp({ path: "/conversations/c-1" });
    await expect.element(thread().getByText("Any update?")).toBeVisible();

    server.push(
      {
        id: 11,
        type: "tool_call",
        conversationId: "c-1",
        name: "transfer_to_human",
        args: { reason: "Refund above limit" },
      },
      { id: 12, type: "status", conversationId: "c-1", status: "needs_human" },
    );

    await expect.element(thread().getByText(/Handed to a human/)).toBeVisible();
    await expect.element(thread().getByText("Refund above limit")).toBeVisible();
    await expect.element(page.getByRole("button", { name: "Take over" })).toBeEnabled();
  });

  it("marks a conversation opened from its link as read, and keeps it read while open", async () => {
    const server = serve(conv("ai", { unread: 3 }));
    renderApp({ path: "/conversations/c-1" });

    await expect.element(row()).toHaveAccessibleName(/^Sara Alqahtani, AI handling, /);
    await expect.element(row()).not.toHaveAccessibleName(/unread/);

    server.push({ id: 11, type: "message", conversationId: "c-1", message: msg("m-2", "Hello?") });

    await expect.element(thread().getByText("Hello?")).toBeVisible();
    await expect.element(row()).not.toHaveAccessibleName(/unread/);
  });

  describe("replying", () => {
    function replyServer(answer: () => Response | Promise<Response>) {
      const server = serve(conv("human"));
      const posted: { text: string; clientMessageId: string }[] = [];
      worker.use(
        http.post(`${API}/conversations/c-1/messages`, async ({ request }) => {
          posted.push((await request.json()) as (typeof posted)[number]);
          return answer();
        }),
      );
      return { ...server, posted };
    }

    const reply = () => page.getByRole("textbox", { name: "Reply" });

    it("shows a sent reply at once, marks it sent on 201, and places it when the stream echoes it", async () => {
      const server = replyServer(() => HttpResponse.json({}, { status: 201 }));
      renderApp({ path: "/conversations/c-1" });

      await reply().fill("On it");
      await page.getByRole("button", { name: "Send" }).click();

      await expect.element(thread().getByText("On it")).toBeVisible();
      await expect.element(thread().getByText("Sent", { exact: true })).toBeVisible();

      const { clientMessageId } = server.posted[0]!;
      server.push({
        id: 11,
        type: "message",
        conversationId: "c-1",
        message: msg("m-2", "On it", { role: "human", clientMessageId }),
      });

      await expect.element(thread().getByText("Sent", { exact: true })).not.toBeInTheDocument();
      expect(thread().getByText("On it").elements()).toHaveLength(1);
    });

    it("rolls a rejected reply back, says why, and puts the text back in the box", async () => {
      replyServer(() =>
        HttpResponse.json({ error: "Random failure, please retry" }, { status: 500 }),
      );
      renderApp({ path: "/conversations/c-1" });

      await reply().fill("On it");
      await page.getByRole("button", { name: "Send" }).click();

      await expect
        .element(page.getByRole("alert"))
        .toHaveTextContent("Random failure, please retry");
      await expect.element(thread().getByText("On it")).not.toBeInTheDocument();
      await expect.element(reply()).toHaveValue("On it");
    });

    it("lets the user type but not send until the messages have loaded", async () => {
      serve(conv("human"));
      let release = () => {};
      worker.use(
        http.get(`${API}/conversations/c-1/messages`, async () => {
          await new Promise<void>((r) => (release = r));
          return HttpResponse.json({ lastEventId: 10, messages: [] });
        }),
      );
      renderApp({ path: "/conversations/c-1" });

      await reply().fill("On it");
      await expect.element(page.getByRole("button", { name: "Send" })).toBeDisabled();

      release();
      await expect.element(page.getByRole("button", { name: "Send" })).toBeEnabled();
    });
  });
});
