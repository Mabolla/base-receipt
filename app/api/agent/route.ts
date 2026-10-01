import { AGENT_CAPABILITIES } from "@/lib/agent-mcp";

export const runtime = "nodejs";

export function GET() {
  return Response.json(AGENT_CAPABILITIES);
}
