import { SERVER_EVENTS } from "@chat/shared-types";
import { eq } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type Stripe from "stripe";
import { uuidv7 } from "uuidv7";
import { payments, users } from "../../db/schema";
import { env } from "../../lib/env";
import { errors } from "../../lib/errors";
import { findPublicUser } from "../../services/users";

/**
 * POST /api/stripe-webhook
 *
 * MUST receive the raw request body — Stripe's signature is computed over
 * the exact bytes the API received, so re-parsing JSON and re-serializing
 * would invalidate it. The plugin in `plugins/stripe.ts` installs a
 * content-type parser scoped to this URL that yields a Buffer.
 *
 * Idempotency (PRD §15.6): Stripe is permitted to deliver the same event
 * more than once. `payments.stripePaymentIntent` is UNIQUE — we INSERT
 * with `ON CONFLICT DO NOTHING` so duplicate deliveries silently no-op
 * instead of either erroring out or double-flipping the user to Pro.
 */
export default function stripeWebhookRoute(fastify: FastifyInstance) {
  fastify.post("/api/stripe-webhook", async (request, reply) => {
    const stripe = fastify.stripe;
    if (!stripe) {
      throw errors.serviceUnavailable("Stripe is not configured");
    }
    const secret = env().STRIPE_WEBHOOK_SECRET;
    if (!secret) {
      throw errors.serviceUnavailable("Webhook secret not configured");
    }

    const sig = request.headers["stripe-signature"];
    if (typeof sig !== "string") {
      throw errors.invalidSignature("Missing Stripe-Signature header");
    }
    const raw = request.body as Buffer | undefined;
    if (!Buffer.isBuffer(raw)) {
      // If this fires the content-type parser is mis-wired — the raw
      // bytes never reached us, meaning every prior signature check
      // would also have failed. Log loudly.
      fastify.log.error("stripe-webhook: body is not a Buffer");
      throw errors.invalidSignature("Body was not raw");
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(raw, sig, secret);
    } catch (err) {
      // Don't leak the SDK's error message — Stripe's signature errors
      // are useful diagnostics but the response should stay generic.
      fastify.log.warn({ err }, "stripe-webhook signature verify failed");
      throw errors.invalidSignature("Signature verification failed");
    }

    if (event.type === "payment_intent.succeeded") {
      await handlePaymentIntentSucceeded(request, event.data.object);
    } else {
      fastify.log.info(
        { eventType: event.type, eventId: event.id },
        "stripe-webhook: event ignored"
      );
    }

    reply.code(200);
    return { received: true };
  });
}

async function handlePaymentIntentSucceeded(
  request: FastifyRequest,
  intent: Stripe.PaymentIntent
): Promise<void> {
  const fastify = request.server;
  const userId = intent.metadata?.userId;
  if (!userId) {
    fastify.log.warn(
      { intentId: intent.id },
      "stripe-webhook: payment_intent.succeeded missing userId metadata"
    );
    return;
  }

  // Idempotent insert keyed on stripe_payment_intent (UNIQUE). Drizzle's
  // onConflictDoNothing maps to SQLite's INSERT ... ON CONFLICT DO NOTHING.
  const inserted = await fastify.db
    .insert(payments)
    .values({
      id: uuidv7(),
      userId,
      stripePaymentIntent: intent.id,
      amount: intent.amount,
      currency: intent.currency,
      status: "succeeded",
    })
    .onConflictDoNothing({ target: payments.stripePaymentIntent })
    .returning();

  if (inserted.length === 0) {
    // Duplicate delivery — already processed.
    fastify.log.info(
      { intentId: intent.id, userId },
      "stripe-webhook: duplicate event, no-op"
    );
    return;
  }

  // Flip isPro. Idempotent against re-runs (UPDATE … SET is_pro = true is
  // safe to repeat even when the insert above already ran once).
  await fastify.db
    .update(users)
    .set({ isPro: true })
    .where(eq(users.id, userId));

  // Push the Pro badge to every connected client — the user themselves
  // already polled /payments/status on their redirect, but everyone ELSE
  // (their conversation partners, community list viewers) needs to know
  // without waiting for a refresh.
  const publicUser = await findPublicUser(fastify.db, userId);
  if (publicUser) {
    fastify.io.emit(SERVER_EVENTS.USER_UPDATED, publicUser);
  }

  fastify.log.info(
    { intentId: intent.id, userId },
    "stripe-webhook: payment recorded, user flipped to Pro"
  );
}
