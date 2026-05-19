import type { Message } from "@chat/shared-types";
import { and, desc, eq, isNull, lt, or } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import type { DrizzleDb } from "../db/client";
import { messages } from "../db/schema";

function toApiMessage(row: typeof messages.$inferSelect): Message {
  return {
    id: row.id,
    senderId: row.senderId,
    recipientId: row.recipientId,
    body: row.body,
    createdAt: row.createdAt.getTime(),
    readAt: row.readAt ? row.readAt.getTime() : null,
  };
}

/**
 * Conversation history between currentUserId and otherUserId, newest first.
 * Cursor-paginated via `before` (epoch ms) so the client can scroll up to
 * load older pages.
 */
export async function listConversation(
  db: DrizzleDb,
  currentUserId: string,
  otherUserId: string,
  options: { before?: number; limit?: number } = {}
): Promise<Message[]> {
  const limit = options.limit ?? 50;
  const beforeDate =
    options.before === undefined ? undefined : new Date(options.before);

  const rows = await db.query.messages.findMany({
    where: and(
      or(
        and(
          eq(messages.senderId, currentUserId),
          eq(messages.recipientId, otherUserId)
        ),
        and(
          eq(messages.senderId, otherUserId),
          eq(messages.recipientId, currentUserId)
        )
      ),
      beforeDate ? lt(messages.createdAt, beforeDate) : undefined
    ),
    orderBy: [desc(messages.createdAt)],
    limit,
  });

  return rows.map(toApiMessage);
}

/**
 * Mark every unread message FROM otherUser TO currentUser as read. Returns
 * the timestamp the rows were marked at, or null if nothing was marked.
 */
export function markRead(
  db: DrizzleDb,
  currentUserId: string,
  otherUserId: string
): { readAt: number } | { readAt: null } {
  const readAt = Date.now();
  const result = db
    .update(messages)
    .set({ readAt: new Date(readAt) })
    .where(
      and(
        eq(messages.senderId, otherUserId),
        eq(messages.recipientId, currentUserId),
        isNull(messages.readAt)
      )
    )
    .run();
  if (result.changes === 0) {
    return { readAt: null };
  }
  return { readAt };
}

/** Inserts a new message with a fresh server id + createdAt. */
export function insertMessage(
  db: DrizzleDb,
  senderId: string,
  recipientId: string,
  body: string
): Message {
  const id = uuidv7();
  const createdAt = new Date();
  db.insert(messages)
    .values({ id, senderId, recipientId, body, createdAt })
    .run();
  return {
    id,
    senderId,
    recipientId,
    body,
    createdAt: createdAt.getTime(),
    readAt: null,
  };
}
