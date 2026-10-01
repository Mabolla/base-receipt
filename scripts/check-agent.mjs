import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { decodeFunctionData, erc20Abi, getAddress } from "viem";
import { Attribution } from "ox/erc8021";

const origin = process.argv[2];
if (!origin) throw new Error("Usage: node scripts/check-agent.mjs <application-origin> [recipient]");
const recipient = getAddress(process.argv[3] ?? "0x1111111111111111111111111111111111111111");

for (const path of ["/", "/agents", "/api/agent"]) {
  const response = await fetch(new URL(path, origin));
  assert.equal(response.status, 200, `${path} must be reachable`);
}

const client = new Client({ name: "base-receipt-release-check", version: "1.0.0" });
try {
  await client.connect(new StreamableHTTPClientTransport(new URL("/mcp", origin)));
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map(tool => tool.name), ["prepare_base_payment", "issue_base_receipt"]);
  // Preparation signs only the short-lived order. No wallet is loaded, and no transaction is sent.
  const requestedAt = Date.now();
  const prepared = await client.callTool({ name: "prepare_base_payment", arguments: { amount: "0.01", recipient } });
  assert.notEqual(prepared.isError, true, "payment preparation must succeed");
  const { transaction, order, orderToken, serverTime, submission } = prepared.structuredContent;
  assert.equal(transaction.chainId, 8453);
  assert.equal(transaction.to, "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913");
  assert.equal(transaction.value, "0x0");
  assert.equal(submission, "requires_caller_wallet");
  assert.equal(order.recipient, recipient);
  assert.ok(Number.isSafeInteger(serverTime) && serverTime >= 0);
  const lifetime = order.expiresAt - serverTime;
  assert.ok(lifetime <= 900000 && lifetime - (Date.now() - requestedAt) >= 60000);
  assert.equal(typeof orderToken, "string");
  const decoded = decodeFunctionData({ abi: erc20Abi, data: transaction.data });
  assert.equal(decoded.functionName, "transfer");
  assert.deepEqual(decoded.args, [recipient, 10000n]);
  assert.deepEqual(Attribution.fromData(transaction.data)?.codes, ["bc_87fjmj1l"]);
  // Invalid signatures are rejected before RPC access or receipt persistence.
  const rejected = await client.callTool({ name: "issue_base_receipt", arguments: { paymentId: `0x${"0".repeat(64)}`, orderToken: "invalid.signature" } });
  assert.equal(rejected.isError, true);
  assert.match(rejected.structuredContent.error, /payment request/i);
  console.log(JSON.stringify({ origin, checkedAt: new Date().toISOString(), tools: tools.map(tool => tool.name), preparationVerified: true, serverClockReported: true, invalidSignatureRejected: true, transactionSubmitted: false }));
} finally {
  await client.close();
}
