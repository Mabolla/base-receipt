import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { describe, expect, it, vi } from "vitest";
import { handleReceiptMcpRequest } from "./agent-mcp";
import { BASE_USDC, BUILDER_CODE, buildAttributedTransferData, type InjectedProvider } from "./base-payment";
import { issueCheckReceipt, prepareSelfCheck, submitSelfCheck, validatePrepared, type LiveCheck } from "./live-check";

const payer = "0x1111111111111111111111111111111111111111";
const other = "0x2222222222222222222222222222222222222222";
const hash = `0x${"a".repeat(64)}`;

function prepared(): LiveCheck["prepared"] {
  return {
    order: { orderId: "live-order", amount: "0.01" as const, recipient: payer, expiresAt: Date.now() + 890_000 },
    orderToken: "original-signed-token",
    transaction: { chainId: 8453 as const, to: BASE_USDC, value: "0x0" as const, data: buildAttributedTransferData("0.01", payer) },
    builderCode: BUILDER_CODE, submission: "requires_caller_wallet" as const,
  };
}

function wallet(overrides: Record<string, unknown> = {}) {
  const request = vi.fn(async ({ method }: { method: string }) => ({
    eth_accounts: [payer], eth_chainId: "0x2105", eth_getCode: "0x",
    eth_call: "0x2710", eth_getBalance: "0x123456", eth_estimateGas: "0x10000", eth_sendTransaction: hash,
    ...overrides,
  })[method]);
  return { request } satisfies InjectedProvider;
}

describe("wallet-approved MCP live check", () => {
  it("passes the MCP-prepared transaction and exact original token through payment and receipt issuance", async () => {
    const value = prepared();
    const verify = vi.fn(async (request: Request) => {
      expect(await request.json()).toEqual({ paymentId: hash, orderToken: value.orderToken });
      return Response.json({ receipt: { orderId: value.order.orderId, paymentId: hash, sender: payer, recipient: payer, amount: "0.01", status: "completed" } });
    });
    const client = new Client({ name: "live-check-test", version: "1" });
    await client.connect(new StreamableHTTPClientTransport(new URL("https://receipt.example/mcp"), {
      fetch: (input, init) => handleReceiptMcpRequest(new Request(input as RequestInfo, init), {
        prepare: async () => Response.json({ order: value.order, token: value.orderToken }), verify,
      }),
    }));
    try {
      const order = await prepareSelfCheck(client, payer);
      const provider = wallet();
      const persist = vi.fn();
      const paymentId = await submitSelfCheck(provider, { payer, prepared: order }, persist);
      expect(persist).toHaveBeenCalledOnce();
      const sendIndex = provider.request.mock.calls.findIndex(([args]) => args.method === "eth_sendTransaction");
      expect(persist.mock.invocationCallOrder[0]).toBeLessThan(provider.request.mock.invocationCallOrder[sendIndex]);
      expect(provider.request).toHaveBeenCalledWith({ method: "eth_sendTransaction", params: [{ from: payer, to: BASE_USDC, value: "0x0", data: order.transaction.data }] });
      expect(await issueCheckReceipt(client, { payer, prepared: order, paymentId })).toMatchObject({ status: "completed", orderId: order.order.orderId });
      expect(verify).toHaveBeenCalledOnce();
    } finally { await client.close(); }
  });

  it.each([
    { eth_accounts: [other] }, { eth_chainId: "0x1" }, { eth_getCode: "0x1234" },
    { eth_call: "0x0" }, { eth_getBalance: "0x0" },
  ])("does not request payment for an unsuitable wallet: %j", async overrides => {
    const provider = wallet(overrides);
    const persist = vi.fn();
    await expect(submitSelfCheck(provider, { payer, prepared: prepared() }, persist)).rejects.toThrow();
    expect(persist).not.toHaveBeenCalled();
    expect(provider.request.mock.calls.some(([args]) => args.method === "eth_sendTransaction")).toBe(false);
  });

  it("rejects changed recipient, contract, amount, calldata and stale orders before wallet submission", () => {
    const value = prepared();
    for (const changed of [
      { ...value, order: { ...value.order, recipient: other } },
      { ...value, order: { ...value.order, amount: "1" } },
      { ...value, transaction: { ...value.transaction, to: other } },
      { ...value, transaction: { ...value.transaction, data: buildAttributedTransferData("1", payer) } },
      { ...value, order: { ...value.order, expiresAt: Date.now() } },
    ]) expect(() => validatePrepared(changed, payer)).toThrow();
  });

  it("refuses to submit a second transaction for a known payment", async () => {
    const provider = wallet();
    await expect(submitSelfCheck(provider, { payer, prepared: prepared(), paymentId: hash }, vi.fn())).rejects.toThrow(/zaten/);
    expect(provider.request).not.toHaveBeenCalled();
  });

  it("rejects a receipt for a different original order", async () => {
    const client = { callTool: vi.fn(async () => ({ structuredContent: { receipt: {
      orderId: "another-order", paymentId: hash, sender: payer, recipient: payer, amount: "0.01", status: "completed",
    } } })) } as unknown as Client;
    await expect(issueCheckReceipt(client, { payer, prepared: prepared(), paymentId: hash })).rejects.toThrow(/eşleşmiyor/);
  });
});
