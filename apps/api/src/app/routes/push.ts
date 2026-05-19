import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { uuidv7 } from "uuidv7";
import { z } from "zod";
import { pushSubscriptions } from "../../db/schema";
import { errors } from "../../lib/errors";

/**
 * Phase 20 Web Push subscription management.
 *
 *  POST   /api/push/subscribe — upsert by endpoint
 *  DELETE /api/push/subscribe?endpoint=... — drop one
 *
 * Both endpoints are authed. Subscriptions are keyed by their `endpoint`
 * URL (unique across the push service), so re-subscribing from the same
 * browser overwrites cleanly without leaving stale rows.
 */

const subscribeBody = z.object({
  endpoint: z.string().url().max(2048),
  keys: z.object({
    p256dh: z.string().min(1).max(256),
    auth: z.string().min(1).max(256),
  }),
});

const unsubscribeQuery = z.object({
  endpoint: z.string().url().max(2048),
});

export default function pushRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.post(
    "/subscribe",
    {
      preHandler: fastify.requireAuth,
      schema: { body: subscribeBody },
    },
    async (request, reply) => {
      if (!request.userId) {
        throw errors.unauthorized();
      }
      if (!fastify.webPush) {
        // Server has no VAPID config — the client can subscribe anyway
        // (the browser doesn't need our server's keys to subscribe),
        // but sending will fail. Return 503 so the client knows.
        throw errors.serviceUnavailable("Web Push not configured");
      }

      const { endpoint, keys } = request.body;
      // Upsert by endpoint (UNIQUE). Different user on the same browser
      // (subscription gets re-issued) lands here too — re-bind to the
      // new owner.
      await fastify.db
        .insert(pushSubscriptions)
        .values({
          id: uuidv7(),
          userId: request.userId,
          endpoint,
          p256dh: keys.p256dh,
          auth: keys.auth,
        })
        .onConflictDoUpdate({
          target: pushSubscriptions.endpoint,
          set: {
            userId: request.userId,
            p256dh: keys.p256dh,
            auth: keys.auth,
          },
        });

      reply.code(204);
      return null;
    }
  );

  app.delete(
    "/subscribe",
    {
      preHandler: fastify.requireAuth,
      schema: { querystring: unsubscribeQuery },
    },
    async (request, reply) => {
      if (!request.userId) {
        throw errors.unauthorized();
      }
      // Scope to (endpoint, userId) so a misbehaving client can't drop
      // someone else's subscription by guessing a known endpoint URL.
      await fastify.db
        .delete(pushSubscriptions)
        .where(
          and(
            eq(pushSubscriptions.endpoint, request.query.endpoint),
            eq(pushSubscriptions.userId, request.userId)
          )
        );
      reply.code(204);
      return null;
    }
  );
}
