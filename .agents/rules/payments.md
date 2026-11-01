---
trigger: model_decision
description: Read before any work on payments, escrow, ledger, deposits, payouts, refunds, YouPI-PG or the wallet (Phase 4+).
---

# Payments rules

Read `docs/DECISIONS.md` D1–D6 and `docs/ROADMAP.md` Phase 4 in full before writing any code.

- **YouPI-PG is dev and test only (D6).** Production needs a licensed provider. Ask the user which one before Phase 4 if `docs/DECISIONS.md` doesn't record it yet.
- Fetch YouPI's `openapi.yaml` and `docs/MERCHANT_INTEGRATION.md` fresh from https://github.com/youpi-pg/YouPI-PG. Do not guess endpoints. Known facts:
  - Order creation is `POST /api/v1/payments` with `{orderId, amount: "499.00", currency, returnUrl, metadata}`, plus the `X-Merchant-Id` and `Idempotency-Key` headers.
  - The response contains `checkoutUrl`.
  - Webhook headers: `X-Gateway-Signature`, `X-Gateway-Signature-V2`, `X-Gateway-Timestamp`, `X-Gateway-Delivery-Id`, `X-Gateway-Event`.
  - Fund **only** on `event=RECONCILED` with `method=UPI` and `settlementState=RECONCILED` (D1). `OBSERVED_SUCCESS` means "observed" only.
- The app never marks anything as paid. The client checkout callback is UI only. The status comes from the DB.
- The ledger is append-only double-entry. Each `txn_id` sums to 0, balances come from views, and UPDATE/DELETE are blocked.
- Payouts and refunds are manual (admin enters the UTR) behind `PayoutProvider` until a licensed provider is added.
