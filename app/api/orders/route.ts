import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getAddress, isAddress } from "viem";
import { createOrderToken } from "@/lib/order-token";

const AMOUNT_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { amount?: string; recipient?: string };
    const amount = body.amount?.trim();
    const recipient = body.recipient?.trim();

    if (!amount || !AMOUNT_PATTERN.test(amount) || Number(amount) <= 0 || !recipient || !isAddress(recipient)) {
      return NextResponse.json({ error: "Enter a valid USDC amount and EVM recipient" }, { status: 400 });
    }

    const order = {
      orderId: randomUUID(),
      amount,
      recipient: getAddress(recipient),
      expiresAt: Date.now() + 15 * 60 * 1000,
    };

    return NextResponse.json({ order, token: createOrderToken(order) });
  } catch (error) {
    console.error("Unable to create payment request", error);
    return NextResponse.json({ error: "Unable to create payment request" }, { status: 500 });
  }
}
