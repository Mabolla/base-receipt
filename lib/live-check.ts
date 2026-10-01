import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { encodeFunctionData, erc20Abi, getAddress } from "viem";
import { z } from "zod";
import { BASE_CHAIN_ID, BASE_USDC, BUILDER_CODE, buildAttributedTransferData, type InjectedProvider } from "./base-payment";

export const CHECK_AMOUNT = "0.01";
export const CHECK_STORAGE_KEY = "base-receipt-mcp-check-v1";
const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
export const paymentHash = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
const preparedSchema = z.object({
  order: z.object({ orderId: z.string().min(1), amount: z.literal(CHECK_AMOUNT), recipient: address, expiresAt: z.number() }),
  orderToken: z.string().min(1).max(4096),
  transaction: z.object({ chainId: z.literal(8453), to: address, value: z.literal("0x0"), data: z.string().regex(/^0x[0-9a-fA-F]+$/) }),
  builderCode: z.literal(BUILDER_CODE),
  submission: z.literal("requires_caller_wallet"),
});
const receiptSchema = z.object({
  orderId: z.string(), paymentId: paymentHash, sender: address,
  amount: z.literal(CHECK_AMOUNT), recipient: address, status: z.literal("completed"),
});
export const checkSchema = z.object({
  payer: address, prepared: preparedSchema, paymentId: paymentHash.optional(), receipt: receiptSchema.optional(),
});
export type LiveCheck = z.infer<typeof checkSchema>;
type Prepared = z.infer<typeof preparedSchema>;

function toolValue(result: Awaited<ReturnType<Client["callTool"]>>) {
  const parsed = z.record(z.string(), z.unknown()).safeParse(result.structuredContent);
  const value = parsed.success ? parsed.data : undefined;
  if (result.isError) throw new Error(typeof value?.error === "string" ? value.error : "MCP kontrolü başarısız.");
  if (!value) throw new Error("MCP yanıtı eksik.");
  return value;
}

export function validatePrepared(value: unknown, payer: string, now = Date.now()): Prepared {
  const prepared = preparedSchema.parse(value);
  if (getAddress(prepared.order.recipient) !== getAddress(payer)
    || getAddress(prepared.transaction.to) !== getAddress(BASE_USDC)
    || prepared.transaction.data.toLowerCase() !== buildAttributedTransferData(CHECK_AMOUNT, payer).toLowerCase()) {
    throw new Error("Sipariş kendi cüzdanına 0,01 USDC gönderimiyle eşleşmiyor.");
  }
  if (prepared.order.expiresAt < now + 60_000 || prepared.order.expiresAt > now + 900_000) {
    throw new Error("Siparişin geçerlilik süresi uygun değil. Henüz işlem gönderilmedi.");
  }
  return prepared;
}

export async function prepareSelfCheck(client: Client, payer: string): Promise<Prepared> {
  return validatePrepared(toolValue(await client.callTool({
    name: "prepare_base_payment", arguments: { amount: CHECK_AMOUNT, recipient: getAddress(payer) },
  })), payer);
}

export async function connectCheckWallet(provider: InjectedProvider): Promise<string> {
  const accounts = await provider.request({ method: "eth_requestAccounts" });
  const payer = address.parse(Array.isArray(accounts) ? accounts[0] : undefined);
  if (await provider.request({ method: "eth_chainId" }) !== BASE_CHAIN_ID) {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: BASE_CHAIN_ID }] });
  }
  return getAddress(payer);
}

// Check the account again immediately before presenting a transaction. Never use
// wallet_sendCalls: the production receipt verifier requires a direct USDC call.
export async function checkWallet(provider: InjectedProvider, payer: string) {
  const accounts = await provider.request({ method: "eth_accounts" });
  if (!Array.isArray(accounts) || typeof accounts[0] !== "string" || getAddress(accounts[0]) !== getAddress(payer)) {
    throw new Error("Cüzdan hesabı değişti. Bağladığın hesaba dön; henüz işlem gönderilmedi.");
  }
  if (await provider.request({ method: "eth_chainId" }) !== BASE_CHAIN_ID) {
    throw new Error("Cüzdan Base Mainnet ağında olmalı. Henüz işlem gönderilmedi.");
  }
  const code = await provider.request({ method: "eth_getCode", params: [payer, "latest"] });
  // EIP-7702 delegated EOAs can still originate a direct transaction. Their
  // exact 23-byte designation is not a deployed contract wallet. Never request
  // a delegation change or a batched call to make this check work.
  const canSendDirectly = code === "0x"
    || (typeof code === "string" && /^0xef0100[0-9a-f]{40}$/i.test(code));
  if (!canSendDirectly) throw new Error("Bağlanan hesap bu kontrol için desteklenmeyen bir sözleşme cüzdanı. Doğrudan işlem gönderen MetaMask hesabını seç. İşlem gönderilmedi.");
  const balance = await provider.request({ method: "eth_call", params: [{
    to: BASE_USDC, data: encodeFunctionData({ abi: erc20Abi, functionName: "balanceOf", args: [getAddress(payer)] }),
  }, "latest"] });
  if (typeof balance !== "string" || BigInt(balance) < BigInt(10_000)) throw new Error("Base üzerinde en az 0,01 USDC gerekiyor. İşlem gönderilmedi.");
  const gasBalance = await provider.request({ method: "eth_getBalance", params: [payer, "latest"] });
  if (typeof gasBalance !== "string" || BigInt(gasBalance) === BigInt(0)) throw new Error("Ağ ücreti için Base üzerinde ETH gerekiyor. İşlem gönderilmedi.");
}

export async function submitSelfCheck(provider: InjectedProvider, check: LiveCheck, beforeSubmit: () => void) {
  if (check.paymentId || check.receipt) throw new Error("Bu kontrolün işlemi zaten gönderildi. Yalnızca makbuzu doğrula.");
  const prepared = validatePrepared(check.prepared, check.payer);
  await checkWallet(provider, check.payer);
  const transaction = { from: getAddress(check.payer), to: BASE_USDC, value: "0x0", data: prepared.transaction.data };
  // Simulation catches a reverted self-transfer before asking for a paid transaction.
  await provider.request({ method: "eth_estimateGas", params: [transaction] });
  beforeSubmit();
  return paymentHash.parse(await provider.request({ method: "eth_sendTransaction", params: [transaction] }));
}

export async function issueCheckReceipt(client: Client, check: LiveCheck) {
  const hash = paymentHash.parse(check.paymentId);
  const value = toolValue(await client.callTool({ name: "issue_base_receipt", arguments: {
    paymentId: hash, orderToken: check.prepared.orderToken,
  } }));
  const receipt = receiptSchema.parse(value.receipt);
  if (receipt.orderId !== check.prepared.order.orderId || receipt.paymentId.toLowerCase() !== hash.toLowerCase()
    || getAddress(receipt.sender) !== getAddress(check.payer) || getAddress(receipt.recipient) !== getAddress(check.payer)) {
    throw new Error("Makbuz bu kontrolün siparişiyle eşleşmiyor.");
  }
  return receipt;
}
