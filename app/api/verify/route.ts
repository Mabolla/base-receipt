import { NextResponse } from "next/server";
import { getPaymentStatus } from "@base-org/account";
import { getAddress, isAddress } from "viem";
import { hasPaymentBeenUsed, markPaymentUsed } from "@/lib/receipt-store";

type VerifyBody = {
  orderId?: string;
  paymentId?: string;
  amount?: string;
  recipient?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as VerifyBody;
    const { orderId, paymentId, amount, recipient } = body;

    if (!orderId || !paymentId || !amount || !recipient || !isAddress(recipient)) {
      return NextResponse.json({ error: "Invalid verification request" }, { status: 400 });
    }

    if (hasPaymentBeenUsed(paymentId)) {
      return NextResponse.json({ error: "This payment already has a receipt" }, { status: 409 });
    }

    const status = await getPaymentStatus({ id: paymentId, testnet: false });

    if (status.status !== "completed") {
      return NextResponse.json({ error: `Payment is ${status.status}` }, { status: 409 });
    }

    // Base Pay is the source of truth for completion. The order fields below are
    // retained in the receipt so the server, not the UI, controls receipt issuance.
    markPaymentUsed(paymentId);

    return NextResponse.json({
      receipt: {
        orderId,
        paymentId,
        amount,
        recipient: getAddress(recipient),
        status: "completed",
      },
    });
  } catch (error) {
    console.error("Base Pay verification failed", error);
    return NextResponse.json({ error: "Unable to verify payment" }, { status: 502 });
  }
}
