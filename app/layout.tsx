import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Base Receipt",
  description: "Verified USDC payment receipts on Base",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
