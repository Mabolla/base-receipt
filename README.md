# Base Receipt

A production-minded **Base Mainnet** USDC payment receipt app using an injected EVM wallet.

**Live app:** https://base-receipt-six.vercel.app/

Base Receipt creates a short-lived signed USDC payment request, opens MetaMask (or another injected wallet), independently verifies the resulting settlement on the server, and only then issues a receipt.

## Mainnet proof

The full production flow and ERC-8021 attribution have been exercised with a real **0.01 USDC** Base Mainnet payment.

- AA transaction: https://basescan.org/tx/0xda7f75bbc0467b52ada78c871d257a18dfcfef09ee9bfd47ed43202652ea408a
- Bundle transaction: https://basescan.org/tx/0xe95a4408c1972e60655d98157ee28b8544c2a5ecdb379d6015c910ea97b086ea
- Result: successful Base Mainnet USDC transfer
- ERC-8021 result: bundle calldata contains Builder Code `bc_87fjmj1l`
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
5. The server calls `getPaymentStatus()` and checks the verified amount and recipient.
6. The payment ID is atomically claimed and persisted.
7. A verified receipt is returned with a BaseScan transaction link.

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
npm install
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

Base Receipt is registered and domain-verified in Base Dashboard with Builder Code `bc_87fjmj1l`. The external-web payment call appends the ERC-8021 suffix directly to the USDC transfer calldata, while receipt verification remains independent of attribution.

## Status

- Direct-wallet Mainnet flow: **implemented and locally verified**
- Signed short-lived payment requests: **implemented**
- Server-side settlement verification: **verified in production**
- Atomic PostgreSQL replay protection: **verified with durable persistence**
- Mainnet receipt + BaseScan explorer link: **verified in production**
- Live deployment: **online**
- Base Dashboard registration and domain verification: **completed**
- Builder Code: `bc_87fjmj1l`
- Base Weekly Leaderboards visibility: **enabled**
- External-web ERC-8021 attribution: **verified on Base Mainnet**
