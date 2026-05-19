import type { PushPayload } from "@chat/shared-types";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { pushSubscriptions } from "../db/schema";

/**
 * Fan out a Web Push notification to every saved subscription of
 * `recipientId`. Failures with statusCode 404 or 410 mean the
 * subscription is dead; we drop those rows so we don't keep retrying.
 *
 * Dedup with the in-tab `Notification` API is the **service worker's**
 * job, not ours: a user can be online on a laptop browser while their
 * Android PWA is closed — we want the Android push to fire either way.
 * The SW's `push` handler calls `clients.matchAll()` and skips showing
 * the OS notification when a client window of this origin is alive.
 *
 * Fire-and-forget by design: the caller (messages.ts socket handler)
 * doesn't await this. Failures are logged but never bubble up to a
 * failed message:send response.
 */
export async function fanOutPush(
  fastify: FastifyInstance,
  recipientId: string,
  payload: PushPayload
): Promise<void> {
  const pusher = fastify.webPush;
  if (!pusher) {
    return; // VAPID not configured — silently skip
  }

  const rows = await fastify.db.query.pushSubscriptions.findMany({
    where: eq(pushSubscriptions.userId, recipientId),
  });
  if (rows.length === 0) {
    return;
  }

  const serialized = JSON.stringify(payload);
  const deadEndpoints: string[] = [];

  await Promise.all(
    rows.map(async (row) => {
      const result = await pusher.send(
        {
          endpoint: row.endpoint,
          keys: { p256dh: row.p256dh, auth: row.auth },
        },
        serialized
      );
      if (!result.ok) {
        if (result.gone) {
          deadEndpoints.push(row.endpoint);
        } else {
          fastify.log.warn(
            {
              recipientId,
              statusCode: result.statusCode,
              message: result.message,
            },
            "web-push send failed"
          );
        }
      }
    })
  );

  if (deadEndpoints.length > 0) {
    await Promise.all(
      deadEndpoints.map((endpoint) =>
        fastify.db
          .delete(pushSubscriptions)
          .where(eq(pushSubscriptions.endpoint, endpoint))
      )
    );
    fastify.log.info(
      { recipientId, droppedCount: deadEndpoints.length },
      "web-push: dropped stale subscriptions"
    );
  }
}
