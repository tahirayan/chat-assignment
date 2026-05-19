import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import Fastify from "fastify";
import { app } from "./app/app";
import { env } from "./lib/env";

// Load apps/api/.env regardless of which dir we're invoked from.
// (Resolved relative to this source file so dev + prod runs both find it.)
dotenv.config({
  path: fileURLToPath(new URL("../.env", import.meta.url)),
});

const config = env();

const server = Fastify({
  logger: {
    level: config.NODE_ENV === "production" ? "info" : "debug",
  },
});

server.register(app);

server.listen({ host: "0.0.0.0", port: config.PORT }, (err, address) => {
  if (err) {
    server.log.error(err);
    process.exit(1);
  }
  server.log.info(`api ready at ${address}`);
});
