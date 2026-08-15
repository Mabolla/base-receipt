# Base Dashboard Registration Payload

Use these values when the Base Dashboard registration flow becomes available again.

## Required metadata

**App name**

Base Receipt

**Primary URL**

https://base-receipt-jf11ddnlm-mabolla1.vercel.app/

**Icon URL**

https://base-receipt-jf11ddnlm-mabolla1.vercel.app/base-receipt-icon.svg

**Tagline**

Verified USDC receipts on Base Mainnet.

**Description**

Base Receipt creates short-lived signed USDC payment requests, opens Base Pay, independently verifies settlement amount and recipient on the server, prevents replay through durable PostgreSQL payment claims, and returns a BaseScan-linked verified receipt.

**Category**

Payments

## Evidence

Production payment proof:
https://basescan.org/tx/0x033a3e2f145db2f16601f59264286d959701e87f96962d3af21a2898484ec5ec

The application issued a `completed` receipt after server-side verification and persisted the payment claim in PostgreSQL.

## Screenshots to submit

1. Main payment form showing `BASE RECEIPT · MAINNET` and the real-payment warning.
2. Verified receipt screen showing status, amount, sender, recipient, Payment ID and Order ID.

Do not submit secrets, database connection strings, Vercel environment variables, or private wallet material in screenshots.
