import type { Message } from "./message";
import type { PublicUser } from "./user";

/**
 * Derived from messages — one per unique (currentUser, partner) pair where at
 * least one message exists. Not its own DB table.
 */
export interface Conversation {
  lastMessage: Message;
  partner: PublicUser;
  unreadCount: number;
}
