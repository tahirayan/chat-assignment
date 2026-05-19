import type { Conversation, Message, PublicUser } from "@chat/shared-types";
import { desc, eq, inArray, or } from "drizzle-orm";
import type { DrizzleDb } from "../db/client";
import { messages, users } from "../db/schema";
import { presence } from "./presence";

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

function toPublicUser(
  row: typeof users.$inferSelect,
  isOnline: boolean
): PublicUser {
  return {
    id: row.id,
    displayName: row.displayName,
    bio: row.bio,
    avatarUrl: row.avatarUrl,
    locale: row.locale as PublicUser["locale"],
    isPro: row.isPro,
    lastSeenAt: row.lastSeenAt ? row.lastSeenAt.getTime() : null,
    createdAt: row.createdAt.getTime(),
    isOnline,
  };
}

/**
 * Build the recents list for a user. Conversations are derived (not stored):
 * one entry per unique partner the user has exchanged messages with, sorted
 * by latest-message createdAt DESC.
 *
 * Implementation: two queries + JS aggregation. Loads every message
 * involving the user once and walks them in DESC order to find latest +
 * count unread per partner. For demo loads (low thousands of messages per
 * user) this is plenty fast. A pure-SQL aggregation (window functions /
 * CTE) would scale further; flagged as a known optimization in REPORT.md.
 */
export async function listConversations(
  db: DrizzleDb,
  currentUserId: string
): Promise<Conversation[]> {
  const allMessages = await db.query.messages.findMany({
    where: or(
      eq(messages.senderId, currentUserId),
      eq(messages.recipientId, currentUserId)
    ),
    orderBy: [desc(messages.createdAt)],
  });

  if (allMessages.length === 0) {
    return [];
  }

  const lastByPartner = new Map<string, typeof messages.$inferSelect>();
  const unreadByPartner = new Map<string, number>();

  for (const m of allMessages) {
    const partnerId = m.senderId === currentUserId ? m.recipientId : m.senderId;
    // Messages are already in DESC order — first seen per partner is latest.
    if (!lastByPartner.has(partnerId)) {
      lastByPartner.set(partnerId, m);
    }
    if (m.recipientId === currentUserId && m.readAt === null) {
      unreadByPartner.set(partnerId, (unreadByPartner.get(partnerId) ?? 0) + 1);
    }
  }

  const partnerIds = Array.from(lastByPartner.keys());
  const partnerRows = await db.query.users.findMany({
    where: inArray(users.id, partnerIds),
  });
  const partnerById = new Map(partnerRows.map((p) => [p.id, p]));

  const conversations: Conversation[] = [];
  for (const [partnerId, lastMsg] of lastByPartner) {
    const partnerRow = partnerById.get(partnerId);
    if (!partnerRow) {
      continue;
    }
    conversations.push({
      partner: toPublicUser(partnerRow, presence.isOnline(partnerId)),
      lastMessage: toApiMessage(lastMsg),
      unreadCount: unreadByPartner.get(partnerId) ?? 0,
    });
  }

  return conversations.sort(
    (a, b) => b.lastMessage.createdAt - a.lastMessage.createdAt
  );
}
