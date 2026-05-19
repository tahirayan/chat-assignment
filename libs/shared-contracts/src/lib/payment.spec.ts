import { describe, expect, it } from "vitest";
import { createPaymentIntentInput } from "./payment";

describe("createPaymentIntentInput", () => {
  it("accepts the pro_monthly product", () => {
    const result = createPaymentIntentInput.safeParse({
      product: "pro_monthly",
    });
    expect(result.success).toBe(true);
  });

  it("rejects unknown products (only pro_monthly today)", () => {
    const result = createPaymentIntentInput.safeParse({
      product: "pro_yearly",
    });
    expect(result.success).toBe(false);
  });
});
