import { sendMessageInput } from "@chat/shared-contracts";
import { SERVER_EVENTS } from "@chat/shared-types";
import type { FastifyInstance } from "fastify";
import type { Socket, Server as SocketIOServer } from "socket.io";
import { z } from "zod";
import { userRoom } from "../../lib/rooms";
import { insertMessage, markRead } from "../../services/messages";
import { fanOutPush } from "../../services/push";
import { findPublicUser } from "../../services/users";
import type {
  ClientToServerEvents,
  InterServerEvents,
  ServerToClientEvents,
  SocketData,
} from "./events";

type ChatIo = SocketIOServer<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

type ChatSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

const readPayload = z.object({ otherUserId: z.uuid() });
const typingPayload = z.object({ otherUserId: z.uuid() });

export function registerMessageHandlers(
  io: ChatIo,
  socket: ChatSocket,
  fastify: FastifyInstance
): void {
  // ─── message:send ────────────────────────────────────────────────────────
  socket.on("message:send", (rawPayload) => {
    const parsed = sendMessageInput.safeParse(rawPayload);
    if (!parsed.success) {
      socket.emit(SERVER_EVENTS.ERROR, {
        code: "INVALID_PAYLOAD",
        message: parsed.error.issues[0]?.message ?? "Invalid message payload",
      });
      return;
    }

    const { recipientId, body, clientId } = parsed.data;
    // Authority comes from the handshake — NEVER trust a senderId from the
    // client payload (see socket-events skill anti-pattern).
    const senderId = socket.data.userId;

    let msg: ReturnType<typeof insertMessage>;
    try {
      msg = insertMessage(fastify.db, senderId, recipientId, body);
    } catch (err) {
      fastify.log.error({ err, senderId, recipientId }, "message:send failed");
      socket.emit(SERVER_EVENTS.ERROR, {
        code: "INTERNAL",
        message: "Failed to send message",
      });
      return;
    }

    // 1. Delivered receipt to the sender (all their tabs) — must arrive
    //    before message:new so the sending tab can reconcile its optimistic
    //    msg's clientId → server id, then dedup the echoed message:new.
    io.to(userRoom(senderId)).emit(SERVER_EVENTS.MESSAGE_DELIVERED, {
      clientId,
      id: msg.id,
      createdAt: msg.createdAt,
    });

    // 2. message:new to the recipient AND back to the sender's room. The
    //    sender's own tab dedupes by id (clientId was just swapped → server
    //    id is now present in its store). Other tabs of the same user pick
    //    up the new message naturally.
    io.to(userRoom(recipientId)).emit(SERVER_EVENTS.MESSAGE_NEW, msg);
    io.to(userRoom(senderId)).emit(SERVER_EVENTS.MESSAGE_NEW, msg);

    // 3. Phase 20 Web Push fan-out — fire-and-forget. Sent to every saved
    //    subscription of the recipient regardless of socket state; the
    //    service worker dedup-checks against `clients.matchAll()` so
    //    online devices don't double-pop while closed devices still wake.
    (async () => {
      try {
        const sender = await findPublicUser(fastify.db, senderId);
        if (!sender) {
          return;
        }
        await fanOutPush(fastify, recipientId, {
          kind: "message",
          senderId,
          senderName: sender.displayName,
          body: body.slice(0, 140),
          // Don't ship data-URL avatars through Web Push — payload size
          // limit is 4 KB; only forward https URLs.
          iconUrl: sender.avatarUrl?.startsWith("https://")
            ? sender.avatarUrl
            : null,
          threadUrl: `/chat/${senderId}`,
        });
      } catch (err) {
        fastify.log.warn({ err }, "web-push fanout failed (message)");
      }
    })().catch(() => undefined);
  });

  // ─── message:read ────────────────────────────────────────────────────────
  // Client signals: "I just read everything from `otherUserId`."
  // Server marks DB then broadcasts to the *original sender's* room so
  // their bubble flips ✓ → ✓✓ in real time.
  socket.on("message:read", (rawPayload) => {
    const parsed = readPayload.safeParse(rawPayload);
    if (!parsed.success) {
      return;
    }
    const readerId = socket.data.userId;
    const { otherUserId } = parsed.data;
    const result = markRead(fastify.db, readerId, otherUserId);
    if (result.readAt === null) {
      // Nothing changed — don't bother broadcasting.
      return;
    }
    io.to(userRoom(otherUserId)).emit(SERVER_EVENTS.MESSAGE_READ, {
      readerId,
      readAt: result.readAt,
    });
  });

  // ─── typing:start / typing:stop ─────────────────────────────────────────
  // Pure passthrough — no persistence. Server replaces the payload's identity
  // with socket.data.userId (handshake-verified) so the recipient can trust it.
  socket.on("typing:start", (rawPayload) => {
    const parsed = typingPayload.safeParse(rawPayload);
    if (!parsed.success) {
      return;
    }
    io.to(userRoom(parsed.data.otherUserId)).emit(SERVER_EVENTS.TYPING_START, {
      fromUserId: socket.data.userId,
    });
  });

  socket.on("typing:stop", (rawPayload) => {
    const parsed = typingPayload.safeParse(rawPayload);
    if (!parsed.success) {
      return;
    }
    io.to(userRoom(parsed.data.otherUserId)).emit(SERVER_EVENTS.TYPING_STOP, {
      fromUserId: socket.data.userId,
    });
  });
}
