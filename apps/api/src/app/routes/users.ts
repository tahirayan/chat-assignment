import { updateProfileInput } from "@chat/shared-contracts";
import { SERVER_EVENTS } from "@chat/shared-types";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { errors } from "../../lib/errors";
import {
  findPublicUser,
  listOtherUsers,
  updateProfile,
} from "../../services/users";

export default function usersRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.get("/", { preHandler: fastify.requireAuth }, (request) => {
    if (!request.userId) {
      throw errors.unauthorized();
    }
    return listOtherUsers(fastify.db, request.userId);
  });

  app.patch(
    "/me",
    {
      preHandler: fastify.requireAuth,
      schema: { body: updateProfileInput },
    },
    async (request) => {
      if (!request.userId) {
        throw errors.unauthorized();
      }
      const updated = await updateProfile(
        fastify.db,
        request.userId,
        request.body
      );
      // Broadcast the new public profile so other tabs / other users see
      // the change in real time (display name in conversation rows,
      // avatar across UserAvatar, locale-driven UI, Pro badge, etc.).
      const publicUser = await findPublicUser(fastify.db, updated.id);
      if (publicUser) {
        fastify.io.emit(SERVER_EVENTS.USER_UPDATED, publicUser);
      }
      return updated;
    }
  );
}
