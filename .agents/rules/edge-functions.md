---
trigger: glob
globs: supabase/functions/**
description: Supabase Edge Function (Deno) conventions, money idempotency and provider interfaces.
---

# Edge function rules

- Use Deno 2 with npm/jsr specifiers. Each function lives in `supabase/functions/<name>/index.ts` and shares code from `supabase/functions/_shared/` (cors, auth, zod, redacting logger, providers).
- Validate **every** input with zod at the boundary. Reject unknown fields.
- Authenticate the caller from the `Authorization` JWT with a user-scoped client. Use the service-role client only inside the function, and only to call `service_role`-only RPCs.
- Anything that touches money must be **idempotent**: deterministic `order_id`s, a unique `delivery_id`, `ON CONFLICT DO NOTHING`. Return 2xx only after the DB transaction commits.
- Webhooks:
  - Read the **raw body** before parsing.
  - Use an HMAC-SHA256 timing-safe compare. Verify V2 (`"<ts>.<raw>"`) first, then fall back to V1.
  - Apply a 75-minute freshness window (D2).
- Never log secrets, KYC numbers, phone numbers or full payloads. Log ids and hashes only.
- Secrets come from `Deno.env` (set with `supabase secrets set`; locally in `supabase/.env`). Dev-only functions must refuse to run unless `APP_ENV === 'development'`.
- Provider interfaces live in `_shared/providers/`: `PaymentProvider`/`PayoutProvider` (payment.ts), `KycProvider` (kyc.ts) and `SignatureProvider` (signature.ts). Code against the interface. The concrete provider is chosen by env.
- Tests: `supabase/functions/<name>/*_test.ts` with `deno test`. Mock `fetch`. Cover signature, staleness, duplicates and amount-mismatch paths.
- Check: `npx deno fmt --check supabase/functions && npx deno lint supabase/functions && npm run test:functions`.
