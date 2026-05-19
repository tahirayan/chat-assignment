import { z } from "zod";

export const sendMessageInput = z.object({
  recipientId: z.uuid(),
  body: z.string().min(1).max(2000).trim(),
  clientId: z.string().min(1).max(64),
});
export type SendMessageInput = z.infer<typeof sendMessageInput>;

export const messageHistoryQuery = z.object({
  before: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).default(50),
});
export type MessageHistoryQuery = z.infer<typeof messageHistoryQuery>;
