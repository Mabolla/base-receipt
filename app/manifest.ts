import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Base Receipt",
    short_name: "Base Receipt",
    description: "Verified USDC payment receipts on Base Mainnet.",
    start_url: "/",
    display: "standalone",
    background_color: "#080b12",
    theme_color: "#315efb",
    icons: [
      {
        src: "/base-receipt-icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
