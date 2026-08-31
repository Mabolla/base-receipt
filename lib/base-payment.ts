import { createBaseAccountSDK } from "@base-org/account";
import { Attribution } from "ox/erc8021";
import { concatHex, encodeFunctionData, getAddress, parseUnits, type Address, type Hex } from "viem";

export const BASE_CHAIN_ID = "0x2105";
export const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
export const BUILDER_CODE = "bc_87fjmj1l";
export const DATA_SUFFIX = Attribution.toDataSuffix({ codes: [BUILDER_CODE] });

const TRANSFER_ABI = [
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

export function buildAttributedTransferData(amount: string, recipient: string): Hex {
  const transferData = encodeFunctionData({
    abi: TRANSFER_ABI,
    functionName: "transfer",
    args: [getAddress(recipient), parseUnits(amount, 6)],
  });

  // Append the ERC-8021 suffix to the actual USDC calldata. Relying only on the
  // wallet attribution capability did not preserve the suffix in the UserOp.
  return concatHex([transferData, DATA_SUFFIX]);
}

function paymentIdFromResponse(response: unknown): string {
  const id = typeof response === "string"
    ? response
    : response && typeof response === "object" && "id" in response
      ? (response as { id?: unknown }).id
      : undefined;

  if (typeof id !== "string" || !/^0x[0-9a-fA-F]{64}/.test(id)) {
    throw new Error("Base Account did not return a valid payment ID");
  }

  return id.slice(0, 66);
}

export async function payAttributed(amount: string, recipient: string): Promise<{ id: string }> {
  const sdk = createBaseAccountSDK({
    appName: "Base Receipt",
    appChainIds: [8453],
  });
  const provider = sdk.getProvider();
  const accounts = await provider.request({ method: "eth_requestAccounts" });
  const from = Array.isArray(accounts) ? accounts[0] : undefined;

  if (typeof from !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(from)) {
    throw new Error("Base Account did not return a payer address");
  }

  const response = await provider.request({
    method: "wallet_sendCalls",
    params: [{
      version: "2.0.0",
      chainId: BASE_CHAIN_ID,
      from: getAddress(from) as Address,
      calls: [{
        to: BASE_USDC,
        data: buildAttributedTransferData(amount, recipient),
        value: "0x0",
      }],
    }],
  });

  return { id: paymentIdFromResponse(response) };
}
