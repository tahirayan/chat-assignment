import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { env } from "../../lib/env";
import { errors } from "../../lib/errors";
import { verifyAccessToken } from "../../lib/jwt";

declare module "fastify" {
  interface FastifyInstance {
    /**
     * Use as a route preHandler to require a valid access token.
     * Populates `request.userId` with the JWT subject.
     */
    requireAuth: (
      request: FastifyRequest,
      reply: FastifyReply
    ) => Promise<void>;
  }
  interface FastifyRequest {
    userId?: string;
  }
}

export default fp(
  (fastify: FastifyInstance) => {
    fastify.decorate(
      "requireAuth",
      async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
        const header = request.headers.authorization;
        if (!header?.startsWith("Bearer ")) {
          throw errors.unauthorized(
            "Missing or malformed Authorization header"
          );
        }
        const token = header.slice("Bearer ".length).trim();
        try {
          const payload = await verifyAccessToken(token, env().JWT_SECRET);
          request.userId = payload.sub;
        } catch {
          throw errors.unauthorized("Invalid or expired access token");
        }
      }
    );
  },
  { name: "@chat/auth" }
);
