import cookie from "@fastify/cookie";
import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";

export default fp(
  async (fastify: FastifyInstance) => {
    await fastify.register(cookie);
  },
  { name: "@chat/cookie" }
);
