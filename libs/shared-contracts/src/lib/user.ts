import { z } from "zod";

export const updateProfileInput = z.object({
  displayName: z.string().min(2).max(50).trim().optional(),
  bio: z.string().max(280).optional(),
  avatarUrl: z
    .union([
      // https only — `z.url()` alone would also accept `data:` URLs.
      z.url({ protocol: /^https$/ }),
      // ~75 KB binary + headroom; client enforces tighter 100,000-char limit.
      z.string().startsWith("data:image/jpeg;base64,").max(150_000),
      z.null(),
    ])
    .optional(),
  locale: z.enum(["en", "tr", "et"]).optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileInput>;
