import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createOrderToken, readOrderToken, type PaymentOrder } from "./order-token";

const order: PaymentOrder = {
  orderId: "order-123",
  amount: "1.25",
  recipient: "0x1111111111111111111111111111111111111111",
  expiresAt: Date.now() + 60_000,
};

describe("payment request tokens", () => {
  beforeEach(() => {
    process.env.PAYMENT_REQUEST_SECRET = "test-secret-for-base-receipt";
  });

  afterEach(() => {
    delete process.env.PAYMENT_REQUEST_SECRET;
  });

  it("round-trips a signed order", () => {
    const token = createOrderToken(order);
    expect(readOrderToken(token)).toEqual(order);
  });

  it("rejects tampered payloads", () => {
    const token = createOrderToken(order);
    const [payload, signature] = token.split(".");
    const tamperedPayload = `${payload.slice(0, -1)}${payload.endsWith("A") ? "B" : "A"}`;
    expect(() => readOrderToken(`${tamperedPayload}.${signature}`)).toThrow(/signature/i);
  });

  it("rejects expired requests", () => {
    const token = createOrderToken({ ...order, expiresAt: Date.now() - 1 });
    expect(() => readOrderToken(token)).toThrow(/expired/i);
  });

  it("fails closed when the signing secret is missing", () => {
    delete process.env.PAYMENT_REQUEST_SECRET;
    expect(() => createOrderToken(order)).toThrow(/not configured/i);
  });
});
