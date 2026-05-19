import type { UpdateProfileInput } from "@chat/shared-contracts";
import type { PublicUser, User } from "@chat/shared-types";
import { eq, ne } from "drizzle-orm";
import type { DrizzleDb } from "../db/client";
import { users } from "../db/schema";
import { errors } from "../lib/errors";
import { presence } from "./presence";

function toPublicUser(
  row: typeof users.$inferSelect,
  isOnline: boolean
): PublicUser {
  return {
    id: row.id,
    displayName: row.displayName,
    bio: row.bio,
    avatarUrl: row.avatarUrl,
    locale: row.locale as PublicUser["locale"],
    isPro: row.isPro,
    lastSeenAt: row.lastSeenAt ? row.lastSeenAt.getTime() : null,
    createdAt: row.createdAt.getTime(),
    isOnline,
  };
}

function toApiUser(row: typeof users.$inferSelect): User {
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    bio: row.bio,
    avatarUrl: row.avatarUrl,
    locale: row.locale as User["locale"],
    isPro: row.isPro,
    lastSeenAt: row.lastSeenAt ? row.lastSeenAt.getTime() : null,
    createdAt: row.createdAt.getTime(),
  };
}

export async function listOtherUsers(
  db: DrizzleDb,
  currentUserId: string
): Promise<PublicUser[]> {
  const rows = await db.query.users.findMany({
    where: ne(users.id, currentUserId),
    orderBy: (u, { asc }) => [asc(u.displayName)],
  });
  return rows.map((row) => toPublicUser(row, presence.isOnline(row.id)));
}

/**
 * Fetch a PublicUser by id. Used by the call signaling handler so the
 * callee's `call:incoming` payload carries the caller's display profile
 * (name + avatar) without a second client round-trip.
 */
export async function findPublicUser(
  db: DrizzleDb,
  userId: string
): Promise<PublicUser | null> {
  const row = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!row) {
    return null;
  }
  return toPublicUser(row, presence.isOnline(row.id));
}

/**
 * Apply an UpdateProfileInput patch to a user's row and return the full
 * canonical User. The Zod schema on the route already guarantees:
 *   - displayName 2-50 chars (trimmed)
 *   - bio ≤ 280 chars
 *   - avatarUrl is https URL | JPEG data URL ≤ 150,000 chars | null
 *   - locale is one of "en" | "tr" | "et"
 * Server-side avatar handling is intentionally minimal: no decode, no
 * resize. The client is the source of truth for the canvas pipeline.
 */
export async function updateProfile(
  db: DrizzleDb,
  currentUserId: string,
  patch: UpdateProfileInput
): Promise<User> {
  // Drizzle would happily run an UPDATE with no SET fields and silently
  // do nothing. Skip the call when the patch is empty.
  const hasAny =
    patch.displayName !== undefined ||
    patch.bio !== undefined ||
    patch.avatarUrl !== undefined ||
    patch.locale !== undefined;

  if (hasAny) {
    const updateData: Partial<typeof users.$inferInsert> = {};
    if (patch.displayName !== undefined) {
      updateData.displayName = patch.displayName;
    }
    if (patch.bio !== undefined) {
      updateData.bio = patch.bio;
    }
    if (patch.avatarUrl !== undefined) {
      updateData.avatarUrl = patch.avatarUrl;
    }
    if (patch.locale !== undefined) {
      updateData.locale = patch.locale;
    }
    db.update(users).set(updateData).where(eq(users.id, currentUserId)).run();
  }

  const row = await db.query.users.findFirst({
    where: eq(users.id, currentUserId),
  });
  if (!row) {
    throw errors.unauthorized("User no longer exists");
  }
  return toApiUser(row);
}
