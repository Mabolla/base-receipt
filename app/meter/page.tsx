"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

type Report = { status: string; checkedAt: string; findings: { level: string; code: string; message: string }[]; [key: string]: unknown };

export default function MeterPage() {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [report, setReport] = useState<Report | null>(null);

  async function runCheck(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(""); setReport(null);
    const client = new Client({ name: "base-agent-meter-web", version: "0.2.0" });
    try {
      await client.connect(new StreamableHTTPClientTransport(new URL("/meter/mcp", window.location.origin)));
      const result = await client.callTool({ name: "check_x402_endpoint", arguments: { url } });
      const text = (result.content as { type: string; text?: string }[]).find(item => item.type === "text")?.text;
      if (result.isError) throw new Error(text ?? "Endpoint check failed");
      if (!text) throw new Error("The checker returned no report");
      setReport(JSON.parse(text) as Report);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Endpoint check failed"); }
    finally { await client.close().catch(() => undefined); setBusy(false); }
  }

  return (
    <main className="shell">
      <section className="hero">
        <p className="eyebrow">BASE AGENT METER · X402 ASSURANCE</p>
        <h1>Check the payment path.</h1>
        <p className="lede">Inspect an API&apos;s unpaid x402 challenge on Base: USDC terms, recipient, discovery metadata and declared Builder Code.</p>
      </section>
      <section className="card agentDocs">
        <h2>Check a public endpoint</h2>
        <form onSubmit={runCheck}>
          <label>Protected API URL<input type="url" required placeholder="https://api.example.com/paid-resource" value={url} onChange={event => setUrl(event.target.value)} /></label>
          <button disabled={busy}>{busy ? "Checking…" : "Run unpaid GET check"}</button>
        </form>
        <p>Use the final protected URL. The checker sends a GET, follows no redirects and submits no payment.</p>
        <div aria-live="polite">
          {error && <p role="alert">{error}</p>}
          {report && <>
            <h3>Result: {report.status}</h3>
            <ul>{report.findings.map(finding => <li key={finding.code}><strong>{finding.level.toUpperCase()}</strong> — {finding.message}</li>)}</ul>
            <details><summary>Full JSON report</summary><pre>{JSON.stringify(report, null, 2)}</pre></details>
          </>}
        </div>
      </section>
      <section className="card agentDocs">
        <h2>Connect an agent</h2>
        <code className="endpoint">https://base-receipt-six.vercel.app/meter/mcp</code>
        <p><code>check_x402_endpoint</code> inspects an unpaid GET challenge and optional pinned expectations. <code>verify_base_settlement</code> checks an existing Base USDC transfer against an expected recipient, atomic amount, optional payer and optional Builder Code.</p>
        <p>Both tools are read-only. A declared Builder Code is not settlement proof; the proof tool reads the completed transaction. These checks do not create a Base Receipt claim.</p>
        <Link className="explorerLink" href="/api/meter">View capabilities and source revision ↗</Link>
      </section>
      <section className="card agentDocs">
        <h2>Shared hosting, separate tools</h2>
        <p>This host runs the checked Meter core from its own GitHub repository. The paid snapshot fixture and paid canary are not hosted here. Runtime limits are 30 requests per minute and four concurrent requests per instance; they are not a global usage quota.</p>
        <Link className="explorerLink" href="/agents">Base Receipt: prepare payments and issue receipts ↗</Link>
        <p><a className="explorerLink" href="https://github.com/Mabolla/base-agent-meter">Base Agent Meter source ↗</a></p>
      </section>
    </main>
  );
}
