import { Attribution } from "ox/erc8021";
import { concatHex, encodeFunctionData, getAddress, parseUnits, type Hex } from "viem";

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

type InjectedProvider = {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
};

function injectedProvider(): InjectedProvider {
  const provider = (window as Window & { ethereum?: InjectedProvider }).ethereum;
  if (!provider) throw new Error("MetaMask or another injected wallet is required");
  return provider;
}

export async function payAttributed(amount: string, recipient: string): Promise<{ id: string }> {
  const provider = injectedProvider();
  const accounts = await provider.request({ method: "eth_requestAccounts" });
  const from = Array.isArray(accounts) ? accounts[0] : undefined;

  if (typeof from !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(from)) {
    throw new Error("Wallet did not return a payer address");
  }

  const chainId = await provider.request({ method: "eth_chainId" });
  if (chainId !== BASE_CHAIN_ID) {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: BASE_CHAIN_ID }],
    });
  }

  const id = await provider.request({
    method: "eth_sendTransaction",
    params: [{
      from: getAddress(from),
      to: BASE_USDC,
      data: buildAttributedTransferData(amount, recipient),
      value: "0x0",
    }],
  });

  if (typeof id !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(id)) {
    throw new Error("Wallet did not return a valid transaction hash");
  }

  for (let attempt = 0; attempt < 30; attempt += 1) {
    const receipt = await provider.request({ method: "eth_getTransactionReceipt", params: [id] });
    if (receipt) return { id };
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }

  throw new Error(`Transaction submitted but confirmation timed out: ${id}`);

}
