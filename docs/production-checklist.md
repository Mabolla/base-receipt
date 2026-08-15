# Production Completion Checklist

## Completed

- [x] Base Mainnet payment flow implemented with Base Pay
- [x] Short-lived HMAC-signed payment requests
- [x] Server-side payment status verification
- [x] Settled amount and recipient verification
- [x] Atomic payment replay protection
- [x] Durable PostgreSQL persistence in production
- [x] CI: lint, typecheck, tests, production build
- [x] Vercel production deployment
- [x] Real 0.01 USDC Base Mainnet E2E test
- [x] BaseScan-linked verified receipt
- [x] Production app icon and web metadata

## Remaining

- [ ] Complete Base Dashboard app registration
- [ ] Add Dashboard screenshots and final app metadata
- [ ] Retrieve Builder Code
- [ ] Verify Base App attribution after registration
- [ ] Add and verify external-web ERC-8021 attribution only if the transaction path supports `dataSuffix`

Base Dashboard registration is intentionally tracked as a required completion item rather than being silently omitted after the registration UI failed to advance on 2026-08-15.
