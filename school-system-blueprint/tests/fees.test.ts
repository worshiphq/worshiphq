import { describe, expect, it } from "vitest";
import { allocatePayment, discountAmount, invoiceStatus } from "../src/lib/fees";

const d = (s: string) => new Date(s);

describe("allocatePayment", () => {
  it("pays oldest term first and returns credit", () => {
    const r = allocatePayment(700, [
      { id: "t2", termStart: d("2026-01-10"), balance: 500 },
      { id: "t1", termStart: d("2025-09-08"), balance: 300 },
    ]);
    expect(r.allocations).toEqual([{ invoiceId: "t1", amount: 300 }, { invoiceId: "t2", amount: 400 }]);
    expect(r.credit).toBe(0);
    expect(allocatePayment(1000, [{ id: "a", termStart: d("2026-01-01"), balance: 250.5 }]).credit).toBe(749.5);
  });
  it("avoids float drift", () =>
    expect(allocatePayment(0.3, [{ id: "a", termStart: d("2026-01-01"), balance: 0.1 }, { id: "b", termStart: d("2026-02-01"), balance: 0.2 }]).credit).toBe(0));
});

describe("discounts & status", () => {
  it("caps at subtotal", () => expect(discountAmount(1000, [{ type: "PERCENT", value: 10 }, { type: "FIXED", value: 950 }])).toBe(1000));
  it("percent", () => expect(discountAmount(1200, [{ type: "PERCENT", value: 10 }])).toBe(120));
  it("status", () => {
    expect(invoiceStatus(500, 0)).toBe("ISSUED");
    expect(invoiceStatus(500, 200)).toBe("PARTIAL");
    expect(invoiceStatus(500, 500)).toBe("PAID");
    expect(invoiceStatus(500, 0, true)).toBe("CANCELLED");
  });
});
