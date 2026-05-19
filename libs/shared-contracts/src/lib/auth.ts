import { z } from "zod";

export const loginInput = z.object({
  // Normalize whitespace + case BEFORE validating as email, so casual input
  // like "  Alice@Example.COM  " round-trips to "alice@example.com".
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(8).max(128),
});
export type LoginInput = z.infer<typeof loginInput>;

export const registerInput = loginInput.extend({
  displayName: z.string().min(2).max(50).trim(),
});
export type RegisterInput = z.infer<typeof registerInput>;
