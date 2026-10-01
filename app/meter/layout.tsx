import type { Metadata } from "next";
import type { ReactNode } from "react";

const title = "Base Agent Meter";
const description = "Read-only x402 API checks and Base USDC payment verification.";
const url = "https://base-receipt-six.vercel.app/meter";

export const metadata: Metadata = {
  title,
  description,
  applicationName: title,
  other: {
    "base:app_id": "6a81d256b92232d481b384bc",
  },
  alternates: { canonical: url },
  openGraph: { title, description, url, siteName: title, type: "website" },
  twitter: { card: "summary", title, description },
};

export default function MeterLayout({ children }: { children: ReactNode }) {
  return children;
}
