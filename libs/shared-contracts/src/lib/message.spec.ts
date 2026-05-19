import { describe, expect, it } from "vitest";
import { messageHistoryQuery, sendMessageInput } from "./message";

describe("sendMessageInput", () => {
  it("accepts a valid message", () => {
    const result = sendMessageInput.safeParse({
      recipientId: "00000000-0000-0000-0000-000000000000",
      body: "hello",
      clientId: "c1",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty body", () => {
    const result = sendMessageInput.safeParse({
      recipientId: "00000000-0000-0000-0000-000000000000",
      body: "",
      clientId: "c1",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a body over 2000 chars", () => {
    const result = sendMessageInput.safeParse({
      recipientId: "00000000-0000-0000-0000-000000000000",
      body: "x".repeat(2001),
      clientId: "c1",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a non-UUID recipientId", () => {
    const result = sendMessageInput.safeParse({
      recipientId: "not-a-uuid",
      body: "hi",
      clientId: "c1",
    });
    expect(result.success).toBe(false);
  });

  it("trims body whitespace", () => {
    const result = sendMessageInput.parse({
      recipientId: "00000000-0000-0000-0000-000000000000",
      body: "  hi  ",
      clientId: "c1",
    });
    expect(result.body).toBe("hi");
  });
});

describe("messageHistoryQuery", () => {
  it("applies default limit of 50", () => {
    const result = messageHistoryQuery.parse({});
    expect(result.limit).toBe(50);
  });

  it("coerces string limit to number", () => {
    const result = messageHistoryQuery.parse({ limit: "10" });
    expect(result.limit).toBe(10);
  });

  it("rejects limit > 100", () => {
    const result = messageHistoryQuery.safeParse({ limit: 101 });
    expect(result.success).toBe(false);
  });
});
