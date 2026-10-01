import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Base Agent Meter",
  description: "Read-only x402 endpoint checks and Base USDC settlement proof for agents.",
};

export default function MeterLayout({ children }: { children: ReactNode }) {
  return children;
}
