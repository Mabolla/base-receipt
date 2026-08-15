"use client";

import { FormEvent, useState } from "react";
import { pay } from "@base-org/account";

type Receipt = {
  orderId: string;
  paymentId: string;
  amount: string;
  recipient: string;
  status: string;
};

export default function Home() {
  const [amount, setAmount] = useState("1.00");
  const [recipient, setRecipient] = useState("");
  const [orderId, setOrderId] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Ready to create a verified Base payment receipt.");
  const [receipt, setReceipt] = useState<Receipt | null>(null);

  async function handlePay(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setReceipt(null);

    try {
      setMessage("Opening Base Pay…");
      const result = await pay({
        amount,
        to: recipient,
        testnet: false,
      });

      setMessage("Payment submitted. Verifying server-side…");
      const response = await fetch("/api/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          orderId,
          paymentId: result.id,
          amount,
          recipient,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Payment verification failed");

      setReceipt(data.receipt);
      setMessage("Verified. Receipt issued.");
      setOrderId(crypto.randomUUID());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Payment failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="shell">
      <section className="hero">
        <p className="eyebrow">BASE RECEIPT</p>
        <h1>Pay once. Verify it. Keep the receipt.</h1>
        <p className="lede">A minimal USDC checkout that treats wallet success as a signal, not proof. Final receipts are issued only after server-side payment verification.</p>
      </section>

      <section className="card">
        <form onSubmit={handlePay}>
          <label>Amount (USDC)<input required inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
          <label>Recipient<input required placeholder="0x…" value={recipient} onChange={(e) => setRecipient(e.target.value.trim())} /></label>
          <div className="order"><span>Order</span><code>{orderId}</code></div>
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
            <div><dt>Recipient</dt><dd><code>{receipt.recipient}</code></dd></div>
            <div><dt>Payment ID</dt><dd><code>{receipt.paymentId}</code></dd></div>
            <div><dt>Order ID</dt><dd><code>{receipt.orderId}</code></dd></div>
          </dl>
        </section>
      )}
    </main>
  );
}
