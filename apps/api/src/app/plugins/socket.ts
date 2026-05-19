import { SERVER_EVENTS } from "@chat/shared-types";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { Server as SocketIOServer } from "socket.io";
import { users } from "../../db/schema";
import { env } from "../../lib/env";
import { verifyAccessToken } from "../../lib/jwt";
import { userRoom } from "../../lib/rooms";
import { presence } from "../../services/presence";
import { registerCallHandlers } from "../sockets/calls";
import type {
  ClientToServerEvents,
  InterServerEvents,
  ServerToClientEvents,
  SocketData,
} from "../sockets/events";
import { registerMessageHandlers } from "../sockets/messages";

type ChatSocketServer = SocketIOServer<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

declare module "fastify" {
  interface FastifyInstance {
    io: ChatSocketServer;
  }
}

interface HandshakeAuth {
  token?: string;
}

export default fp(
  (fastify: FastifyInstance) => {
    const io: ChatSocketServer = new SocketIOServer(fastify.server, {
      cors: { origin: env().CORS_ORIGIN, credentials: true },
    });

    // ─── Handshake: JWT in auth.token ─────────────────────────────────────
    io.use(async (socket, next) => {
      const auth = socket.handshake.auth as HandshakeAuth | undefined;
      const token = auth?.token;
      if (!token) {
        next(new Error("unauthorized"));
        return;
      }
      try {
        const payload = await verifyAccessToken(token, env().JWT_SECRET);
        // Reject already-expired tokens at the handshake — jose throws on
        // expired tokens, but defense-in-depth here avoids a window where
        // the timer fires with a negative delay.
        const nowSec = Math.floor(Date.now() / 1000);
        if (payload.exp <= nowSec) {
          next(new Error("unauthorized"));
          return;
        }
        socket.data.userId = payload.sub;
        socket.data.email = payload.email;
        socket.data.tokenExp = payload.exp;
        socket.data.expiryTimer = null;
        next();
      } catch {
        next(new Error("unauthorized"));
      }
    });

    // ─── Connection: track presence + broadcast user:online (first socket) ─
    io.on("connection", (socket) => {
      const { userId } = socket.data;
      const { firstSocket } = presence.track(userId, socket.id);
      socket.join(userRoom(userId));

      // ─── JWT expiry enforcement ────────────────────────────────────────
      // Schedule a disconnect at the token's exp claim so a socket can't
      // outlive its access-token TTL (PRD §9.1: 15-min access tokens).
      // The client receives an error event right before the disconnect so
      // it can call /auth/refresh and reconnect cleanly.
      const msUntilExpiry = socket.data.tokenExp * 1000 - Date.now();
      // Cap to MAX_INT32 to keep setTimeout happy across runtimes; nominal
      // 15-min tokens are nowhere near the limit.
      const safeMs = Math.min(msUntilExpiry, 2_147_483_647);
      socket.data.expiryTimer = setTimeout(
        () => {
          socket.emit(SERVER_EVENTS.ERROR, {
            code: "TOKEN_EXPIRED",
            message: "Access token expired",
          });
          socket.disconnect(true);
        },
        Math.max(safeMs, 0)
      );

      if (firstSocket) {
        // Broadcast to everyone except this user's own room.
        socket.broadcast.emit(SERVER_EVENTS.USER_ONLINE, { userId });
        fastify.log.info({ userId }, "user:online");
      }

      // Defense-in-depth: even if the expiry timer is delayed (event-loop
      // pressure, clock skew), block any event from a socket whose JWT
      // has expired. Runs before every handler dispatch.
      socket.use(([eventName], next) => {
        const nowSec = Math.floor(Date.now() / 1000);
        if (socket.data.tokenExp <= nowSec) {
          socket.emit(SERVER_EVENTS.ERROR, {
            code: "TOKEN_EXPIRED",
            message: "Access token expired",
          });
          socket.disconnect(true);
          fastify.log.warn(
            { userId: socket.data.userId, eventName },
            "rejected event from expired-token socket"
          );
          return;
        }
        next();
      });

      registerMessageHandlers(io, socket, fastify);
      registerCallHandlers(io, socket, fastify);

      socket.on("disconnect", () => {
        if (socket.data.expiryTimer) {
          clearTimeout(socket.data.expiryTimer);
          socket.data.expiryTimer = null;
        }
        const { lastSocket } = presence.untrack(userId, socket.id);
        if (!lastSocket) {
          return;
        }
        const lastSeenAt = Date.now();
        socket.broadcast.emit(SERVER_EVENTS.USER_OFFLINE, {
          userId,
          lastSeenAt,
        });
        fastify.log.info({ userId }, "user:offline");
        // Persist lastSeenAt (fire-and-forget — DB write must not block).
        try {
          fastify.db
            .update(users)
            .set({ lastSeenAt: new Date(lastSeenAt) })
            .where(eq(users.id, userId))
            .run();
        } catch (err) {
          fastify.log.error(
            { err, userId },
            "failed to persist lastSeenAt on disconnect"
          );
        }
      });
    });

    fastify.decorate("io", io);

    fastify.addHook("onClose", async () => {
      await io.close();
    });
  },
  { name: "@chat/socket" }
);
