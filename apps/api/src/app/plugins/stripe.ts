import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import Stripe from "stripe";
import { env } from "../../lib/env";

declare module "fastify" {
  interface FastifyInstance {
    /**
     * Stripe client. `null` when STRIPE_SECRET_KEY is unset (e.g. local dev
     * without Stripe configured) — payment routes guard on this so the rest
     * of the app keeps working.
     */
    stripe: Stripe | null;
  }
}

/**
 * Wires the Stripe SDK and the webhook raw-body parser.
 *
 * The raw-body parser is **scoped to /api/stripe-webhook only** — a global
 * raw parser would break every other JSON route. Stripe's signature
 * verification requires the exact bytes the server received, not the
 * re-serialized JSON; pre-decoding the body and feeding it to
 * `constructEvent` results in `Invalid signature` errors in production
 * even for correctly-signed events.
 */
export default fp(
  (fastify: FastifyInstance) => {
    const secret = env().STRIPE_SECRET_KEY;
    fastify.decorate(
      "stripe",
      secret
        ? new Stripe(secret, {
            // Pin the API version so a Stripe-side default bump can't change
            // event shapes under us. Update intentionally.
            apiVersion: "2026-04-22.dahlia",
            typescript: true,
          })
        : null
    );

    if (!secret) {
      fastify.log.warn(
        "STRIPE_SECRET_KEY not set — payment routes will return 503"
      );
    }

    // Raw body for Stripe webhook signature verification. Scoped via
    // request URL so JSON parsing stays intact everywhere else.
    fastify.addContentTypeParser(
      "application/json",
      { parseAs: "buffer" },
      (req, body, done) => {
        if (req.url === "/api/stripe-webhook") {
          // Hand the raw Buffer through; the webhook route reads it from
          // `request.body` after this parser runs.
          done(null, body);
          return;
        }
        // Everything else gets the standard JSON treatment.
        try {
          const parsed = JSON.parse((body as Buffer).toString("utf8"));
          done(null, parsed);
        } catch (err) {
          done(err as Error, undefined);
        }
      }
    );
  },
  { name: "@chat/stripe" }
);
