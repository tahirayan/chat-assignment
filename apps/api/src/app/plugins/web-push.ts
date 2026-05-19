import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import webPush, { type PushSubscription, type SendResult } from "web-push";
import { env } from "../../lib/env";

declare module "fastify" {
  interface FastifyInstance {
    /**
     * Send a notification to a saved PushSubscription. Returns
     *   { ok: true,           statusCode }  on success
     *   { ok: false, gone: true, statusCode } when the subscription is
     *     dead (410 Gone or 404) and the caller should drop the row
     *   { ok: false, gone: false, statusCode, err } for transient errors
     *
     * Returns null (the whole helper) when VAPID env isn't configured —
     * gives callers a single feature-detect call site.
     */
    webPush: {
      send: (
        subscription: PushSubscription,
        payload: string
      ) => Promise<WebPushSendResult>;
    } | null;
  }
}

export type WebPushSendResult =
  | { ok: true; statusCode: number }
  | { ok: false; gone: true; statusCode: number }
  | { ok: false; gone: false; statusCode: number; message: string };

/**
 * Initialises the `web-push` library with VAPID credentials and decorates
 * `fastify.webPush.send`. Without all three VAPID env vars the plugin
 * decorates `null` and the routes return 503 — matches the Stripe
 * plugin's pattern so a half-configured deploy still boots.
 */
export default fp(
  (fastify: FastifyInstance) => {
    const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = env();

    if (!(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY && VAPID_SUBJECT)) {
      fastify.log.warn(
        "VAPID keys not fully configured — Web Push disabled (set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT)"
      );
      fastify.decorate("webPush", null);
      return;
    }

    webPush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

    fastify.decorate("webPush", {
      async send(
        subscription: PushSubscription,
        payload: string
      ): Promise<WebPushSendResult> {
        try {
          const res: SendResult = await webPush.sendNotification(
            subscription,
            payload,
            // TTL: how long the push service holds the message if the
            // device is offline. 24h matches what most chat apps use —
            // beyond that the message is stale enough that re-opening
            // the app and seeing the unread state is the right UX.
            { TTL: 24 * 60 * 60 }
          );
          return { ok: true, statusCode: res.statusCode };
        } catch (err: unknown) {
          // web-push throws WebPushError which carries `statusCode`. Any
          // 4xx is permanent (subscription dead, bad encoding, etc.).
          // 410 Gone + 404 mean we should drop the row.
          const e = err as {
            statusCode?: number;
            body?: string;
            message?: string;
          };
          const statusCode = e.statusCode ?? 0;
          const gone = statusCode === 404 || statusCode === 410;
          return {
            ok: false,
            gone,
            statusCode,
            message: e.message ?? "unknown push error",
          };
        }
      },
    });
  },
  { name: "@chat/web-push" }
);
