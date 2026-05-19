import { messageHistoryQuery } from "@chat/shared-contracts";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { errors } from "../../lib/errors";
import { listConversation, markRead } from "../../services/messages";

const otherUserIdParam = z.object({
  otherUserId: z.uuid(),
});

export default function messagesRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.get(
    "/:otherUserId",
    {
      preHandler: fastify.requireAuth,
      schema: {
        params: otherUserIdParam,
        querystring: messageHistoryQuery,
      },
    },
    (request) => {
      if (!request.userId) {
        throw errors.unauthorized();
      }
      const { otherUserId } = request.params;
      const { before, limit } = request.query;
      return listConversation(fastify.db, request.userId, otherUserId, {
        before,
        limit,
      });
    }
  );

  app.post(
    "/:otherUserId/read",
    {
      preHandler: fastify.requireAuth,
      schema: { params: otherUserIdParam },
    },
    (request, reply) => {
      if (!request.userId) {
        throw errors.unauthorized();
      }
      const { otherUserId } = request.params;
      markRead(fastify.db, request.userId, otherUserId);
      reply.code(204);
      return null;
    }
  );
}
