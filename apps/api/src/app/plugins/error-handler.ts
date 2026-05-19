import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { hasZodFastifySchemaValidationErrors } from "fastify-type-provider-zod";
import { AppError, errors } from "../../lib/errors";

interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    details: unknown;
  };
}

function envelope(
  code: string,
  message: string,
  details: unknown = null
): ErrorEnvelope {
  return { error: { code, message, details } };
}

export default fp(
  (fastify: FastifyInstance) => {
    fastify.setErrorHandler((error, request, reply) => {
      // 1. AppError — explicit domain error.
      if (error instanceof AppError) {
        reply
          .code(error.statusCode)
          .send(envelope(error.code, error.message, error.details));
        return;
      }

      // 2. Zod validation failure on a route schema.
      if (hasZodFastifySchemaValidationErrors(error)) {
        const details =
          process.env.NODE_ENV === "production" ? null : error.validation;
        reply
          .code(400)
          .send(
            envelope("VALIDATION_ERROR", "Invalid request payload", details)
          );
        return;
      }

      // 3. Generic Fastify validation (non-Zod schemas).
      if (error.validation) {
        const details =
          process.env.NODE_ENV === "production" ? null : error.validation;
        reply
          .code(400)
          .send(
            envelope("VALIDATION_ERROR", "Invalid request payload", details)
          );
        return;
      }

      // 4. Fastify's own HTTP errors (e.g. fastify-sensible's httpErrors).
      const statusCode = error.statusCode ?? 500;
      if (statusCode >= 400 && statusCode < 500) {
        reply.code(statusCode).send(envelope("BAD_REQUEST", error.message));
        return;
      }

      // 5. Server error — log full stack, return generic envelope.
      request.log.error({ err: error }, "unhandled error");
      const fallback = errors.internal();
      reply
        .code(fallback.statusCode)
        .send(envelope(fallback.code, fallback.message));
    });
  },
  { name: "@chat/error-handler" }
);
