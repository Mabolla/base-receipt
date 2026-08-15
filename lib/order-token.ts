import { createHmac, timingSafeEqual } from "node:crypto";

export type PaymentOrder = {
  orderId: string;
  amount: string;
  recipient: string;
  expiresAt: number;
};

function secret() {
  const value = process.env.PAYMENT_REQUEST_SECRET;
  if (!value) throw new Error("PAYMENT_REQUEST_SECRET is not configured");
  return value;
}

function encode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function sign(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function createOrderToken(order: PaymentOrder) {
  const payload = encode(JSON.stringify(order));
  return `${payload}.${sign(payload)}`;
}

export function readOrderToken(token: string): PaymentOrder {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) throw new Error("Malformed payment request");

  const expected = sign(payload);
  const receivedBytes = Buffer.from(signature);
  const expectedBytes = Buffer.from(expected);
  if (receivedBytes.length !== expectedBytes.length || !timingSafeEqual(receivedBytes, expectedBytes)) {
    throw new Error("Invalid payment request signature");
  }

  const order = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as PaymentOrder;
  if (!order.orderId || !order.amount || !order.recipient || !order.expiresAt) throw new Error("Invalid payment request");
  if (Date.now() > order.expiresAt) throw new Error("Payment request expired");
  return order;
}
