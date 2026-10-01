import packageJson from "@/package.json";

export function GET() {
  return Response.json({
    name: "base-agent-meter",
    version: "0.2.0",
    network: "eip155:8453",
    mcp: { endpoint: "/meter/mcp", transport: "Streamable HTTP", tools: ["check_x402_endpoint", "verify_base_settlement"], readOnly: true },
    source: { repository: "https://github.com/Mabolla/base-agent-meter", commit: packageJson.dependencies["base-agent-meter"].split("#").at(-1) },
    submitsTransactions: false,
    paidFixtureHosted: false,
    limits: { requestsPerMinutePerRuntime: 30, concurrentRequestsPerRuntime: 4, distributedQuota: false },
  });
}
