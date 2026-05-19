import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import {
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";

/**
 * Registers the fastify-type-provider-zod compilers so routes can declare:
 *   fastify.withTypeProvider<ZodTypeProvider>().post(path, { schema: { body, response } }, handler)
 * and Fastify validates + types both sides.
 */
export default fp(
  (fastify: FastifyInstance) => {
    fastify.setValidatorCompiler(validatorCompiler);
    fastify.setSerializerCompiler(serializerCompiler);
  },
  { name: "@chat/zod" }
);
