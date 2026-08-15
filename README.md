# Base Receipt

A small, production-minded **Base Mainnet** payment receipt app built around Base Pay.

Base Receipt creates a short-lived signed USDC payment request, opens Base Pay, verifies the resulting transaction on the server, and only then issues a receipt.

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
3. The browser calls Base Pay on **Base Mainnet**.
4. The browser sends only the transaction hash and signed request to `/api/verify`.
5. The server calls `getPaymentStatus()` and checks the verified amount and recipient.
6. The payment ID is atomically claimed and a receipt is returned.
7. The receipt links to the BaseScan transaction.

## Replay protection

For local development, claims are kept in process memory.

For production, set `DATABASE_URL` to any PostgreSQL database. Base Receipt creates a `base_receipt_payments` table with the payment transaction hash as its primary key, so concurrent or repeated claims cannot reuse one payment for multiple orders.

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

Quality gates used in CI:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Mainnet safety

The app intentionally uses `testnet: false`. Payments are real Base Mainnet USDC transfers. The UI defaults to a small amount and clearly labels the network before payment.

## Base App and Builder Codes

Base Receipt is a standard web app. Once it has a live primary URL, it can be registered as a project on Base.dev. Base App traffic receives automatic Builder Code attribution after registration. External-web attribution will be added only through a supported ERC-8021 transaction path rather than faking attribution around Base Pay.

## Status

- Base Pay Mainnet flow: implemented
- Signed short-lived payment requests: implemented
- Server-side settlement verification: implemented
- Atomic Postgres replay protection: implemented
- Unit tests + lint + typecheck + production build CI: in progress
- Live deployment: pending
- Base.dev project registration / Builder Code: pending live URL
