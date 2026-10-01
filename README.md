# Base Receipt

A production-minded **Base Mainnet** USDC payment receipt app using an injected EVM wallet.

**Live app:** https://base-receipt-six.vercel.app/

Base Receipt creates a short-lived signed USDC payment request, opens MetaMask (or another injected wallet), independently verifies the resulting settlement on the server, and only then issues a receipt.

## Mainnet proof

The original browser payment flow and ERC-8021 attribution have been exercised with a real **0.01 USDC** Base Mainnet payment. This historical transaction does not prove a fresh end-to-end MCP payment and receipt flow.

- Direct transaction: https://basescan.org/tx/0xa7c0d15e190b7ab099c03013b14f07c6a58a7c15c8c1e7a8132bb7512c9e881d
- Result: successful Base Mainnet USDC transfer
- ERC-8021 result: top-level transaction calldata ends with Builder Code `bc_87fjmj1l`
- Application result: `Verified on Base. Receipt issued.`
- Durable receipt claim: persisted in PostgreSQL

## Why this exists

A wallet popup returning success is not enough evidence to fulfill an order. The backend should independently verify what actually settled onchain.

Base Receipt checks:

- payment status is `completed`
- settled USDC amount matches the signed request
- settled recipient matches the signed request
- the payment transaction has not already been claimed by a different order

## Flow

1. The browser submits an amount and recipient to `/api/orders`.
2. The server validates them and returns a 15-minute HMAC-signed payment request.
3. The browser sends a directly attributed USDC call through MetaMask on **Base Mainnet**.
4. The browser sends only the transaction hash and signed request to `/api/verify`.
5. The server reads the Base transaction and receipt, then checks successful direct-USDC settlement, sender, amount, recipient and the Base Receipt attribution suffix.
6. The payment ID is atomically claimed and persisted.
7. A verified receipt is returned with a BaseScan transaction link.

## Agent interface

The same order and verification handlers are exposed through stateless MCP Streamable HTTP at `/mcp`. The mobile-friendly `/agents` page explains the integration; `/api/agent` publishes machine-readable capabilities.

| MCP tool | Input | Result |
| --- | --- | --- |
| `prepare_base_payment` | Decimal USDC `amount`, EVM `recipient` | Signed 15-minute order, `orderToken`, and unsigned transaction data containing the Base Receipt Builder Code |
| `issue_base_receipt` | Transaction hash as `paymentId`, original `orderToken` | The receipt returned by the existing settlement verifier and durable claim store, or a tool error |

The service never signs or broadcasts a blockchain transaction and never receives wallet keys. An agent's caller-controlled wallet must review the amount, recipient, chain ID (8453), USDC contract and calldata before submitting a direct transfer. Both tools are marked non-read-only: preparation creates a fresh signed order; receipt issuance persists a claim. The returned order token must be kept for verification within its validity window. Repeating issuance with the same valid order preserves the existing claim; another order cannot reuse that payment.

Example MCP tool arguments:

```json
{"amount":"0.01","recipient":"0xYourRecipientAddress"}
```

```json
{"paymentId":"0xYourTransactionHash","orderToken":"token-returned-by-prepare_base_payment"}
```

Replace the placeholders with actual values. Preserve the returned attributed calldata. The current verifier supports direct EOA-to-USDC calls, including EIP-7702 delegated EOAs that originate the same direct transaction. Contract-wallet and batched calls remain unsupported. Preparing an order is not evidence of payment, and a receipt does not prove delivery of goods or services.

No Base Receipt API key is required. The endpoint accepts POST, returns 405 for GET/DELETE, bounds request bodies to 64 KiB, and rejects foreign browser Origin headers. The server creates no long-lived MCP session. This release adds no transaction submission, paid canary or synthetic activity.

The MCP transport uses the [official TypeScript SDK](https://ts.sdk.modelcontextprotocol.io/server). Tests exercise SDK discovery, exact unsigned transfer data, attribution, validation, and propagation of receipt errors. Existing browser payment handlers are reused in-process without making internal HTTP calls.

Maintainers can check a running deployment with `node scripts/check-agent.mjs <application-origin>`. This performs discovery, prepares one unsigned 0.01 USDC request, validates its calldata, and confirms invalid signatures are rejected. It never submits a payment or stores a receipt, and does not print the order token.

### Wallet-approved live MCP check

`/agents/check` is a Turkish mobile-friendly MCP client for one explicit **0.01 USDC self-transfer** on Base Mainnet. Connect an existing MetaMask account, review the same sender/recipient address, then approve the transfer and gas fee in the wallet. The USDC stays in the same account; ETH gas is spent. The page uses the official MCP SDK for both `prepare_base_payment` and `issue_base_receipt`, retaining the exact signed order token throughout. It validates the returned chain, token contract, amount, recipient and full attributed calldata before requesting a direct transaction. It also checks account type, balances and gas simulation before submission.

The original order is saved in local browser storage before wallet approval, and the transaction hash before confirmation polling. Reloading resumes receipt verification without another payment; an interrupted wallet response can be recovered by entering its transaction hash. Explicit wallet rejection clears the unpaid attempt. Verification remains limited by the existing 15-minute order lifetime. There is no automatic repeat payment. Receipt results can be copied without exporting the order token or wallet credentials. Keep the page open until the receipt is issued.

The page is a functionality check through the agent interface, not an autonomous agent or proof of external adoption. A successful fresh mainnet MCP receipt is **not yet recorded** here; do not mark that test complete until it has actually succeeded.

The wallet preflight accepts empty account code or the exact 23-byte EIP-7702 delegation designation (`0xef0100` followed by a 20-byte address). Other account code is rejected. This check does not change the wallet's delegation or request a batched transaction; it uses the existing account to originate a direct attributed USDC call.

## Base Agent Meter on the same host

The separate Meter product uses `/meter` for its unpaid endpoint checker, `/meter/mcp` for its two read-only tools, and `/api/meter` for capabilities and the exact upstream source revision.

Meter's page publishes its own Base application ID instead of inheriting Receipt's identity. Its canonical URL, description and social metadata also identify Meter.

| Meter registration field | Value |
| --- | --- |
| Existing Base app ID | `6a81d256b92232d481b384bc` |
| Existing Builder Code | `bc_h2oqnbbh` |
| Current website | `https://base-receipt-six.vercel.app/meter` |
| Description | Read-only x402 API checks and Base USDC payment verification. |
| Source | `https://github.com/Mabolla/base-agent-meter` |

The existing Meter project and Builder Code were confirmed in Base Dashboard. No editable website field or required URL-update step has been established in the current panel. Page metadata does not establish Dashboard discovery visibility, current usage counters or new-domain verification; these remain unverified rather than confirmed registration faults. Preserve the existing app ID and Builder Code.

| Endpoint | Product | Tools |
| --- | --- | --- |
| `/mcp` | Base Receipt | `prepare_base_payment`, `issue_base_receipt` |
| `/meter/mcp` | Base Agent Meter | `check_x402_endpoint`, `verify_base_settlement` |

Meter's code comes from a commit-pinned Git dependency on [Mabolla/base-agent-meter](https://github.com/Mabolla/base-agent-meter). No checker code is copied into this repository. The Node route retains Meter's public-IP validation and pinned DNS connection, 128 KiB response cap and redirect rejection. Importing Meter does not start another HTTP server or enable its paid fixture.

Meter requests have a best-effort budget of 30 per minute and four concurrent requests **per runtime instance**, including MCP negotiation. These limits are shared by callers to that instance and are not a distributed quota. Receipt routes use their existing handlers independently. Settlement checks use `BASE_RPC_URL` when configured, otherwise the public Base RPC, whose availability and limits can affect verification.

The pinned verifier recognizes canonical ERC-8021 schema-0 code lists as well as x402 schema-2 application codes. It reports the decoded format, does not substitute service codes for an application code, and does not verify custom-registry identity from a matching string alone.

The UI and hosted MCP checker support unpaid GET checks. Meter's standalone CLI/API still support explicit POST checks and the separately gated paid canary; those workflows are not newly hosted here. The old Railway hostname and its paid fixture remain unavailable. Read-only Meter calls do not create onchain activity or receipt claims.

`node scripts/check-meter.mjs <application-origin>` checks the hosted source revision, SDK discovery and invalid-input rejection. Adding `--network` also checks a real ordinary endpoint is correctly rejected as non-x402 and re-verifies the historical Base Receipt transaction listed below. It never creates a payment or a receipt claim.

## Replay protection

For local development, claims are kept in process memory.

For production, set `DATABASE_URL` to a PostgreSQL database. Base Receipt creates a `base_receipt_payments` table with the payment transaction hash as its primary key, so concurrent or repeated claims cannot reuse one payment for multiple orders.

## Environment

Copy `.env.example` to `.env.local` and provide:

```env
PAYMENT_REQUEST_SECRET=use-a-long-random-secret
DATABASE_URL=postgres://user:password@host:5432/database?sslmode=require
```

Never commit either value.

## Development

```bash
npm ci
npm run dev
```

Quality gates:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Mainnet safety

The app intentionally uses `testnet: false`. Payments are real Base Mainnet USDC transfers. The UI defaults to a small amount and clearly labels the network before payment.

## Base App and Builder Codes

Base Receipt is registered and domain-verified in Base Dashboard with Builder Code `bc_87fjmj1l`. Browser payments and agent-prepared transactions append the ERC-8021 suffix directly to the USDC transfer calldata. The server requires this attribution alongside settlement evidence before issuing a receipt.

## Status

- Direct-wallet Mainnet flow: **verified in production**
- Signed short-lived payment requests: **implemented**
- Server-side settlement verification: **verified in production**
- Atomic PostgreSQL replay protection: **verified with durable persistence**
- Mainnet receipt + BaseScan explorer link: **verified in production**
- Live deployment: **online**
- Base Dashboard registration and domain verification: **completed**
- Builder Code: `bc_87fjmj1l`
- Base Weekly Leaderboards visibility: **enabled**
- External-web ERC-8021 attribution: **verified on Base Mainnet**
