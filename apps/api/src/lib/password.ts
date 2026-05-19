import bcrypt from "bcrypt";

const BCRYPT_COST = 12;

export function hashPassword(plaintext: string): Promise<string> {
  return bcrypt.hash(plaintext, BCRYPT_COST);
}

export function verifyPassword(
  plaintext: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(plaintext, hash);
}

/**
 * Ensures a minimum elapsed time for any login-like operation. Defends against
 * timing-based user-enumeration: failure paths that short-circuit before
 * bcrypt finishes are indistinguishable from success paths.
 *
 * Usage:
 *   const ok = await withMinResponseTime(LOGIN_FLOOR_MS, () => verifyPassword(p, h));
 */
export async function withMinResponseTime<T>(
  floorMs: number,
  op: () => Promise<T>
): Promise<T> {
  const start = Date.now();
  const result = await op();
  const elapsed = Date.now() - start;
  if (elapsed < floorMs) {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, floorMs - elapsed);
    });
  }
  return result;
}

export const LOGIN_FLOOR_MS = 250;
