import { NextResponse } from "next/server";
import { getPaymentStatus } from "@base-org/account";
import { getAddress } from "viem";
import { readOrderToken } from "@/lib/order-token";
import { hasPaymentBeenUsed, markPaymentUsed } from "@/lib/receipt-store";

type VerifyBody = { paymentId?: string; orderToken?: string };

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as VerifyBody;
    if (!body.paymentId || !/^0x[0-9a-fA-F]{64}$/.test(body.paymentId) || !body.orderToken) {
      return NextResponse.json({ error: "Invalid verification request" }, { status: 400 });
    }

    if (hasPaymentBeenUsed(body.paymentId)) {
      return NextResponse.json({ error: "This payment already has a receipt" }, { status: 409 });
    }

    const order = readOrderToken(body.orderToken);
    const payment = await getPaymentStatus({ id: body.paymentId, testnet: false });

    if (payment.status !== "completed") {
      return NextResponse.json({ error: `Payment is ${payment.status}` }, { status: 409 });
    }

    if (!payment.amount || payment.amount !== order.amount) {
      return NextResponse.json({ error: "Payment amount does not match the request" }, { status: 409 });
    }

    if (!payment.recipient || getAddress(payment.recipient) !== getAddress(order.recipient)) {
      return NextResponse.json({ error: "Payment recipient does not match the request" }, { status: 409 });
    }

    markPaymentUsed(body.paymentId);

    return NextResponse.json({
      receipt: {
        orderId: order.orderId,
        paymentId: payment.id,
        sender: payment.sender ? getAddress(payment.sender) : null,
        amount: payment.amount,
        recipient: getAddress(payment.recipient),
        status: payment.status,
      },
    });
  } catch (error) {
    console.error("Base Pay verification failed", error);
    const message = error instanceof Error && /payment request/i.test(error.message) ? error.message : "Unable to verify payment";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
