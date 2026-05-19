import cors from "@fastify/cors";
import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { env } from "../../lib/env";

export default fp(
  async (fastify: FastifyInstance) => {
    await fastify.register(cors, {
      origin: env().CORS_ORIGIN,
      credentials: true,
    });
  },
  { name: "@chat/cors" }
);
