import { createHash, randomBytes } from "node:crypto";
import { uuidv7 } from "uuidv7";

const REFRESH_BYTES = 48; // 48 bytes → 64 chars base64url
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface MintedRefreshToken {
  expiresAt: number; // epoch ms
  jti: string;
  token: string; // raw value sent to the client
  tokenHash: string; // SHA-256 hex, stored in DB
}

export function mintRefreshToken(): MintedRefreshToken {
  const jti = uuidv7();
  const token = randomBytes(REFRESH_BYTES).toString("base64url");
  const tokenHash = hashRefreshToken(token);
  const expiresAt = Date.now() + REFRESH_TTL_MS;
  return { jti, token, tokenHash, expiresAt };
}

export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export const REFRESH_TOKEN_TTL_SECONDS = REFRESH_TTL_MS / 1000;
