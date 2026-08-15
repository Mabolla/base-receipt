import type { Metadata } from "next";
import "./globals.css";

const appUrl = "https://base-receipt-jf11ddnlm-mabolla1.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: "Base Receipt",
  description: "Verified USDC payment receipts on Base Mainnet.",
  applicationName: "Base Receipt",
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
