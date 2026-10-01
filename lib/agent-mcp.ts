import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { isAddress, maxUint256, parseUnits } from "viem";
import { z } from "zod";
import { BASE_USDC, BUILDER_CODE, buildAttributedTransferData } from "./base-payment";
import type { PaymentOrder } from "./order-token";

type RouteHandler = (request: Request) => Promise<Response>;
export interface ReceiptHandlers {
  prepare: RouteHandler;
  verify: RouteHandler;
}

export const AGENT_CAPABILITIES = {
  name: "base-receipt",
  version: "0.2.0",
  network: "eip155:8453",
  asset: { symbol: "USDC", address: BASE_USDC, decimals: 6 },
  builderCode: BUILDER_CODE,
  mcp: { endpoint: "/mcp", transport: "Streamable HTTP", tools: ["prepare_base_payment", "issue_base_receipt"] },
  submitsTransactions: false,
  paymentRequestLifetimeSeconds: 900,
  receiptRequirements: ["successful direct USDC transfer", "exact amount and recipient", "Base Receipt attribution", "signed unexpired order", "payment not claimed by another order"],
} as const;

function toolResult(value: Record<string, unknown>, isError = false) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value) }], structuredContent: value, ...(isError ? { isError: true } : {}) };
}

// Invoke the same handlers as the browser in-process. This never performs an HTTP request.
async function callRoute(handler: RouteHandler, path: string, body: unknown) {
  const response = await handler(new Request(`https://base-receipt.internal${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }));
  return { response, value: await response.json() as Record<string, unknown> };
}

export function createReceiptMcpServer(handlers: ReceiptHandlers) {
  const server = new McpServer({ name: "base-receipt", version: AGENT_CAPABILITIES.version }, {
    instructions: "Prepare signed Base USDC payment requests and claim verified receipts for already submitted transactions. Payment preparation returns unsigned calldata. The caller controls its wallet, review, signing and transaction submission. These tools never access private keys or broadcast transactions. Receipt issuance persists a claim and is not read-only.",
  });
  const amount = z.string().max(86).regex(/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/).refine(value => {
    try { const units = parseUnits(value, 6); return units > BigInt(0) && units <= maxUint256; } catch { return false; }
  }, "must be a positive USDC amount within uint256 range");

  server.registerTool("prepare_base_payment", {
    title: "Prepare a Base USDC payment",
    description: "Create a signed 15-minute payment request and unsigned direct-USDC-transfer calldata with Base Receipt attribution. Amount is a decimal USDC string, for example 0.01. Review the recipient, amount and chain; a caller-controlled wallet must separately sign and submit. Creating the request does not pay or issue a receipt.",
    inputSchema: { amount, recipient: z.string().refine(isAddress, "must be a valid EVM address") },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async input => {
    try {
      const { response, value } = await callRoute(handlers.prepare, "/api/orders", input);
      if (!response.ok) return toolResult({ ...value, httpStatus: response.status }, true);
      const order = value.order as PaymentOrder;
      return toolResult({
        order,
        orderToken: value.token,
        serverTime: Date.now(),
        transaction: { chainId: 8453, to: BASE_USDC, value: "0x0", data: buildAttributedTransferData(order.amount, order.recipient) },
        builderCode: BUILDER_CODE,
        submission: "requires_caller_wallet",
      });
    } catch {
      return toolResult({ error: "Unable to prepare payment request" }, true);
    }
  });

  server.registerTool("issue_base_receipt", {
    title: "Issue a verified Base receipt",
    description: "Verify an already submitted direct USDC transaction against the signed unexpired order. Checks successful settlement, sender, exact amount, recipient and Base Receipt Builder Code, then persists an exclusive receipt claim. Reusing the payment for another order is rejected. Repeating the same valid order is idempotent. This tool writes a receipt but never submits a payment.",
    inputSchema: { paymentId: z.string().regex(/^0x[0-9a-fA-F]{64}$/), orderToken: z.string().min(1).max(4096) },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async input => {
    try {
      const { response, value } = await callRoute(handlers.verify, "/api/verify", input);
      return toolResult({ ...value, httpStatus: response.status }, !response.ok);
    } catch {
      return toolResult({ error: "Unable to verify payment" }, true);
    }
  });
  return server;
}

export function methodNotAllowed() {
  return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32000, message: "Method not allowed" } }, { status: 405, headers: { Allow: "POST", "Cache-Control": "no-store" } });
}

export async function handleReceiptMcpRequest(request: Request, handlers: ReceiptHandlers): Promise<Response> {
  if (request.method !== "POST") return methodNotAllowed();
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32000, message: "Origin not allowed" } }, { status: 403 });
  }
  const server = createReceiptMcpServer(handlers);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
    maxRequestBodySize: 64 * 1024,
  });
  try {
    await server.connect(transport);
    const response = await transport.handleRequest(request);
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch {
    return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32603, message: "MCP request failed" } }, { status: 500 });
  } finally {
    await server.close().catch(() => undefined);
  }
}
