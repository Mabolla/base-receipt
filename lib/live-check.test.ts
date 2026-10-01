import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { describe, expect, it, vi } from "vitest";
import { handleReceiptMcpRequest } from "./agent-mcp";
import { BASE_USDC, BUILDER_CODE, buildAttributedTransferData, type InjectedProvider } from "./base-payment";
import { checkSchema, issueCheckReceipt, prepareSelfCheck, submitSelfCheck, validatePrepared, type LiveCheck } from "./live-check";

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
      expect(order.serverTime).toEqual(expect.any(Number));
      expect(order.requestedAt).toEqual(expect.any(Number));
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
    { eth_getCode: "0xef0100" },
    { eth_getCode: `0xef0100${"11".repeat(19)}` },
    { eth_getCode: `0xef0100${"11".repeat(21)}` },
    { eth_getCode: `0xef0101${"11".repeat(20)}` },
    { eth_getCode: `0xef0100${"gg".repeat(20)}` },
    { eth_getCode: null },
    { eth_getCode: { code: "0x" } },
  ])("does not request payment for an unsuitable wallet: %j", async overrides => {
    const provider = wallet(overrides);
    const persist = vi.fn();
    await expect(submitSelfCheck(provider, { payer, prepared: prepared() }, persist)).rejects.toThrow();
    expect(persist).not.toHaveBeenCalled();
    expect(provider.request.mock.calls.some(([args]) => args.method === "eth_sendTransaction")).toBe(false);
  });

  it.each([
    `0xef0100${"ab".repeat(20)}`,
    `0xEF0100${"AB".repeat(20)}`,
  ])("lets a delegated EOA submit the same direct USDC transaction: %s", async code => {
    const provider = wallet({ eth_getCode: code });
    const value = { payer, prepared: prepared() };
    const persist = vi.fn();
    expect(await submitSelfCheck(provider, value, persist)).toBe(hash);
    const transaction = { from: payer, to: BASE_USDC, value: "0x0", data: value.prepared.transaction.data };
    expect(provider.request).toHaveBeenCalledWith({ method: "eth_estimateGas", params: [transaction] });
    expect(provider.request).toHaveBeenCalledWith({ method: "eth_sendTransaction", params: [transaction] });
    expect(persist).toHaveBeenCalledOnce();
    expect(provider.request.mock.calls.some(([args]) => /authorization|wallet_sendCalls/i.test(args.method))).toBe(false);
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

  it.each([-21_600_000, -300_000, 300_000, 21_600_000])("accepts a fresh server order with a browser clock offset of %i ms", offset => {
    const serverTime = 1_800_000_000_000;
    const requestedAt = serverTime + offset;
    const value = { ...prepared(), serverTime, requestedAt,
      order: { ...prepared().order, expiresAt: serverTime + 900_000 } };
    expect(validatePrepared(value, payer, requestedAt + 2_000)).toEqual(value);
  });

  it("preserves clock anchors after reload and refuses to send an aged order", async () => {
    const serverTime = Date.now() + 300_000;
    const requestedAt = Date.now() - 841_000;
    const saved = checkSchema.parse(JSON.parse(JSON.stringify({ payer, prepared: {
      ...prepared(), serverTime, requestedAt, order: { ...prepared().order, expiresAt: serverTime + 900_000 },
    } })));
    expect(saved.prepared).toMatchObject({ serverTime, requestedAt });
    const provider = wallet();
    const persist = vi.fn();
    await expect(submitSelfCheck(provider, saved, persist)).rejects.toThrow(/geçerlilik/);
    expect(persist).not.toHaveBeenCalled();
    expect(provider.request).not.toHaveBeenCalled();
  });

  it.each([59_999, 900_001])("rejects an invalid server-issued lifetime of %i ms", lifetime => {
    const serverTime = 1_800_000_000_000;
    const requestedAt = serverTime - 300_000;
    const value = { ...prepared(), serverTime, requestedAt,
      order: { ...prepared().order, expiresAt: serverTime + lifetime } };
    expect(() => validatePrepared(value, payer, requestedAt + (lifetime > 900_000 ? 2_000 : 0))).toThrow(/geçerlilik/);
  });

  it("rejects a backwards clock change and incomplete clock anchors", () => {
    const serverTime = 1_800_000_000_000;
    const requestedAt = serverTime - 300_000;
    const value = { ...prepared(), serverTime, requestedAt,
      order: { ...prepared().order, expiresAt: serverTime + 900_000 } };
    expect(() => validatePrepared(value, payer, requestedAt - 1)).toThrow(/geçerlilik/);
    expect(() => validatePrepared({ ...value, requestedAt: undefined }, payer, requestedAt)).toThrow(/geçerlilik/);
    expect(() => validatePrepared({ ...value, serverTime: undefined }, payer, requestedAt)).toThrow(/geçerlilik/);
  });

  it("deducts the whole MCP round trip from the server lifetime", async () => {
    const serverTime = 1_800_000_000_000;
    let browserTime = serverTime - 300_000;
    const now = vi.spyOn(Date, "now").mockImplementation(() => browserTime);
    const value = { ...prepared(), serverTime, order: { ...prepared().order, expiresAt: serverTime + 900_000 } };
    const client = { callTool: vi.fn(async () => {
      browserTime += 841_000;
      return { structuredContent: value };
    }) } as unknown as Client;
    try {
      await expect(prepareSelfCheck(client, payer)).rejects.toThrow(/geçerlilik/);
    } finally { now.mockRestore(); }
  });

  it("keeps legacy saved checks readable and validates their original expiry", () => {
    const value = prepared();
    expect(checkSchema.parse({ payer, prepared: value, paymentId: hash })).toEqual({ payer, prepared: value, paymentId: hash });
    expect(validatePrepared(value, payer)).toEqual(value);
    expect(() => validatePrepared(value, payer, value.order.expiresAt)).toThrow(/geçerlilik/);
  });

  it("rejects a receipt for a different original order", async () => {
    const client = { callTool: vi.fn(async () => ({ structuredContent: { receipt: {
      orderId: "another-order", paymentId: hash, sender: payer, recipient: payer, amount: "0.01", status: "completed",
    } } })) } as unknown as Client;
    await expect(issueCheckReceipt(client, { payer, prepared: prepared(), paymentId: hash })).rejects.toThrow(/eşleşmiyor/);
  });
});
