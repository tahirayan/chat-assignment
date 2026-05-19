import type {
  CreateIntentResponse,
  PaymentStatusResponse,
} from "@chat/shared-types";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { errors } from "../../lib/errors";

const PRO_PRICE_CENTS = 499;
const PRO_CURRENCY = "eur";
const PRO_PRODUCT = "pro_monthly";

const createIntentResponseSchema = z.object({
  clientSecret: z.string(),
  paymentIntentId: z.string(),
}) satisfies z.ZodType<CreateIntentResponse>;

const paymentStatusResponseSchema = z.object({
  status: z.enum(["succeeded", "processing", "requires_action", "failed"]),
}) satisfies z.ZodType<PaymentStatusResponse>;

const paymentStatusQuery = z.object({
  paymentIntentId: z.string().min(1),
});

export default function paymentsRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  // ─── POST /api/payments/create-intent ──────────────────────────────────
  app.post(
    "/create-intent",
    {
      preHandler: fastify.requireAuth,
      schema: { response: { 200: createIntentResponseSchema } },
    },
    async (request) => {
      if (!fastify.stripe) {
        throw errors.serviceUnavailable("Stripe is not configured");
      }
      if (!request.userId) {
        throw errors.unauthorized();
      }

      const intent = await fastify.stripe.paymentIntents.create({
        amount: PRO_PRICE_CENTS,
        currency: PRO_CURRENCY,
        automatic_payment_methods: { enabled: true },
        metadata: { userId: request.userId, product: PRO_PRODUCT },
      });

      if (!intent.client_secret) {
        throw errors.internal("Stripe returned no client_secret");
      }
      return {
        clientSecret: intent.client_secret,
        paymentIntentId: intent.id,
      };
    }
  );

  // ─── GET /api/payments/status ─────────────────────────────────────────
  // Used by the client on its post-redirect landing to translate the Stripe
  // PaymentIntent status into a UI toast without exposing the full intent.
  app.get(
    "/status",
    {
      preHandler: fastify.requireAuth,
      schema: {
        querystring: paymentStatusQuery,
        response: { 200: paymentStatusResponseSchema },
      },
    },
    async (request) => {
      if (!fastify.stripe) {
        throw errors.serviceUnavailable("Stripe is not configured");
      }
      const { paymentIntentId } = request.query;
      const intent =
        await fastify.stripe.paymentIntents.retrieve(paymentIntentId);
      // Map Stripe's wider status set down to the four UI-relevant ones.
      let status: PaymentStatusResponse["status"];
      switch (intent.status) {
        case "succeeded":
          status = "succeeded";
          break;
        case "processing":
          status = "processing";
          break;
        case "requires_action":
        case "requires_confirmation":
        case "requires_payment_method":
          status = "requires_action";
          break;
        default:
          status = "failed";
          break;
      }
      return { status };
    }
  );
}
