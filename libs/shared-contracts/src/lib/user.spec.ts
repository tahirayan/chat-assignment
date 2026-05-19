import { describe, expect, it } from "vitest";
import { updateProfileInput } from "./user";

describe("updateProfileInput", () => {
  it("accepts a fully populated update", () => {
    const result = updateProfileInput.safeParse({
      displayName: "Alice",
      bio: "Hi!",
      avatarUrl: null,
      locale: "en",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a partial update (every field optional)", () => {
    const result = updateProfileInput.safeParse({ bio: "Just bio" });
    expect(result.success).toBe(true);
  });

  it("accepts an https avatar URL", () => {
    const result = updateProfileInput.safeParse({
      avatarUrl: "https://cdn.example.com/avatar.jpg",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a small JPEG data URL", () => {
    const result = updateProfileInput.safeParse({
      avatarUrl: `data:image/jpeg;base64,${"A".repeat(1000)}`,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a data URL over the 150,000-char ceiling", () => {
    const result = updateProfileInput.safeParse({
      avatarUrl: `data:image/jpeg;base64,${"A".repeat(150_001)}`,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a PNG data URL (only JPEG accepted)", () => {
    const result = updateProfileInput.safeParse({
      avatarUrl: "data:image/png;base64,AAA",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a bio over 280 characters", () => {
    const result = updateProfileInput.safeParse({ bio: "x".repeat(281) });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid locale", () => {
    const result = updateProfileInput.safeParse({ locale: "fr" });
    expect(result.success).toBe(false);
  });

  it("accepts null avatarUrl (clear photo)", () => {
    const result = updateProfileInput.safeParse({ avatarUrl: null });
    expect(result.success).toBe(true);
  });
});
