# Base Dashboard Registration

Base Receipt is ready to register as a standard web app in the Base Dashboard once the registration flow is available.

## App metadata

- **Name:** Base Receipt
- **Primary URL:** https://base-receipt-jf11ddnlm-mabolla1.vercel.app/
- **Icon:** https://base-receipt-jf11ddnlm-mabolla1.vercel.app/base-receipt-icon.svg
- **Tagline:** Verified USDC receipts on Base Mainnet.
- **Description:** Base Receipt creates short-lived signed USDC payment requests, opens Base Pay, verifies settlement server-side, prevents payment replay with durable PostgreSQL claims, and returns a BaseScan-linked receipt.
- **Category:** Payments
- **Network:** Base Mainnet

## Production proof

- Live Base Mainnet payment tested with 0.01 USDC.
- BaseScan transaction: https://basescan.org/tx/0x033a3e2f145db2f16601f59264286d959701e87f96962d3af21a2898484ec5ec
- Server verification returned `completed` and issued a receipt.
- Receipt claim persisted in PostgreSQL.

## Builder Code follow-up

After the Dashboard registration succeeds:

1. Complete app metadata, including screenshots and category.
2. Retrieve the Builder Code from the Dashboard project settings.
3. Confirm Base App automatic attribution for traffic launched inside Base App.
4. For external-web transactions, add ERC-8021 only through a transaction path that supports `dataSuffix`; do not pretend that Base Pay transactions are attributed when the payment API does not expose that integration path.
5. Verify attribution in Base Dashboard or with the official Builder Code validation tooling before claiming it is active.

## Current blocker

On 2026-08-15, `dashboard.base.org/register` accepted the app name `Base Receipt`, but the active **Continue** button did not advance the registration flow in the browser. Registration remains an explicit completion item and must not be skipped.
