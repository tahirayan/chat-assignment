import type { RegisterInput } from "@chat/shared-contracts";
import type { User } from "@chat/shared-types";
import { and, eq, gt, isNull } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import type { DrizzleDb } from "../db/client";
import { refreshTokens, users } from "../db/schema";
import { env } from "../lib/env";
import { errors } from "../lib/errors";
import { signAccessToken } from "../lib/jwt";
import {
  hashPassword,
  LOGIN_FLOOR_MS,
  verifyPassword,
  withMinResponseTime,
} from "../lib/password";
import {
  hashRefreshToken,
  type MintedRefreshToken,
  mintRefreshToken,
} from "../lib/refresh-token";

export interface AuthResult {
  accessToken: string;
  refresh: MintedRefreshToken;
  user: User;
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

async function issueTokensFor(
  db: DrizzleDb,
  row: typeof users.$inferSelect
): Promise<AuthResult> {
  const refresh = mintRefreshToken();
  await db.insert(refreshTokens).values({
    id: refresh.jti,
    userId: row.id,
    tokenHash: refresh.tokenHash,
    expiresAt: new Date(refresh.expiresAt),
  });
  const accessToken = await signAccessToken(
    { sub: row.id, email: row.email },
    env().JWT_SECRET
  );
  return { user: toApiUser(row), accessToken, refresh };
}

export async function register(
  db: DrizzleDb,
  input: RegisterInput
): Promise<AuthResult> {
  const existing = await db.query.users.findFirst({
    where: eq(users.email, input.email),
  });
  if (existing) {
    throw errors.emailTaken();
  }
  const passwordHash = await hashPassword(input.password);
  const id = uuidv7();
  const inserted = await db
    .insert(users)
    .values({
      id,
      email: input.email,
      passwordHash,
      displayName: input.displayName,
    })
    .returning();
  const row = inserted[0];
  if (!row) {
    throw errors.internal("Failed to create user");
  }
  return issueTokensFor(db, row);
}

export function login(
  db: DrizzleDb,
  email: string,
  password: string
): Promise<AuthResult> {
  return withMinResponseTime(LOGIN_FLOOR_MS, async () => {
    const row = await db.query.users.findFirst({
      where: eq(users.email, email),
    });
    // Always run bcrypt — even on a missing user — so the response time
    // doesn't reveal whether the email exists (user enumeration defense).
    const dummyHash =
      "$2b$12$abcdefghijklmnopqrstuuVwxYzABCDEFGHIJKLMNOPQRSTUVWXYZabcde";
    const ok = await verifyPassword(password, row?.passwordHash ?? dummyHash);
    if (!(ok && row)) {
      throw errors.invalidCredentials();
    }
    return issueTokensFor(db, row);
  });
}

export async function refresh(
  db: DrizzleDb,
  rawToken: string
): Promise<AuthResult> {
  const tokenHash = hashRefreshToken(rawToken);
  const now = new Date();
  const row = await db.query.refreshTokens.findFirst({
    where: and(
      eq(refreshTokens.tokenHash, tokenHash),
      isNull(refreshTokens.revokedAt),
      gt(refreshTokens.expiresAt, now)
    ),
  });
  if (!row) {
    throw errors.unauthorized("Refresh token invalid or expired");
  }
  const user = await db.query.users.findFirst({
    where: eq(users.id, row.userId),
  });
  if (!user) {
    throw errors.unauthorized("User no longer exists");
  }

  // Rotate atomically: revoke old jti + insert new in one sync transaction.
  // (better-sqlite3 transactions must be sync — no async callbacks.)
  const newRefresh = mintRefreshToken();
  db.transaction((tx) => {
    tx.update(refreshTokens)
      .set({ revokedAt: now })
      .where(eq(refreshTokens.id, row.id))
      .run();
    tx.insert(refreshTokens)
      .values({
        id: newRefresh.jti,
        userId: user.id,
        tokenHash: newRefresh.tokenHash,
        expiresAt: new Date(newRefresh.expiresAt),
      })
      .run();
  });

  const accessToken = await signAccessToken(
    { sub: user.id, email: user.email },
    env().JWT_SECRET
  );
  return { user: toApiUser(user), accessToken, refresh: newRefresh };
}

/**
 * Revokes the refresh token and returns the affected userId so the caller
 * can kick any live sockets the user has open. Returns null if no matching
 * (un-revoked) refresh token was found — caller still proceeds, but there
 * are no sockets to drop.
 */
export async function logout(
  db: DrizzleDb,
  rawToken: string
): Promise<string | null> {
  const tokenHash = hashRefreshToken(rawToken);
  const row = await db.query.refreshTokens.findFirst({
    where: and(
      eq(refreshTokens.tokenHash, tokenHash),
      isNull(refreshTokens.revokedAt)
    ),
  });
  if (!row) {
    return null;
  }
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(eq(refreshTokens.id, row.id));
  return row.userId;
}

export async function me(db: DrizzleDb, userId: string): Promise<User> {
  const row = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!row) {
    throw errors.unauthorized("User no longer exists");
  }
  return toApiUser(row);
}
