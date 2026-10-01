import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const origin = process.argv[2];
if (!origin) throw new Error("Usage: node scripts/check-meter.mjs <application-origin> [--network]");
const networkChecks = process.argv.includes("--network");
const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const metadataResponse = await fetch(new URL("/api/meter", origin), { signal: AbortSignal.timeout(20000) });
assert.equal(metadataResponse.status, 200);
const metadata = await metadataResponse.json();
assert.equal(metadata.source.commit, pkg.dependencies["base-agent-meter"].split("#").at(-1));
assert.equal((await fetch(new URL("/meter", origin), { signal: AbortSignal.timeout(20000) })).status, 200);

function readResult(result) {
  assert.notEqual(result.isError, true, JSON.stringify(result.content));
  return JSON.parse(result.content.find(item => item.type === "text").text);
}

const client = new Client({ name: "base-agent-meter-release-check", version: "1.0.0" });
try {
  await client.connect(new StreamableHTTPClientTransport(new URL("/meter/mcp", origin)));
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map(tool => tool.name), ["check_x402_endpoint", "verify_base_settlement"]);
  assert.ok(tools.every(tool => tool.annotations.readOnlyHint));
  const rejected = await client.callTool({ name: "check_x402_endpoint", arguments: { url: "http://127.0.0.1/" } });
  assert.equal(rejected.isError, true);
  const post = await client.callTool({ name: "check_x402_endpoint", arguments: { url: "https://example.com", method: "POST" } });
  assert.equal(post.isError, true);

  let proof = null;
  if (networkChecks) {
    // A reachable ordinary JSON endpoint must fail x402 negotiation honestly.
    const report = readResult(await client.callTool({ name: "check_x402_endpoint", arguments: { url: new URL("/api/agent", origin).href } }));
    assert.equal(report.negotiation.httpStatus, 200);
    assert.equal(report.status, "FAIL");
    assert.ok(report.findings.some(finding => finding.code === "missing_402"));
    // Re-read the historical Base Receipt payment; this never sends a new transaction.
    const verified = readResult(await client.callTool({ name: "verify_base_settlement", arguments: {
      transactionHash: "0xa7c0d15e190b7ab099c03013b14f07c6a58a7c15c8c1e7a8132bb7512c9e881d",
      expectedPayTo: "0x94705A9d675daa924F9190Eca4c05ED6B12d5345",
      expectedPayer: "0x30eFBc8e3815762014C22b0947c5a416d3d4C6d7",
      expectedAmount: "10000",
      declaredBuilderCode: "bc_87fjmj1l",
    } }));
    assert.equal(verified.proof.settlementVerified, true);
    assert.equal(verified.proof.builderAttribution.verified, true);
    proof = { transactionHash: verified.proof.transactionHash, settlementVerified: true, attributionVerified: true };
  }
  console.log(JSON.stringify({ origin, checkedAt: new Date().toISOString(), coreCommit: metadata.source.commit, tools: tools.map(tool => tool.name), privateTargetRejected: true, postRejected: true, networkChecks, proof, transactionSubmitted: false }));
} finally { await client.close(); }
