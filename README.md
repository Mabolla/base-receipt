# Base Receipt

A small, production-minded Base payment receipt app built around **Base Pay**.

The goal is simple: create a one-time USDC payment request, complete it on Base, and produce a receipt that is verified by the application instead of trusting a client-side success screen.

## Why this exists

Payment UIs often stop at “the wallet returned success.” Base Receipt treats that as only the beginning. A payment is considered complete only after the app verifies the payment status and matches the expected payment details.

## Planned flow

1. Create a payment request with an order ID, amount, and recipient.
2. Pay USDC through Base Pay.
3. Verify the payment status through a server route.
4. Match the verified payment against the expected order data.
5. Return a durable receipt with transaction/payment identifiers and an explorer link.
6. Reject mismatches and replay attempts.

## Security model

- Never trust frontend-only payment success.
- Verification happens server-side.
- Expected amount and recipient are checked before issuing a receipt.
- Order/payment ownership is bound to the verification request.
- A payment identifier cannot be reused for a second receipt.
- No private keys or credentials belong in the repository.

## Base integration

The implementation is intended for Base Pay and will keep Base Builder attribution isolated from application/business logic. Builder attribution must not require contract changes.

## Status

Initial implementation in progress.
