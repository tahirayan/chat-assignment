import sensible from "@fastify/sensible";
import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";

/**
 * @fastify/sensible utilities (httpErrors, etc).
 * @see https://github.com/fastify/fastify-sensible
 */
export default fp(
  (fastify: FastifyInstance) => {
    fastify.register(sensible);
  },
  { name: "@chat/sensible" }
);
