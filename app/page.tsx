"use client";

import { FormEvent, useState } from "react";
import { pay } from "@base-org/account";

type Receipt = { orderId: string; paymentId: string; sender: string | null; amount: string; recipient: string; status: string };
type OrderResponse = { order: { orderId: string; amount: string; recipient: string }; token: string; error?: string };

export default function Home() {
  const [amount, setAmount] = useState("1.00");
  const [recipient, setRecipient] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Ready to create a verified Base Mainnet payment receipt.");
  const [receipt, setReceipt] = useState<Receipt | null>(null);

  async function handlePay(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setReceipt(null);

    try {
      setMessage("Creating a signed payment request…");
      const orderResponse = await fetch("/api/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amount, recipient }),
      });
      const request = (await orderResponse.json()) as OrderResponse;
      if (!orderResponse.ok) throw new Error(request.error ?? "Unable to create payment request");

      setMessage("Opening Base Pay…");
      const payment = await pay({ amount: request.order.amount, to: request.order.recipient, testnet: false });

      setMessage("Payment submitted. Verifying amount and recipient server-side…");
      const verifyResponse = await fetch("/api/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ paymentId: payment.id, orderToken: request.token }),
      });
      const verified = await verifyResponse.json();
      if (!verifyResponse.ok) throw new Error(verified.error ?? "Payment verification failed");

      setReceipt(verified.receipt);
      setMessage("Verified on Base. Receipt issued.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Payment failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="shell">
      <section className="hero">
        <p className="eyebrow">BASE RECEIPT · MAINNET</p>
        <h1>Pay once. Verify it. Keep the receipt.</h1>
        <p className="lede">A focused USDC payment flow on Base. The browser initiates payment; the server independently verifies settlement, amount and recipient before issuing a receipt.</p>
      </section>

      <section className="card">
        <form onSubmit={handlePay}>
          <label>Amount (USDC)<input required inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
          <label>Recipient<input required placeholder="0x…" value={recipient} onChange={(e) => setRecipient(e.target.value.trim())} /></label>
          <button disabled={busy || !recipient}>{busy ? "Working…" : `Pay ${amount} USDC on Base`}</button>
        </form>
        <p className="status">{message}</p>
      </section>

      {receipt && (
        <section className="card receipt">
          <p className="eyebrow">VERIFIED RECEIPT</p>
          <dl>
            <div><dt>Status</dt><dd>{receipt.status}</dd></div>
            <div><dt>Amount</dt><dd>{receipt.amount} USDC</dd></div>
            <div><dt>Sender</dt><dd><code>{receipt.sender ?? "Unavailable"}</code></dd></div>
            <div><dt>Recipient</dt><dd><code>{receipt.recipient}</code></dd></div>
            <div><dt>Payment ID</dt><dd><code>{receipt.paymentId}</code></dd></div>
            <div><dt>Order ID</dt><dd><code>{receipt.orderId}</code></dd></div>
          </dl>
        </section>
      )}
    </main>
  );
}
