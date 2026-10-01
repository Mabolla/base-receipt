import Link from "next/link";

export default function AgentsPage() {
  return (
    <main className="shell">
      <section className="hero">
        <p className="eyebrow">BASE RECEIPT · FOR AGENTS</p>
        <h1>Payment intent. Verified receipt.</h1>
        <p className="lede">Prepare a Base USDC payment request through MCP, submit it with your own wallet, and turn the confirmed transfer into a server-verified receipt.</p>
      </section>
      <section className="card agentDocs">
        <h2>Connect your agent</h2>
        <p>Streamable HTTP endpoint:</p>
        <code className="endpoint">https://base-receipt-six.vercel.app/mcp</code>
        <p>The endpoint accepts MCP requests over HTTP POST. No Base Receipt API key is required.</p>
        <Link className="explorerLink" href="/api/agent">View machine-readable capabilities ↗</Link>
      </section>
      <section className="card agentDocs">
        <h2>Two tools, one receipt flow</h2>
        <ol>
          <li><code>prepare_base_payment</code> accepts a decimal USDC amount and recipient. It returns a signed order valid for 15 minutes, an order token, and unsigned transaction data with Builder Code <code>bc_87fjmj1l</code>.</li>
          <li>Your wallet reviews and submits the returned direct USDC transfer on Base Mainnet, chain ID <code>8453</code>. Preserve the returned calldata, including its attribution suffix.</li>
          <li><code>issue_base_receipt</code> accepts the transaction hash as <code>paymentId</code> and the original <code>orderToken</code>. It verifies settlement and persists the receipt claim.</li>
        </ol>
        <p>Preparation example:</p>
        <pre>{'{"amount":"0.01","recipient":"0xYourRecipientAddress"}'}</pre>
        <p>Replace the placeholder with the intended recipient. The service prepares transaction data; wallet approval and payment submission stay with the caller.</p>
      </section>
      <section className="card agentDocs">
        <h2>What the receipt proves</h2>
        <p>The server checks a successful direct USDC transfer, the exact amount and recipient, the sender and Base Receipt attribution. A payment already claimed by another order is rejected.</p>
        <p>Use the same signed order when retrying within its validity window. The current verifier supports direct wallet transfers; smart-account and batched payment flows are not supported.</p>
        <p>Preparing an order does not establish payment or product adoption. A receipt proves the checked transfer, not delivery of goods or services.</p>
        <Link className="explorerLink" href="/">Open the wallet payment page</Link>
        <p><a className="explorerLink" href="https://github.com/Mabolla/base-receipt">Source and integration documentation ↗</a></p>
        <p><Link className="explorerLink" href="/meter">Base Agent Meter: inspect x402 APIs and existing settlements ↗</Link></p>
      </section>
    </main>
  );
}
