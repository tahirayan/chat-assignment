import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { createDb, type DrizzleDb } from "../../db/client";
import { runMigrations } from "../../db/migrate";
import { env } from "../../lib/env";

declare module "fastify" {
  interface FastifyInstance {
    db: DrizzleDb;
  }
}

export default fp(
  (fastify: FastifyInstance) => {
    const db = createDb(env().DATABASE_URL);
    runMigrations(db);

    fastify.decorate("db", db);

    fastify.addHook("onClose", () => {
      db.$client.close();
    });
  },
  { name: "@chat/db" }
);
