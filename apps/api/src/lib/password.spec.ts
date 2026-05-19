import { describe, expect, it } from "vitest";
import {
  hashPassword,
  LOGIN_FLOOR_MS,
  verifyPassword,
  withMinResponseTime,
} from "./password";

describe("password", () => {
  it("hashes a plaintext password (bcrypt cost 12 → starts with $2b$12$)", async () => {
    const hash = await hashPassword("longenough");
    expect(hash).toMatch(/^\$2b\$12\$/);
  });

  it("round-trips: verify accepts the correct password", async () => {
    const hash = await hashPassword("longenough");
    const ok = await verifyPassword("longenough", hash);
    expect(ok).toBe(true);
  });

  it("verify rejects the wrong password", async () => {
    const hash = await hashPassword("longenough");
    const ok = await verifyPassword("nope", hash);
    expect(ok).toBe(false);
  });

  it("produces different hashes for the same password (random salt)", async () => {
    const h1 = await hashPassword("longenough");
    const h2 = await hashPassword("longenough");
    expect(h1).not.toBe(h2);
  });
});

describe("withMinResponseTime", () => {
  it("respects the floor when op completes quickly", async () => {
    const start = Date.now();
    await withMinResponseTime(120, () => Promise.resolve("done"));
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(110);
  });

  it("returns immediately when op already exceeds the floor", async () => {
    const start = Date.now();
    await withMinResponseTime(20, async () => {
      await new Promise((r) => setTimeout(r, 100));
      return "done";
    });
    const elapsed = Date.now() - start;
    // Just confirm it didn't add extra delay beyond the actual op
    expect(elapsed).toBeLessThan(200);
  });

  it("LOGIN_FLOOR_MS is the documented 250ms", () => {
    expect(LOGIN_FLOOR_MS).toBe(250);
  });
});
