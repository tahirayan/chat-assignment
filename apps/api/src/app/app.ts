import type { FastifyInstance } from "fastify";

// Plugins (order matters — db before anything that uses fastify.db, etc.).
import authPlugin from "./plugins/auth";
import cookiePlugin from "./plugins/cookie";
import corsPlugin from "./plugins/cors";
import dbPlugin from "./plugins/db";
import errorHandlerPlugin from "./plugins/error-handler";
import sensiblePlugin from "./plugins/sensible";
import socketPlugin from "./plugins/socket";
import stripePlugin from "./plugins/stripe";
import webPushPlugin from "./plugins/web-push";
import zodPlugin from "./plugins/zod";

// Routes (registered with their PRD-mandated prefixes — see PRD §6.2).
import authRoutes from "./routes/auth";
import conversationsRoutes from "./routes/conversations";
import messagesRoutes from "./routes/messages";
import paymentsRoutes from "./routes/payments";
import pushRoutes from "./routes/push";
import rootRoutes from "./routes/root";
import stripeWebhookRoute from "./routes/stripe-webhook";
import usersRoutes from "./routes/users";

export type AppOptions = Record<string, unknown>;

/**
 * Composition root. We register plugins and routes explicitly (rather than
 * autoloading directories) so the esbuild bundle produced for Railway has
 * a complete static module graph and a single `main.js` entry — autoload's
 * runtime `fs.readdir` doesn't survive bundling.
 *
 * Order constraints to keep:
 *   1. `sensible` before anything that uses `httpErrors`.
 *   2. `zod` before any route using `withTypeProvider<ZodTypeProvider>()`.
 *   3. `cookie` before routes that read/set cookies (auth/refresh).
 *   4. `db` before any plugin/route that reads `fastify.db`.
 *   5. `stripe` registers the raw-body parser for /api/stripe-webhook and
 *      must run before that route is registered.
 *   6. `error-handler` last among plugins so it sees every AppError.
 *   7. `socket` last among plugins — it attaches to fastify.server which
 *      exists once Fastify itself is initialized.
 */
export function app(fastify: FastifyInstance, _opts: AppOptions): void {
  // ─── Plugins ────────────────────────────────────────────────────────────
  fastify.register(sensiblePlugin);
  fastify.register(zodPlugin);
  fastify.register(cookiePlugin);
  fastify.register(corsPlugin);
  fastify.register(dbPlugin);
  fastify.register(authPlugin);
  fastify.register(stripePlugin);
  fastify.register(webPushPlugin);
  fastify.register(errorHandlerPlugin);
  fastify.register(socketPlugin);

  // ─── Routes ─────────────────────────────────────────────────────────────
  fastify.register(rootRoutes);
  fastify.register(authRoutes, { prefix: "/api/auth" });
  fastify.register(conversationsRoutes, { prefix: "/api/conversations" });
  fastify.register(messagesRoutes, { prefix: "/api/messages" });
  fastify.register(paymentsRoutes, { prefix: "/api/payments" });
  fastify.register(pushRoutes, { prefix: "/api/push" });
  fastify.register(usersRoutes, { prefix: "/api/users" });
  // stripe-webhook owns its full path (/api/stripe-webhook) — no prefix.
  fastify.register(stripeWebhookRoute);
}
