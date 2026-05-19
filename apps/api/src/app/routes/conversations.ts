import type { FastifyInstance } from "fastify";
import { errors } from "../../lib/errors";
import { listConversations } from "../../services/conversations";

export default function conversationsRoutes(fastify: FastifyInstance) {
  fastify.get("/", { preHandler: fastify.requireAuth }, (request) => {
    if (!request.userId) {
      throw errors.unauthorized();
    }
    return listConversations(fastify.db, request.userId);
  });
}
