import { describe, expect, it } from "vitest";
import {
  hashRefreshToken,
  mintRefreshToken,
  REFRESH_TOKEN_TTL_SECONDS,
} from "./refresh-token";

describe("refresh-token", () => {
  it("mints a UUIDv7 jti, raw token, and SHA-256 hash", () => {
    const { jti, token, tokenHash, expiresAt } = mintRefreshToken();
    expect(jti).toMatch(/^[0-9a-f-]{36}$/);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token.length).toBeGreaterThan(50);
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(expiresAt).toBeGreaterThan(Date.now());
  });

  it("hashRefreshToken is deterministic", () => {
    const a = hashRefreshToken("foo");
    const b = hashRefreshToken("foo");
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("different inputs produce different hashes", () => {
    const a = hashRefreshToken("foo");
    const b = hashRefreshToken("bar");
    expect(a).not.toBe(b);
  });

  it("TTL is 7 days in seconds", () => {
    expect(REFRESH_TOKEN_TTL_SECONDS).toBe(7 * 24 * 60 * 60);
  });

  it("each mint produces a unique jti and token", () => {
    const a = mintRefreshToken();
    const b = mintRefreshToken();
    expect(a.jti).not.toBe(b.jti);
    expect(a.token).not.toBe(b.token);
    expect(a.tokenHash).not.toBe(b.tokenHash);
  });
});
