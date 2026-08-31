import { NextResponse } from "next/server";
import { Attribution } from "ox/erc8021";
import { base } from "viem/chains";
import { createPublicClient, decodeEventLog, getAddress, http, parseUnits, type Hex } from "viem";
import { readOrderToken } from "@/lib/order-token";
import { claimPayment } from "@/lib/receipt-store";
import { BASE_USDC, BUILDER_CODE } from "@/lib/base-payment";

type VerifyBody = { paymentId?: string; orderToken?: string };

const client = createPublicClient({ chain: base, transport: http("https://mainnet.base.org") });
const TRANSFER_EVENT = [{
  type: "event",
  name: "Transfer",
  inputs: [
    { name: "from", type: "address", indexed: true },
    { name: "to", type: "address", indexed: true },
    { name: "value", type: "uint256", indexed: false },
  ],
}] as const;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as VerifyBody;
    if (!body.paymentId || !/^0x[0-9a-fA-F]{64}$/.test(body.paymentId) || !body.orderToken) {
      return NextResponse.json({ error: "Invalid verification request" }, { status: 400 });
    }

    const order = readOrderToken(body.orderToken);
    const hash = body.paymentId as Hex;
    const [transaction, transactionReceipt] = await Promise.all([
      client.getTransaction({ hash }),
      client.getTransactionReceipt({ hash }),
    ]);

    if (transactionReceipt.status !== "success" || !transaction.to || getAddress(transaction.to) !== getAddress(BASE_USDC)) {
      return NextResponse.json({ error: "Payment transaction is not a successful USDC call" }, { status: 409 });
    }

    const attribution = Attribution.fromData(transaction.input);
    if (!attribution?.codes?.includes(BUILDER_CODE)) {
      return NextResponse.json({ error: "Payment is missing Base Receipt attribution" }, { status: 409 });
    }

    const expectedAmount = parseUnits(order.amount, 6);
    const expectedRecipient = getAddress(order.recipient);
    const transfers = transactionReceipt.logs.flatMap((log) => {
      if (getAddress(log.address) !== getAddress(BASE_USDC)) return [];
      try {
        const decoded = decodeEventLog({ abi: TRANSFER_EVENT, data: log.data, topics: log.topics });
        return decoded.eventName === "Transfer" ? [decoded.args] : [];
      } catch {
        return [];
      }
    });
    const settled = transfers.find((transfer) =>
      getAddress(transfer.from) === getAddress(transaction.from)
      && getAddress(transfer.to) === expectedRecipient
      && transfer.value === expectedAmount,
    );

    if (!settled) {
      return NextResponse.json({ error: "Payment amount or recipient does not match the request" }, { status: 409 });
    }

    const claimed = await claimPayment({
      orderId: order.orderId,
      paymentId: hash,
      sender: getAddress(transaction.from),
      amount: order.amount,
      recipient: expectedRecipient,
      status: "completed",
    });

    if (!claimed.created && claimed.receipt.orderId !== order.orderId) {
      return NextResponse.json({ error: "This payment was already used for another request" }, { status: 409 });
    }

    return NextResponse.json({ receipt: claimed.receipt });
  } catch (error) {
    console.error("Base Pay verification failed", error);
    const message = error instanceof Error && /payment request/i.test(error.message) ? error.message : "Unable to verify payment";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
