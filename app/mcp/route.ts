import { POST as prepare } from "../api/orders/route";
import { POST as verify } from "../api/verify/route";
import { handleReceiptMcpRequest, methodNotAllowed } from "@/lib/agent-mcp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export function POST(request: Request) {
  return handleReceiptMcpRequest(request, { prepare, verify });
}

export const GET = methodNotAllowed;
export const DELETE = methodNotAllowed;
