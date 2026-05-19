import type { FastifyInstance } from "fastify";

export default function root(fastify: FastifyInstance) {
  fastify.get("/health", () => ({ status: "ok" }));
}
