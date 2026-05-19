import { describe, expect, it } from "vitest";
import { loginInput, registerInput } from "./auth";

describe("loginInput", () => {
  it("accepts a well-formed login", () => {
    const result = loginInput.safeParse({
      email: "a@b.co",
      password: "longenough",
    });
    expect(result.success).toBe(true);
  });

  it("lowercases and trims the email", () => {
    const result = loginInput.parse({
      email: "  Alice@Example.COM  ",
      password: "longenough",
    });
    expect(result.email).toBe("alice@example.com");
  });

  it("rejects a password shorter than 8 characters", () => {
    const result = loginInput.safeParse({
      email: "a@b.co",
      password: "short",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a password longer than 128 characters", () => {
    const result = loginInput.safeParse({
      email: "a@b.co",
      password: "x".repeat(129),
    });
    expect(result.success).toBe(false);
  });

  it("rejects a malformed email", () => {
    const result = loginInput.safeParse({
      email: "not-an-email",
      password: "longenough",
    });
    expect(result.success).toBe(false);
  });
});

describe("registerInput", () => {
  it("requires displayName in addition to login fields", () => {
    const result = registerInput.safeParse({
      email: "a@b.co",
      password: "longenough",
      displayName: "Alice",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a displayName shorter than 2 characters", () => {
    const result = registerInput.safeParse({
      email: "a@b.co",
      password: "longenough",
      displayName: "A",
    });
    expect(result.success).toBe(false);
  });

  it("trims displayName", () => {
    const result = registerInput.parse({
      email: "a@b.co",
      password: "longenough",
      displayName: "  Alice  ",
    });
    expect(result.displayName).toBe("Alice");
  });
});
