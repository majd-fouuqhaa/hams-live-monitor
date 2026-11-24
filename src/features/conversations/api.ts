// REST calls to the mock server. Every response is validated at the boundary (schemas.ts).
import { ErrorBodySchema, SnapshotSchema, ThreadSnapshotSchema } from "./schemas";
import type { Api } from "./types";

/** A failed request, carrying the server's own error text when it sent one. */
export class ApiError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

async function request(url: string, init: RequestInit, what: string): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (error) {
    if (init.signal?.aborted) throw error;
    throw new ApiError(`${what}: the server could not be reached`);
  }
  const body: unknown = await res.json().catch(() => null);

  if (!res.ok) {
    const parsed = ErrorBodySchema.safeParse(body);
    throw new ApiError(
      parsed.success ? parsed.data.error : `${what} failed (${res.status})`,
      res.status,
    );
  }

  return body;
}

const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export function createApi(baseUrl: string): Api {
  return {
    async getConversations(signal) {
      return SnapshotSchema.parse(
        await request(`${baseUrl}/conversations`, { signal }, "Loading conversations"),
      );
    },
    async getMessages(conversationId, signal) {
      return ThreadSnapshotSchema.parse(
        await request(
          `${baseUrl}/conversations/${encodeURIComponent(conversationId)}/messages`,
          { signal },
          "Loading messages",
        ),
      );
    },
    async takeOver(conversationId) {
      await request(
        `${baseUrl}/conversations/${encodeURIComponent(conversationId)}/takeover`,
        { method: "POST" },
        "Taking over",
      );
    },
    async sendMessage(conversationId, text, clientMessageId) {
      await request(
        `${baseUrl}/conversations/${encodeURIComponent(conversationId)}/messages`,
        json({ text, clientMessageId }),
        "Sending",
      );
    },
  };
}
