import { z } from "zod";

export const createPaymentIntentInput = z.object({
  product: z.enum(["pro_monthly"]),
});
export type CreatePaymentIntentInput = z.infer<typeof createPaymentIntentInput>;
