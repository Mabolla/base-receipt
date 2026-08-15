import { describe, expect, it } from "vitest";
import { claimPayment, type StoredReceipt } from "./receipt-store";

function receipt(paymentId: string, orderId: string): StoredReceipt {
  return {
    paymentId,
    orderId,
    sender: "0x2222222222222222222222222222222222222222",
    amount: "0.01",
    recipient: "0x1111111111111111111111111111111111111111",
    status: "completed",
  };
}

describe("receipt claims", () => {
  it("creates the first claim for a payment", async () => {
    const result = await claimPayment(receipt("0x" + "a".repeat(64), "order-a"));
    expect(result.created).toBe(true);
    expect(result.receipt.orderId).toBe("order-a");
  });

  it("returns the existing claim when a payment is reused", async () => {
    const paymentId = "0x" + "b".repeat(64);
    await claimPayment(receipt(paymentId, "order-original"));
    const result = await claimPayment(receipt(paymentId, "order-other"));

    expect(result.created).toBe(false);
    expect(result.receipt.orderId).toBe("order-original");
  });
});
