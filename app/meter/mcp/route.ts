import { handleMeterWebRequest, meterMethodNotAllowed } from "base-agent-meter";
import { createMeterBudget } from "@/lib/meter-budget";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
const budget = createMeterBudget();

export async function POST(request: Request) {
  const slot = budget.acquire();
  if (!slot.allowed) {
    return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32000, message: "Meter request budget reached; retry later" } }, { status: slot.status, headers: { "Retry-After": String(slot.retryAfter), "Cache-Control": "no-store" } });
  }
  try {
    return await handleMeterWebRequest(request, { rpcUrl: process.env.BASE_RPC_URL ?? "https://mainnet.base.org" });
  } finally { slot.release(); }
}

export const GET = meterMethodNotAllowed;
export const DELETE = meterMethodNotAllowed;
