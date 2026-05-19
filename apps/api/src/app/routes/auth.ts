import { loginInput, registerInput } from "@chat/shared-contracts";
import { SERVER_EVENTS, type User } from "@chat/shared-types";
import type { CookieSerializeOptions } from "@fastify/cookie";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { env } from "../../lib/env";
import { errors } from "../../lib/errors";
import { REFRESH_TOKEN_TTL_SECONDS } from "../../lib/refresh-token";
import { userRoom } from "../../lib/rooms";
import {
  me as fetchMe,
  login as loginUser,
  logout as logoutUser,
  refresh as refreshTokens,
  register as registerUser,
} from "../../services/auth";
import { findPublicUser } from "../../services/users";

const REFRESH_COOKIE = "refresh_token";

function refreshCookieOptions(): CookieSerializeOptions {
  return {
    httpOnly: true,
    secure: env().NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/auth",
    maxAge: REFRESH_TOKEN_TTL_SECONDS,
  };
}

function setRefreshCookie(reply: FastifyReply, token: string): void {
  reply.setCookie(REFRESH_COOKIE, token, refreshCookieOptions());
}

function clearRefreshCookie(reply: FastifyReply): void {
  reply.clearCookie(REFRESH_COOKIE, { path: "/api/auth" });
}

const userSchema = z.object({
  id: z.string(),
  email: z.string(),
  displayName: z.string(),
  bio: z.string(),
  avatarUrl: z.string().nullable(),
  locale: z.enum(["en", "tr", "et"]),
  isPro: z.boolean(),
  lastSeenAt: z.number().nullable(),
  createdAt: z.number(),
}) satisfies z.ZodType<User>;

const authSuccessSchema = z.object({
  user: userSchema,
  accessToken: z.string(),
});

const accessTokenSchema = z.object({
  accessToken: z.string(),
});

export default function authRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.post(
    "/register",
    {
      schema: {
        body: registerInput,
        response: { 201: authSuccessSchema },
      },
    },
    async (request, reply) => {
      const result = await registerUser(fastify.db, request.body);
      setRefreshCookie(reply, result.refresh.token);
      // Broadcast so every connected client appends this user to their
      // community/users list without waiting on a refresh. They'll get a
      // follow-up `user:online` event when the new user's socket connects
      // a moment later.
      const publicUser = await findPublicUser(fastify.db, result.user.id);
      if (publicUser) {
        fastify.io.emit(SERVER_EVENTS.USER_UPDATED, publicUser);
      }
      reply.code(201);
      return { user: result.user, accessToken: result.accessToken };
    }
  );

  app.post(
    "/login",
    {
      schema: {
        body: loginInput,
        response: { 200: authSuccessSchema },
      },
    },
    async (request, reply) => {
      const { email, password } = request.body;
      const result = await loginUser(fastify.db, email, password);
      setRefreshCookie(reply, result.refresh.token);
      return { user: result.user, accessToken: result.accessToken };
    }
  );

  app.post(
    "/refresh",
    {
      schema: {
        response: { 200: accessTokenSchema },
      },
    },
    async (request, reply) => {
      const raw = request.cookies[REFRESH_COOKIE];
      if (!raw) {
        throw errors.unauthorized("Missing refresh cookie");
      }
      const result = await refreshTokens(fastify.db, raw);
      setRefreshCookie(reply, result.refresh.token);
      return { accessToken: result.accessToken };
    }
  );

  app.post("/logout", async (request, reply) => {
    const raw = request.cookies[REFRESH_COOKIE];
    if (raw) {
      const userId = await logoutUser(fastify.db, raw);
      // Drop every active socket the user has open. Without this, the
      // user's "in-flight" access token (already-authenticated sockets)
      // keeps relaying events until the JWT expires — a logout from one
      // device wouldn't actually log out the other tabs/devices.
      if (userId) {
        fastify.io.in(userRoom(userId)).disconnectSockets(true);
        fastify.log.info({ userId }, "logout: kicked sockets");
      }
    }
    clearRefreshCookie(reply);
    reply.code(204);
    return null;
  });

  app.get(
    "/me",
    {
      preHandler: fastify.requireAuth,
      schema: {
        response: { 200: userSchema },
      },
    },
    (request) => {
      if (!request.userId) {
        throw errors.unauthorized();
      }
      return fetchMe(fastify.db, request.userId);
    }
  );
}
