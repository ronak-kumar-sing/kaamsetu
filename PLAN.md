> **Superseded (2026-10-30).** This was the original planning document. The living docs are
> `AGENTS.md`, `docs/STATUS.md`, `docs/ROADMAP.md`, `docs/DECISIONS.md` and `docs/BRIEF.md`.
> It is kept for history only.

# Implementation Plan — Freelancer Accountability App

Status: **approved 2026-10-30 — Phase 1 in progress.** The user asked for a production-ready build;
the §0 recommendations were adopted as written (see §0.1 for what production-ready means here).

---

## 0. Decisions needed before Phase 1

I read the YouPI-PG `README.md`, `openapi.yaml` and `docs/MERCHANT_INTEGRATION.md` (main branch, 2026-10-30). Several points contradict the brief. Each one below has a recommendation; please confirm or change it.

| #   | Brief says                                              | YouPI-PG docs say                                                                                                                                                                                                                                                                                                                                                                      | Recommendation                                                                                                                                                                                                                                                                                                                                                                    |
| --- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Webhook event `SUCCESS` means paid → milestone `funded` | UPI payments **never** send `SUCCESS` (that event is only for cash/counter payments). A UPI payment first sends `OBSERVED_SUCCESS` (`settlementState: NOT_RECONCILED`), which comes from a bank SMS or email and is "not settlement". `RECONCILED` is sent only after an admin **imports a bank statement CSV** and a line matches. The docs say: do not fulfil on `OBSERVED_SUCCESS`. | Move the milestone to `funded` **only** on `event=RECONCILED`, `method=UPI` and `settlementState=RECONCILED`. Record `OBSERVED_SUCCESS` on the payment as `observed`, so the UI can say "Payment detected, confirming with bank". Reject `MANUAL_REVIEW` and anything else as a funding trigger. **Cost:** funding waits for an admin to import the statement (could take hours). |
| D2  | Reject webhooks older than 5 minutes                    | Retries resend the **original** timestamp and continue for up to 1 hour, so a 5-minute window would reject every legitimate retry.                                                                                                                                                                                                                                                     | Freshness window of **75 minutes**, plus dedupe on `deliveryId` (unique constraint) as the real replay guard.                                                                                                                                                                                                                                                                     |
| D3  | Create order with `amountPaise`                         | `POST /api/v1/payments` takes `amount` as a **rupee string** (`"499.00"`). It returns `paymentId`, `checkoutUrl` and `amountPaise`. It supports an `Idempotency-Key` header. `409` can mean either `DUPLICATE_SESSION_DETECTED` (openapi) or `ORDER_AMOUNT_MISMATCH` (README).                                                                                                         | Store paise internally and convert to a rupee string only at the provider boundary, with a tested integer-only formatter. Send `Idempotency-Key = order_id`. Handle both 409 cases explicitly.                                                                                                                                                                                    |
| D4  | "Not an npm SDK"                                        | There is an `@youpi/merchant-sdk` package.                                                                                                                                                                                                                                                                                                                                             | Don't use it. Call REST directly from Deno with `fetch`. This keeps edge functions dependency-free and makes provider swaps easy.                                                                                                                                                                                                                                                 |
| D5  | (not mentioned)                                         | The hosted checkout **authenticates the payer itself** (sign in or sign up, WhatsApp OTP) before showing the QR code.                                                                                                                                                                                                                                                                  | Accept the extra step for now and open `checkoutUrl` in `expo-web-browser`. Flag it as UX debt.                                                                                                                                                                                                                                                                                   |
| D6  | Escrow for many clients and freelancers                 | The README says: don't use it to "collect payments on behalf of unrelated merchants, pool or route funds". It is experimental, not NPCI-approved, and its testing guideline is **≤20 transactions per day per receiving account**.                                                                                                                                                     | Build it as a **dev/test-only** provider behind `PaymentProvider`, with a startup banner in non-prod builds. Production needs a licensed escrow or nodal partner (Razorpay Route, a bank escrow account). This is a legal and business decision, not a code one; please confirm you're fine with that framing.                                                                    |
| D7  | `(client)` and `(freelancer)` tab groups                | One user can hold both roles.                                                                                                                                                                                                                                                                                                                                                          | Add an **active-mode switch** (Zustand plus a persisted preference) on Profile. The root layout redirects to the tab group for the active mode. Admin is a third group, `(admin)`.                                                                                                                                                                                                |
| D8  | Expo SDK "latest stable"                                | —                                                                                                                                                                                                                                                                                                                                                                                      | I'll check the current stable release at Phase 1 and pin it. Same for NativeWind (v4 unless v5 is stable with the chosen SDK).                                                                                                                                                                                                                                                    |

### 0.1 What "production-ready" means for this build

- **Code and data layer:** production grade from Phase 1. That means strict types, RLS on every table with tests, server-only money logic, an append-only ledger, idempotent webhooks, audit logs, CI gates, and secrets only on the server.
- **Payment rails:** YouPI-PG is, by its own README, experimental, not bank- or NPCI-approved, limited to about 20 transactions per day, and must not be used to pool or route funds for other parties. Escrow does exactly that. So the code is built **provider-agnostic** behind `PaymentProvider`/`PayoutProvider`. YouPI is implemented for dev and test. Going live with real money **requires a licensed provider** (for example Razorpay Route or Cashfree Easy Split with escrow, or a bank escrow or nodal account). Before Phase 4 I'll ask which one, and implement it next to YouPI, so that production is configuration rather than a rewrite.
- **Phone OTP:** production needs a real SMS provider (Twilio, or MSG91 via Supabase's send-SMS hook). Locally, test numbers are used.
- **Ops that are not code:** a hosted Supabase project, EAS build and submit, app store listings, a privacy policy, the DPDP Act consent text for KYC, and backups. These are listed in the README launch checklist (Phase 9).

### 0.2 Deviations from the brief made during the build

- Route groups `(client)`, `(freelancer)` and `(admin)` became real segments `/client`, `/freelancer` and `/admin`. Their tabs share names (home, wallet, profile), and typed routes reject group routes that resolve to the same URL.
- The working app name is **KaamSetu** (scheme `kaamsetu://`). It's a placeholder that's easy to rename.

---

## 1. Subagent model assignment

You asked to match the subagent model to each task. The rule I'll follow:

| Model                   | Used for                                                                                                                                                                                                           | Why                                                                              |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| **Opus** (strongest)    | Money and security: SQL schema, the state machine, the **ledger**, **RLS policies plus RLS tests**, the payment webhook, dispute settlement maths, the reliability score function, final reviews of each phase     | A bug here loses money or leaks data. Reasoning quality matters more than speed. |
| **Sonnet** (balanced)   | Feature work: Expo screens, TanStack Query hooks, forms with zod, CRUD edge functions, PDF generation, push notifications, Jest/RNTL tests                                                                         | Lots of code that follows patterns already set by the Opus work.                 |
| **Haiku** (fast, cheap) | Mechanical work: reading external docs and summarising them, seed data, scaffolding of the `components/ui` primitives, lint and type-error cleanup, README sections, generating types, looking up library versions | Low risk, high volume. Easy to verify.                                           |

How it runs in practice:

- I (main session) own the plan, the cross-cutting contracts (DB types, the zod schemas in `/shared`, the `PaymentProvider` interface) and the integration between parts.
- Subagents get **independent** slices that touch separate files, run in parallel and report back. I review every diff before the phase ends.
- Each phase ends with one **Opus review agent** that checks correctness and security against the brief's quality bar.

The table in §6 gives the model for each work item.

---

## 2. Repository structure

```
/app
  _layout.tsx                 # providers: QueryClient, theme, auth gate, mode redirect
  /(auth)                     welcome, phone, otp, roles, profile-setup, kyc
  /(client)/(tabs)            home, post-project, find-freelancers, wallet, profile
  /(freelancer)/(tabs)        home, browse, proposals, wallet, profile
  /(admin)/(tabs)             kyc-queue, disputes, payouts, flags
  /(shared)
    project/[id]/index.tsx    timeline + activity feed
    project/[id]/chat.tsx
    project/[id]/agreement.tsx
    milestone/[id]/index.tsx  fund / check-in / submit / approve / revise / dispute
    milestone/[id]/rate.tsx
    dispute/[id].tsx
    profile/[id].tsx
    handover/[id].tsx
    notifications.tsx, settings.tsx
/components/ui                Button, Card, Badge, StatusChip, Avatar, Input, Sheet,
                              EmptyState, ErrorState, Skeleton, Money, Banner, ListItem
/features/<feature>/          api.ts (queries/mutations), hooks.ts, components/, schemas.ts
  auth, profiles, projects, proposals, milestones, agreements, payments, wallet,
  checkins, ratings, disputes, handover, chat, notifications, admin, kyc
/lib
  supabase.ts, queryClient.ts, money.ts (paise ↔ ₹ Indian grouping), dates.ts
  payments/ (PaymentProvider type + app-side checkout launcher only)
/shared                       zod schemas + constants (AUTO_APPROVE_DAYS, MAX_MILESTONE_PCT…)
                              Deno-compatible TS, imported by both app and functions
/types                        database.ts (generated), domain.ts
/supabase
  config.toml
  /migrations                 0001_extensions … (see §3)
  /functions
    _shared/                  cors, auth, zod, logger (redacting), providers/
      providers/payment.ts    PaymentProvider + YoupiProvider + ManualPayoutProvider
      providers/kyc.ts        KycProvider + ManualKycProvider
      providers/signature.ts  SignatureProvider + ClickwrapSignatureProvider
    payments-create-order, payments-webhook, payments-simulate (dev only),
    agreement-sign, agreement-pdf, push-send, kyc-submit, admin-payout-mark-paid
  /tests                      pgTAP: rls_*.sql, state_machine.sql, ledger.sql, score.sql
  seed.sql
/payments-gateway/README.md   running YouPI-PG next to `supabase start`, tunnels
.github/workflows/ci.yml      lint, typecheck, jest, deno test, supabase db test
```

---

## 3. Database design

### Migrations (in order)

1. `extensions`: pgcrypto, pg_cron, pg_net, pgtap (test only)
2. `enums`: `app_role`, `milestone_status`, `project_status`, `payment_status`, `payment_purpose`, `kyc_status`, `dispute_status`, `ledger_account_type`, `payout_status`, `deposit_status`, …
3. `identity`: profiles, user_roles, skills, profile_skills, portfolio_items, kyc_verifications, push_tokens
4. `projects`: projects, project_members, proposals, milestones, milestone_status_history
5. `agreements`: agreements, agreement_versions, agreement_signatures, change_requests
6. `progress`: check_ins, check_in_attachments, submissions, messages
7. `money`: payments, webhook_deliveries, ledger_accounts, ledger_entries, payout_requests, refund_requests, deposits, plus the balance views
8. `trust`: ratings, reliability_scores, disputes, dispute_events, dispute_evidence, handovers
9. `ops`: notifications, audit_log
10. `helpers`: `is_admin()`, `is_project_member(pid)`, `has_role(r)`, all `security definer` with `search_path = ''`
11. `rls`: policies for every table (separate file so it's easy to review)
12. `state_machine`: transition table, guard function and trigger
13. `rpc`: all `rpc_*` functions
14. `storage`: buckets plus storage policies
15. `cron`: pg_cron schedules

### Key design points

- **Money:** every amount is `bigint` paise, with a `check (amount > 0)` where it applies.
- **Ledger (double-entry, append-only):**
  - `ledger_accounts(id, kind, owner_user_id?, project_id?, milestone_id?)`. Kinds: `platform_bank`, `escrow_milestone`, `freelancer_payable`, `client_refundable`, `deposit_held`, `platform_fee`, `payout_clearing`.
  - `ledger_entries(id, txn_id, account_id, amount_paise /* signed */, kind, ref_type, ref_id, created_at)`.
  - A deferred constraint trigger checks that `sum(amount) = 0` for each `txn_id`. `UPDATE` and `DELETE` are revoked and blocked by a trigger.
  - Views: `v_milestone_escrow_balance`, `v_user_wallet` (in escrow / released / pending payout / deposits held), `v_ledger_history`.
- **State machine:** a `milestone_transitions(from, to, actor_kind)` lookup table plus a `BEFORE UPDATE OF status` trigger. The trigger rejects illegal moves and requires a session flag `app.via_rpc = on`, which only the RPCs set, so a direct update fails even through the service role. Every change is written to `milestone_status_history`.
- **Milestone validation:** a deferred constraint trigger at project publish checks that each milestone is at most 30% of the total (`MAX_MILESTONE_PCT` stored in an `app_config` table so it can be changed) and that there are at least 2 milestones.
- **Payments:** `order_id` is unique and deterministic (`MS-<milestone_id>-<attempt>`, `DP-<deposit_id>-<attempt>`). Statuses: `created → observed → succeeded | failed | expired | cancelled | manual_review`. `webhook_deliveries.delivery_id` is unique. The raw payload is **not** stored, only a hash plus the selected fields.
- **KYC:** stores `doc_type`, `last4`, `id_hash` (HMAC with a server pepper) and `storage_path`. Never the full number.
- **Agreements:** `agreement_versions.content` is canonical JSON with `content_sha256`. A trigger blocks updates once both signatures exist. Signatures store user, timestamp, IP, device info and the hash they signed.
- **Ratings:** `unique(milestone_id, rater_id)`. The insert policy requires the milestone to be `approved` or `released` **and** a reconciled funding payment to exist.
- **Reliability:** `fn_reliability_score(user_id)` uses the brief's formula, with the abandonment penalty decaying linearly over 180 days. The result is cached in `reliability_scores`, refreshed by trigger on relevant events plus nightly cron. Users with fewer than 2 completed milestones show "New".

### Cron jobs

| Job                   | Schedule     | Action                                                                      |
| --------------------- | ------------ | --------------------------------------------------------------------------- |
| auto_approve          | every 15 min | `submitted` older than `AUTO_APPROVE_DAYS` → approve and release            |
| inactivity_escalation | hourly       | 1, 3, 5 and 7-day ladder (notify, warn, flag `unresponsive`, allow abandon) |
| dispute_deadlines     | hourly       | no response within 3 days → admin mediation                                 |
| reliability_recalc    | nightly      | refresh every score                                                         |
| payment_expiry        | every 15 min | old `created` payments → `expired`                                          |

Notifications are rows inserted by SQL. A database webhook (`pg_net`) calls `push-send`.

---

## 4. Payments architecture

```
App ──rpc/fn──▶ payments-create-order ──POST /api/v1/payments──▶ YouPI (:6100/:7000)
 │                     │ inserts payments(row, status=created)
 │◀──checkoutUrl───────┘
 └─ expo-web-browser opens checkoutUrl → UPI app deep links
YouPI ──signed webhook──▶ payments-webhook
        verify V2 (fallback V1) → freshness ≤75 min → dedupe deliveryId
        → match order + amountPaise → ONE transaction via rpc_apply_payment_event():
            OBSERVED_SUCCESS → payment.observed (no money moves)
            RECONCILED       → payment.succeeded + ledger + milestone funded / deposit held
            FAILED/EXPIRED/CANCELLED → payment status only
        → 2xx only after commit
```

- **Payouts and refunds:** `ManualPayoutProvider` creates `payout_requests` and `refund_requests`. An admin pays by UPI, enters the UTR, and `rpc_admin_mark_payout_paid` writes the ledger entries.
- **Simulate payment (dev only):** `payments-simulate` refuses to run unless `APP_ENV=development` and the caller is an admin or the payment's owner. It signs and POSTs `OBSERVED_SUCCESS` followed by `RECONCILED` to the webhook URL.
- **Secrets:** `YOUPI_API_URL`, `YOUPI_MERCHANT_ID`, `YOUPI_WEBHOOK_SECRET` and `KYC_HASH_PEPPER` live in Supabase secrets only. The app gets only `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` and `EXPO_PUBLIC_APP_ENV`. The app needs no YouPI key because the checkout URL comes from the server.

---

## 5. Testing strategy

- **pgTAP:** an RLS isolation suite (user B cannot read A's milestones, payments, check-ins, messages or disputes), every legal and illegal state transition, ledger balance invariants, rating eligibility and score maths.
- **Deno:** webhook verification (V1/V2, stale, tampered, duplicate, amount mismatch), rupee/paise conversion, provider request shape against a mocked fetch.
- **Jest + RNTL:** money formatting, the milestone builder validation, the status chip and the key screens' loading, empty and error states.
- **CI:** lint, `tsc --noEmit`, jest, `deno test` and `supabase db test` (Supabase CLI in GitHub Actions).

---

## 6. Phases (I stop after each one for your review)

| Phase                                        | Deliverables                                                                                                                                                                                                       | Subagents and models                                                                                                                                                               |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1. Foundation**                            | Expo + TS strict + Expo Router + NativeWind with dark mode; `components/ui` primitives; Supabase local config; phone OTP and email auth; profiles, roles and mode switch; generated types; ESLint, Prettier and CI | Haiku: version lookup, UI primitives scaffold, ESLint/Prettier/CI config · Sonnet: auth screens and onboarding · Opus: identity migrations plus RLS and tests · Opus: phase review |
| **2. Projects and milestones**               | Post project, milestone builder (30% and ≥2 rules), proposals, invites by link or phone, state machine in SQL, RPCs, RLS isolation tests                                                                           | Opus: state machine, RPCs, RLS tests · Sonnet: post-project, browse, proposals screens · Haiku: shared zod schemas from the SQL constraints                                        |
| **3. Agreements (F4)**                       | Generate canonical agreement JSON, view, Accept & Sign via `agreement-sign` (IP, device, SHA-256), versioning and change requests, PDF to Storage                                                                  | Opus: immutability triggers plus signing function · Sonnet: agreement screens and PDF function (`pdf-lib`)                                                                         |
| **4. Payments and escrow (F1, F6)**          | `PaymentProvider` and `YoupiProvider`, create-order, webhook, ledger plus views, deposits (with exemption badge), wallet, admin payout and refund queue, simulate tool, `payments-gateway/README.md`               | **Opus**: ledger, webhook, `rpc_apply_payment_event`, Deno tests · Sonnet: wallet, fund flow and payout screens · Haiku: gateway README                                            |
| **5. Check-ins and inactivity (F5)**         | Check-ins with attachments, realtime activity feed, chat, escalation cron, push pipeline                                                                                                                           | Opus: escalation SQL · Sonnet: check-in, chat and feed UI, `push-send`                                                                                                             |
| **6. Ratings, reliability and KYC (F2, F3)** | Ratings with eligibility, score function, suggested rate, KYC upload and admin review, badges, public profile stats                                                                                                | Opus: score function plus tests, rating RLS · Sonnet: rating, KYC and profile screens                                                                                              |
| **7. Disputes (F7)**                         | Raise, respond, propose split, auto-execute, admin mediation, audit trail, ledger effects, deposit forfeit                                                                                                         | **Opus**: settlement maths and ledger, deadlines · Sonnet: dispute screens                                                                                                         |
| **8. Handover (F8) and admin**               | Handover package, repost with prefill, escrow carry-over, access revocation, partial release, Takeover tag, admin KYC, disputes, payouts and flags screens                                                         | Opus: carry-over ledger and access revocation · Sonnet: handover and admin UI                                                                                                      |
| **9. Hardening**                             | Seed data (3 clients, 5 freelancers, every state), accessibility pass, README with a Mermaid diagram, test gaps                                                                                                    | Haiku: seed data and README · Sonnet: accessibility pass · Opus: final security and money audit                                                                                    |

---

## 7. Assumptions (tell me if any are wrong)

- Development runs on your Mac with Docker (needed for `supabase start`) and Node ≥22.13 for YouPI-PG.
- The app targets iOS and Android through Expo Go and dev builds. Web is not a goal.
- The platform fee on a forfeited deposit is a config value (default 10%), and the deposit cap defaults to ₹5,000. Both are placeholders until you confirm them.
- Supabase phone OTP needs an SMS provider (Twilio, MSG91, …). For local development I'll use Supabase's test OTP numbers in `config.toml`.
