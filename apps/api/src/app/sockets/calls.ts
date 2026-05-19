import { SERVER_EVENTS } from "@chat/shared-types";
import type { FastifyInstance } from "fastify";
import type { Socket, Server as SocketIOServer } from "socket.io";
import { z } from "zod";
import { userRoom } from "../../lib/rooms";
import { presence } from "../../services/presence";
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

// ─── Payload schemas ────────────────────────────────────────────────────────
// SDP/ICE are opaque to the server (per PRD §8.3 note). We only validate
// that the routing fields are present and well-shaped — passthrough fields
// are left untyped so unknown SDP/ICE shapes from future browsers don't
// break the relay.
const initiatePayload = z.object({
  toUserId: z.uuid(),
  callType: z.enum(["audio", "video"]),
});

const acceptPayload = z.object({ fromUserId: z.uuid() });
const rejectPayload = z.object({
  fromUserId: z.uuid(),
  reason: z.string().max(120).optional(),
});

// `sdp` and `candidate` are passthrough — server doesn't inspect them.
// Using z.unknown() preserves the field for relay without enforcing a
// type the server doesn't need to know.
const signalPayload = z.object({
  toUserId: z.uuid(),
  sdp: z.unknown().optional(),
  candidate: z.unknown().optional(),
});

const endPayload = z.object({ toUserId: z.uuid() });

export function registerCallHandlers(
  io: ChatIo,
  socket: ChatSocket,
  fastify: FastifyInstance
): void {
  const callerId = socket.data.userId;

  // ─── call:initiate ────────────────────────────────────────────────────────
  socket.on("call:initiate", async (rawPayload) => {
    const parsed = initiatePayload.safeParse(rawPayload);
    if (!parsed.success) {
      socket.emit(SERVER_EVENTS.ERROR, {
        code: "INVALID_PAYLOAD",
        message: parsed.error.issues[0]?.message ?? "Invalid call payload",
      });
      return;
    }
    const { toUserId, callType } = parsed.data;

    // Self-call is meaningless — silently drop.
    if (toUserId === callerId) {
      return;
    }

    if (!presence.isOnline(toUserId)) {
      socket.emit(SERVER_EVENTS.ERROR, {
        code: "CALLEE_OFFLINE",
        message: "User is offline",
      });
      return;
    }

    const fromUser = await findPublicUser(fastify.db, callerId).catch(
      () => null
    );
    if (!fromUser) {
      socket.emit(SERVER_EVENTS.ERROR, {
        code: "INTERNAL",
        message: "Caller profile not found",
      });
      return;
    }

    io.to(userRoom(toUserId)).emit(SERVER_EVENTS.CALL_INCOMING, {
      fromUser,
      callType,
    });
    fastify.log.info({ callerId, toUserId, callType }, "call:initiate");
  });

  // ─── call:accept ──────────────────────────────────────────────────────────
  socket.on("call:accept", (rawPayload) => {
    const parsed = acceptPayload.safeParse(rawPayload);
    if (!parsed.success) {
      return;
    }
    io.to(userRoom(parsed.data.fromUserId)).emit(SERVER_EVENTS.CALL_ACCEPTED, {
      fromUserId: callerId,
    });
  });

  // ─── call:reject ──────────────────────────────────────────────────────────
  socket.on("call:reject", (rawPayload) => {
    const parsed = rejectPayload.safeParse(rawPayload);
    if (!parsed.success) {
      return;
    }
    io.to(userRoom(parsed.data.fromUserId)).emit(SERVER_EVENTS.CALL_REJECTED, {
      fromUserId: callerId,
      reason: parsed.data.reason,
    });
  });

  // ─── call:offer / call:answer / call:ice — opaque passthrough ───────────
  // Server rewrites toUserId → fromUserId so the recipient knows the source.
  // Trusting socket.data.userId here is the whole point of the auth handshake.
  function relaySignal(
    eventName:
      | typeof SERVER_EVENTS.CALL_OFFER
      | typeof SERVER_EVENTS.CALL_ANSWER
      | typeof SERVER_EVENTS.CALL_ICE,
    rawPayload: unknown
  ): void {
    const parsed = signalPayload.safeParse(rawPayload);
    if (!parsed.success) {
      return;
    }
    const { toUserId, sdp, candidate } = parsed.data;
    io.to(userRoom(toUserId)).emit(eventName, {
      fromUserId: callerId,
      sdp: sdp as RTCSessionDescriptionInit | undefined,
      candidate: candidate as RTCIceCandidateInit | undefined,
    });
  }

  socket.on("call:offer", (payload) => {
    relaySignal(SERVER_EVENTS.CALL_OFFER, payload);
  });
  socket.on("call:answer", (payload) => {
    relaySignal(SERVER_EVENTS.CALL_ANSWER, payload);
  });
  socket.on("call:ice", (payload) => {
    relaySignal(SERVER_EVENTS.CALL_ICE, payload);
  });

  // ─── call:end ────────────────────────────────────────────────────────────
  socket.on("call:end", (rawPayload) => {
    const parsed = endPayload.safeParse(rawPayload);
    if (!parsed.success) {
      return;
    }
    io.to(userRoom(parsed.data.toUserId)).emit(SERVER_EVENTS.CALL_ENDED, {
      fromUserId: callerId,
      reason: "hangup",
    });
  });
}
