import type { Metadata } from "next";
import "./globals.css";

const appUrl = "https://base-receipt-six.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: "Base Receipt",
  description: "Verified USDC payment receipts on Base Mainnet.",
  applicationName: "Base Receipt",
  other: {
    "base:app_id": "6a81dcd6e4a8a41598e7a4ab",
  },
  icons: {
    icon: "/base-receipt-icon.svg",
    apple: "/base-receipt-icon.svg",
  },
  openGraph: {
    title: "Base Receipt",
    description: "Pay USDC on Base Mainnet and receive a server-verified receipt.",
    url: appUrl,
    siteName: "Base Receipt",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Base Receipt",
    description: "Verified USDC payment receipts on Base Mainnet.",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
