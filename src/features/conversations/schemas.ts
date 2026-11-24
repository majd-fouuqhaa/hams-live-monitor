// Runtime validation for everything that crosses the network boundary.
import { z } from "zod";
import type { Conversation, ServerEvent, Snapshot } from "./types";

const StatusSchema = z.enum(["ai", "needs_human", "human", "closed"]);

const ConversationSchema = z.object({
  id: z.string(),
  customer: z.string(),
  status: StatusSchema,
  lastMessage: z.string(),
  unread: z.number().int(),
  updatedAt: z.string(),
}) satisfies z.ZodType<Conversation>;

export const SnapshotSchema = z.object({
  lastEventId: z.number().int(),
  conversations: z.array(ConversationSchema),
}) satisfies z.ZodType<Snapshot>;

const MessageSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  role: z.enum(["customer", "ai", "human"]),
  text: z.string(),
  createdAt: z.string(),
});

const base = { id: z.number().int(), conversationId: z.string() };

export const ServerEventSchema = z.discriminatedUnion("type", [
  z.object({ ...base, type: z.literal("message"), message: MessageSchema }),
  z.object({
    ...base,
    type: z.literal("message_start"),
    messageId: z.string(),
    role: z.literal("ai"),
  }),
  z.object({ ...base, type: z.literal("token"), messageId: z.string(), text: z.string() }),
  z.object({ ...base, type: z.literal("message_end"), messageId: z.string() }),
  z.object({ ...base, type: z.literal("status"), status: StatusSchema }),
  z.object({
    ...base,
    type: z.literal("tool_call"),
    name: z.string(),
    args: z.record(z.string(), z.unknown()),
  }),
]) satisfies z.ZodType<ServerEvent>;
