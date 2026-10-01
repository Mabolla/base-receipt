import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { Attribution } from "ox/erc8021";
import { decodeFunctionData, erc20Abi } from "viem";
import { describe, expect, it, vi } from "vitest";
import { handleReceiptMcpRequest, type ReceiptHandlers } from "./agent-mcp";
import { BASE_USDC, BUILDER_CODE } from "./base-payment";

function handlers() {
  return {
    prepare: vi.fn(async (request: Request) => {
      const input = await request.json();
      return Response.json({ order: { ...input, orderId: "test-order", expiresAt: 123456789 }, token: "test-token" });
    }),
    verify: vi.fn<ReceiptHandlers["verify"]>(async () => Response.json({ error: "This payment was already used for another request" }, { status: 409 })),
  };
}

async function connect(dependencies: ReceiptHandlers) {
  const client = new Client({ name: "receipt-test", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL("https://receipt.example/mcp"), {
    fetch: async (input, init) => handleReceiptMcpRequest(new Request(input as RequestInfo, init), dependencies),
  });
  await client.connect(transport);
  return client;
}

describe("Base Receipt agent interface", () => {
  it("discovers accurate write annotations and returns unsigned attributed transfer data", async () => {
    const dependencies = handlers();
    const client = await connect(dependencies);
    try {
      const listed = await client.listTools();
      expect(listed.tools.map(tool => tool.name)).toEqual(["prepare_base_payment", "issue_base_receipt"]);
      expect(listed.tools.every(tool => tool.annotations?.readOnlyHint === false)).toBe(true);
      const result = await client.callTool({ name: "prepare_base_payment", arguments: { amount: "0.01", recipient: "0x1111111111111111111111111111111111111111" } });
      expect(result.isError).not.toBe(true);
      const value = result.structuredContent as { orderToken: string; submission: string; transaction: { to: string; data: `0x${string}`; chainId: number } };
      expect(value.orderToken).toBe("test-token");
      expect(value.submission).toBe("requires_caller_wallet");
      expect(value.transaction.chainId).toBe(8453);
      expect(value.transaction.to).toBe(BASE_USDC);
      expect(decodeFunctionData({ abi: erc20Abi, data: value.transaction.data }).args).toEqual(["0x1111111111111111111111111111111111111111", BigInt(10000)]);
      expect(Attribution.fromData(value.transaction.data)?.codes).toEqual([BUILDER_CODE]);
      expect(dependencies.prepare).toHaveBeenCalledOnce();
      expect(dependencies.verify).not.toHaveBeenCalled();
    } finally { await client.close(); }
  });

  it.each(["0", "-1", "0.0000001", "1e3", "9".repeat(80)])("rejects invalid amount %s before calling the existing API", async amount => {
    const dependencies = handlers();
    const client = await connect(dependencies);
    try {
      const result = await client.callTool({ name: "prepare_base_payment", arguments: { amount, recipient: "0x1111111111111111111111111111111111111111" } });
      expect(result.isError).toBe(true);
      expect(dependencies.prepare).not.toHaveBeenCalled();
    } finally { await client.close(); }
  });

  it("preserves verification errors and passes the original proof inputs to the existing API", async () => {
    const dependencies = handlers();
    const client = await connect(dependencies);
    try {
      const input = { paymentId: `0x${"1".repeat(64)}`, orderToken: "signed-order" };
      const result = await client.callTool({ name: "issue_base_receipt", arguments: input });
      expect(result.isError).toBe(true);
      expect(result.structuredContent).toMatchObject({ httpStatus: 409, error: "This payment was already used for another request" });
      expect(await dependencies.verify.mock.calls[0][0].json()).toEqual(input);
    } finally { await client.close(); }
  });

  it("returns a verified receipt only after the existing API accepts it", async () => {
    const dependencies = handlers();
    dependencies.verify.mockImplementation(async () => Response.json({ receipt: { status: "completed", orderId: "test-order" } }));
    const client = await connect(dependencies);
    try {
      const result = await client.callTool({ name: "issue_base_receipt", arguments: { paymentId: `0x${"1".repeat(64)}`, orderToken: "signed-order" } });
      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toMatchObject({ httpStatus: 200, receipt: { status: "completed" } });
    } finally { await client.close(); }
  });

  it("rejects unsupported HTTP methods, foreign browser origins and oversized requests", async () => {
    const dependencies = handlers();
    expect((await handleReceiptMcpRequest(new Request("https://receipt.example/mcp"), dependencies)).status).toBe(405);
    const foreign = new Request("https://receipt.example/mcp", { method: "POST", headers: { Origin: "https://other.example" } });
    expect((await handleReceiptMcpRequest(foreign, dependencies)).status).toBe(403);
    const large = new Request("https://receipt.example/mcp", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" }, body: "x".repeat(65537) });
    expect((await handleReceiptMcpRequest(large, dependencies)).status).toBe(413);
    expect(dependencies.prepare).not.toHaveBeenCalled();
    expect(dependencies.verify).not.toHaveBeenCalled();
  });
});
