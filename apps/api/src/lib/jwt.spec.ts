import { describe, expect, it } from "vitest";
import { signAccessToken, verifyAccessToken } from "./jwt";

const SECRET = "test-secret-must-be-at-least-32-characters-long";

describe("jwt", () => {
  it("round-trips the sub and email claims", async () => {
    const token = await signAccessToken(
      { sub: "user-1", email: "alice@example.com" },
      SECRET
    );
    const payload = await verifyAccessToken(token, SECRET);
    expect(payload.sub).toBe("user-1");
    expect(payload.email).toBe("alice@example.com");
  });

  it("includes iat and exp claims", async () => {
    const token = await signAccessToken(
      { sub: "user-1", email: "alice@example.com" },
      SECRET
    );
    const payload = await verifyAccessToken(token, SECRET);
    expect(payload.iat).toBeGreaterThan(0);
    expect(payload.exp).toBeGreaterThan(payload.iat);
  });

  it("rejects a tampered signature", async () => {
    const token = await signAccessToken(
      { sub: "user-1", email: "alice@example.com" },
      SECRET
    );
    const tampered = `${token.slice(0, -4)}AAAA`;
    await expect(verifyAccessToken(tampered, SECRET)).rejects.toThrow();
  });

  it("rejects verification with the wrong secret", async () => {
    const token = await signAccessToken(
      { sub: "user-1", email: "alice@example.com" },
      SECRET
    );
    const wrong = "wrong-secret-also-must-be-at-least-32-chars-long";
    await expect(verifyAccessToken(token, wrong)).rejects.toThrow();
  });

  it("rejects a malformed token", async () => {
    await expect(verifyAccessToken("not-a-token", SECRET)).rejects.toThrow();
  });
});
