# Roadmap: Phases 3–9

How to use this file:

- Do **one phase at a time**, in order. Each phase ends with a **STOP**: run `/verify`, update `docs/STATUS.md`, commit, and wait for the user's review before starting the next one.
- 🛑 **ASK** marks a decision that belongs to the user. Do not guess. Ask, then record the answer in `docs/DECISIONS.md`.
- Every phase follows the same order:
  1. Write the API contract in `docs/api/<area>.md`.
  2. Write the migrations and pgTAP tests.
  3. Regenerate the types.
  4. Build the hooks and screens.
  5. Write the Jest tests.
  6. Run `/verify`.
  7. Do a review pass (`/review`).
  8. Fix what the review finds.
- See the `start-phase` workflow.

**Phase 1 (foundation) and Phase 2 (projects and milestones) are done.** See `docs/STATUS.md`.

---

## Phase 3: Agreements (F4)

**Goal:** A versioned, hash-signed agreement exists before any money moves.

### Before coding

🛑 **ASK:** Which IP-transfer and governing-law wording should the agreement template use? Offer a default: "IP transfers to the client on final payment; governed by the laws of India; courts at the client's city". 🛑 **ASK:** Should the PDF be English only, or English plus Hindi?

### Database: `docs/api/agreements.md` first

- **Tables:**
  - `agreements`: one per project. Columns: `project_id`, `current_version_id`, `status` (`draft` → `pending_signatures` → `active` → `superseded`).
  - `agreement_versions`: `version`, `content jsonb` (canonical), `content_sha256 text`, `pdf_path`, `created_at`.
  - `agreement_signatures`: `version_id`, `user_id`, `signed_at`, `ip inet`, `device jsonb`, `signed_hash`, plus a unique `(version_id, user_id)`.
  - `change_requests`: `proposed_by`, `kind` (`add_milestone`, `edit_terms`), `payload jsonb`, `status`, and the new version once accepted.
- **Canonical content:** JSON with sorted keys and no whitespace. Hash it with SHA-256 in **Postgres** (`encode(extensions.digest(content::text,'sha256'),'hex')`, using pgcrypto) and **verify the same hash in the edge function**. Content includes:
  - the parties (name and verified phone, masked)
  - scope
  - each milestone: position, title, deliverable, acceptance criteria, amount and due date
  - the payment schedule
  - the revision limit
  - the auto-approve days
  - the inactivity rule (F5 ladder)
  - the dispute rule (F7)
  - IP transfer
  - the governing law
  - the platform terms version
- **Generation:** `rpc_generate_agreement(project_id)` runs on award (call it from `rpc_accept_proposal`, or right after it).
- **Immutability:** a trigger blocks UPDATE and DELETE on `agreement_versions` and `agreement_signatures`. Milestone amounts, dates and positions are already frozen once the project leaves `open`; keep that rule.
- **Funding gate:** funding (Phase 4) requires the agreement status to be `active`, meaning both parties have signed the current version. Add this check to the funding RPC later; write a TODO test now.
- **Change requests:**
  - `rpc_propose_change`, `rpc_accept_change` and `rpc_reject_change`.
  - Accepting a change creates a new version (status `pending_signatures`). The old version becomes `superseded` only when both parties have signed the new one.
  - A scope change can only **add** milestones. It must not edit funded ones.

### Edge functions

- **`agreement-sign`:**
  - Validate the input with zod: `{ version_id, content_sha256, device }`.
  - Read the client IP from the `x-forwarded-for` header (first hop).
  - Recompute the hash from the stored content, and require it to equal both the client's value and the stored value.
  - Insert the signature using the service role inside an RPC (`rpc_record_signature`, executable by `service_role` only).
- **`agreement-pdf`:**
  - Render the PDF with `pdf-lib`, through an npm specifier in Deno.
  - Store it in the `agreements` bucket at `<project_id>/<version>.pdf`.
  - Members download it through a signed URL from an RPC or edge function.
- Put `SignatureProvider` in `supabase/functions/_shared/providers/signature.ts`, with a `ClickwrapSignatureProvider` implementation.

### App

- `app/(shared)/project/[id]/agreement.tsx`: readable sections, the hash shown in short form, each party's signature status, an "Accept & Sign" bottom sheet with an explicit consent checkbox, and a Download PDF button.
- A banner on the project detail screen: "Sign the agreement to unlock funding".

### Acceptance criteria

- pgTAP: no one can edit a signed version, non-members can't read agreements, a signature with the wrong hash is rejected, and a change request creates v2 while v1 stays intact.
- Deno tests: the canonical JSON is stable regardless of key order, the hash matches Postgres for the same content, and the zod schema rejects bad input.
- Both parties sign in the simulator, the PDF downloads, and the status becomes `active`.

**STOP for review.**

---

## Phase 4: Payments and escrow (F1, F6)

**Goal:** Real money flows (in dev, through YouPI), tracked in an append-only double-entry ledger.

### Before coding

🛑 **ASK (required by D6):** Which licensed provider will production use? Options: Razorpay Route, Cashfree Easy Split, or a bank escrow account. Implement that provider next to `YoupiProvider`. 🛑 **ASK:** What is the platform fee: a percentage on release, a flat fee, or none? It also determines the deposit-forfeit fee (default 10%). 🛑 **ASK:** Who bears payment-gateway fees?

### Read first

`docs/DECISIONS.md` D1–D6, and the YouPI-PG `openapi.yaml` and `docs/MERCHANT_INTEGRATION.md`, fetched fresh. **Do not guess endpoints.**

### Database: `docs/api/payments.md`

- **Tables:**
  - `payments`: columns `id`, `order_id` (unique, deterministic: `MS-<milestone_id>-<attempt>` or `DP-<deposit_id>-<attempt>`), `purpose` (`milestone_funding` or `deposit`), `ref_id`, `amount_paise`, `provider`, `provider_payment_id`, `status` (`created` → `observed` → `succeeded`, or `failed`, `expired`, `cancelled`, `manual_review`), `checkout_url`, `utr`, and timestamps.
  - `webhook_deliveries`: `delivery_id` (unique), `event`, `payload_sha256`, `received_at`, `processed_at`, `outcome`. **Never store the full payload** (quality bar).
  - `ledger_accounts`: `kind` is one of `platform_bank`, `escrow_milestone`, `freelancer_payable`, `client_refundable`, `deposit_held`, `platform_fee`, `payout_clearing`; plus owner and ref.
  - `ledger_entries`: `txn_id`, `account_id`, `amount_paise` (signed), `kind`, `ref_type`, `ref_id`.
    - A deferred constraint trigger enforces `sum(amount) = 0` for each `txn_id`.
    - UPDATE and DELETE are revoked and blocked by a trigger.
  - `deposits`, `payout_requests` (`requested` → `paid` with a UTR, or `cancelled`), and `refund_requests`.
- **Views:** `v_milestone_escrow_balance`, `v_user_wallet` (in escrow, released, pending payouts, deposits held), and `v_ledger_history`. RLS is enforced through `security_invoker` views.
- **`rpc_apply_payment_event(...)`** is executable by `service_role` only. In one transaction it:
  - checks the amount;
  - is idempotent per `delivery_id`;
  - on `RECONCILED`: posts ledger entries (debit `platform_bank`, credit `escrow_milestone`), calls `_transition_milestone(draft → funded)`, and moves the project to `in_progress` on its first funding;
  - on `OBSERVED_SUCCESS`: only marks the payment `observed`.
- **Release:** `rpc_approve_milestone` (or a hook after `approved`) posts escrow → `freelancer_payable`, moves the milestone to `released`, and creates a `payout_request`. The auto-approve `pg_cron` job runs every 15 minutes: `submitted` older than `auto_approve_days` → approve → release.
- **Deposits (F6):** when `deposit_required` is set and `total_paise > deposit_threshold_paise`, the deposit is `min(pct × total, cap)`. The freelancer funds it after award and before the first milestone starts. The exemption applies to a reliability score of 85 or more with at least 5 completed projects; until Phase 6 exists, treat everyone as not exempt and leave a TODO.

### Edge functions (Deno, zod at every boundary)

- `payments-create-order`: the caller is the project client and the agreement is `active`. Create a `payments` row, then call `provider.createOrder`. Send `Idempotency-Key = order_id` and the amount as a rupee string.
- **`payments-webhook`:**
  - Use the raw body.
  - Verify V2 (`HMAC(secret, "<ts>.<raw>")`) with a timing-safe compare, falling back to V1.
  - Enforce the 75-minute freshness window (D2).
  - Insert into `webhook_deliveries` with `ON CONFLICT DO NOTHING`. If the delivery is a duplicate, return 200.
  - Call `rpc_apply_payment_event` and return 2xx only after it commits.
- `payments-simulate` (dev only): refuse unless `APP_ENV=development`. Sign and post `OBSERVED_SUCCESS`, then `RECONCILED`.
- `admin-payout-mark-paid` and `admin-refund-mark-paid`: admin only. Validate the UTR (12 digits) and post the ledger entries.
- Put `PaymentProvider` and `PayoutProvider` in `supabase/functions/_shared/providers/payment.ts`, with `YoupiProvider`, `ManualPayoutProvider`, and the licensed provider chosen above.
- **Deno tests:** V1 and V2 verification; tampered body; stale timestamp; duplicate delivery; amount mismatch; both kinds of 409; `paiseToRupeeString`.

### App

- **Fund flow on milestone detail:** "Fund ₹X" → `expo-web-browser.openBrowserAsync(checkoutUrl)` → on return, poll the payment status → states "Waiting for payment" → "Payment detected, confirming with bank" (`observed`) → `funded`.
- The client-side handler is UI only. In dev, a "Simulate payment" button calls `payments-simulate`.
- **Wallet tab:** real balances from `v_user_wallet` with `MoneyCountUp`, and ledger history as an `AnimatedList`.
- **Admin Payouts tab:** list `requested` payouts showing the freelancer's UPI ID, then "Mark paid" with UTR entry.
- **Freelancer profile:** UPI ID for payouts, validated against `^[\w.\-]{2,256}@[a-zA-Z]{2,64}$` and stored in a new column with private access.
- Write `payments-gateway/README.md`: running YouPI-PG locally (Node ≥22.13), its ports, `cloudflared tunnel --url http://localhost:54321` for webhooks, the env vars, and the ~20 transactions/day limit.

### Acceptance criteria

- pgTAP:
  - the ledger always balances, and UPDATE and DELETE on ledger entries are blocked;
  - a user can't read another user's payments or ledger;
  - the funding path is idempotent (replaying a delivery has no effect);
  - an amount mismatch is rejected;
  - auto-approve works (use `set local` to fake time, or call the cron function directly).
- E2E in the simulator: fund → simulate → funded → start → submit → approve → released → payout request → admin marks it paid → wallets are correct.

**STOP for review.**

---

## Phase 5: Check-ins and inactivity (F5)

### Database

- **Tables:** `check_ins` (`milestone_id`, `author_id`, `body`, `links`, `created_at`) and `check_in_attachments` (`project-files` paths).
- **Projections:** `projects.checkin_cadence_days` already exists. Add `milestones.last_checkin_at` and `freelancer_flags` (`unresponsive` with `since`).
- **`rpc_post_check_in`:** the assigned freelancer, on an `in_progress` milestone only.
- **`pg_cron` hourly `escalate_inactivity()`:** overdue = `now - coalesce(last_checkin_at, started_at) - cadence`.
  - **1 day:** push the freelancer.
  - **3 days:** notify the client and set `projects.warning`.
  - **5 days:** flag the freelancer `unresponsive` and give the client options (Wait, Reassign (F8), Request refund).
  - **7 days:** the client may call `rpc_mark_abandoned` (`funded` or `in_progress` → `abandoned`).
  - Make it idempotent: record which escalation level has already been sent.
- **`notifications`:** a table plus a `pg_net` trigger → the `push-send` edge function, which uses the Expo Push API.
  - Clean up `DeviceNotRegistered` tokens.
  - Call `rpc_unregister_push_token` on sign-out (D18).
- **`messages`** (project chat): members only, insert through an RPC, never deleted (dispute evidence).

### App

- A check-in composer (text, links, images through `expo-image-picker` uploading to `project-files/<project_id>/<milestone_id>/...`).
- A project activity feed using **Supabase Realtime** postgres_changes on `check_ins`, `milestone_status_history` and `messages`, filtered by project. RLS applies to Realtime too; verify this.
- A chat screen, a warning banner, and the client's escalation action sheet.
- Push registration through `expo-notifications`, with the permission prompt shown at a sensible moment (not at launch).

### Acceptance criteria

pgTAP for the escalation ladder (fake the timestamps), idempotent escalation, and the abandon rules. Realtime is verified with two simulators or a script.

**STOP for review.**

---

## Phase 6: Ratings, reliability and KYC (F2, F3)

### Before coding

🛑 **ASK:** KYC provider for production (manual review only, DigiLocker, or a PAN-verification API)? 🛑 **ASK:** the KYC retention period and the consent text (DPDP Act 2023).

### Database

- **`ratings`:** a unique `(milestone_id, rater_id)`. The insert RPC requires the milestone to be `approved` or `released` **and** a succeeded funding payment to exist.
- **`reliability_scores`:**
  - Computed by `fn_reliability_score(user_id)` using the exact formula in `BRIEF.md` F3, with the 180-day linear decay.
  - Recomputed by trigger on relevant events, plus a nightly cron.
  - Users with fewer than 2 completed milestones show "New".
- **Suggested rate:** the category median of `hourly_rate_paise` × (1 ± 0.2 × (score − 50) / 50), clamped to ±20%.
- **KYC:**
  - The `kyc-submit` edge function validates the document type and the ID with zod. Format checks: PAN `^[A-Z]{5}[0-9]{4}[A-Z]$`; Aadhaar is 12 digits with a Verhoeff checksum.
  - Store `last4` and `id_hash = HMAC(KYC_HASH_PEPPER, id)` only.
  - Upload to `kyc/<uid>/...`.
  - Never log the ID.
- The admin KYC queue uses `rpc_admin_review_kyc`, which already exists.
- Implement `KycProvider` with `ManualKycProvider`.

### App

Rate Milestone screen (prompted after approval), public profile stats (completed, on-time %, abandoned, average rating, score with the "New" state), suggested rate shown in Edit Profile, the KYC flow (pick document → capture → submit → pending badge), and the admin KYC queue with a signed-URL image preview.

### Acceptance criteria

pgTAP: no rating without funded and approved work, only one rating per side, and the score formula checked against hand-computed fixtures. Deno: PAN and Aadhaar validation, and no plaintext ID anywhere.

**STOP for review.**

---

## Phase 7: Disputes (F7)

### Before coding

🛑 **ASK:** How long does admin mediation have (SLA)? Can the parties appeal?

### Database

- **Tables:** `disputes`, `dispute_events` (append-only audit) and `dispute_evidence` (`project-files` paths).
- **Raising:** `rpc_raise_dispute`, allowed on `funded`, `in_progress` and `submitted`. Moves the milestone to `disputed` and **freezes the funds** (no release is possible).
- **Respond and settle:** `rpc_respond_dispute` (3-day deadline, enforced by cron), `rpc_propose_settlement(pct_to_freelancer)` and `rpc_accept_settlement`. When both sides accept → execute.
- **Mediation:** `rpc_admin_decide_dispute(release_full | refund_full | split pct)`.
  - Writes the ledger entries in one transaction.
  - Moves the milestone to `released`, `refunded` or `partially_released`.
  - Updates reliability.
  - Forfeits the deposit (F6) when the ruling goes against the freelancer.
- **Cron:** the response deadline escalates the dispute to mediation.

### App

- Dispute Detail: a timeline, evidence upload, the settlement proposal UI (slider showing the rupee split), and accept/decline.
- Admin Dispute Queue with a full context view: agreement, check-ins, submissions, chat, evidence.

### Acceptance criteria

pgTAP: funds are frozen during a dispute, the ledger balances for every outcome, only members and admins can read a dispute, and the deadlines escalate.

**STOP for review.**

---

## Phase 8: Handover (F8) and admin screens

### Database

- **`handovers`:** a snapshot of the agreement, the remaining milestones, check-ins, files and client notes.
- **`rpc_reassign_project`:** used on `abandoned` milestones, or when the client chooses Reassign.
  - Creates a new `open` project with `is_takeover = true` and `source_project_id` set, prefilled with the remaining milestones.
  - **Moves the unreleased escrow** through ledger entries.
  - Removes the original freelancer from `project_members` (`active = false`, which revokes access).
  - Old milestones become `reassigned`.
- **Optional partial release** of submitted work, recorded in the ledger.
- **Admin:** a user-flags screen and `rpc_admin_flag_user`, which already exists.

### App

The handover review screen, the repost flow prefilled from the handover, a "Takeover" tag and filter in Browse (the filter flag already exists), and the admin Flags and Payouts screens polished.

### Acceptance criteria

pgTAP: the original freelancer loses access immediately, escrow is conserved across the move (total in = total out), and only the client can reassign.

**STOP for review.**

---

## Phase 9: Hardening

- **Seed data** (`supabase/seed.sql`):
  - 3 clients, 5 freelancers and 1 admin, using test phones `+91 90000 0000x`.
  - Projects in **every** state, with balanced ledger rows for each.
- **Accessibility pass:**
  - Screen-reader labels on everything.
  - Dynamic type up to XXL.
  - Contrast checked in both themes.
  - Reduced motion respected.
- **Error and offline:** every query has an error state, mutations are disabled offline, and there is a global offline banner.
- **Performance:** Hermes profiling, list virtualisation, no re-render storms on realtime feeds.
- **Security:**
  - A final review of RLS, the `security definer` functions and storage.
  - `npm audit`.
  - Secrets scan.
  - Confirm `config:check-hosted` passes.
- **Release setup:**
  - EAS profiles (`eas.json`: development, preview, production).
  - App icons and splash screen.
  - Privacy policy and terms screens.
  - DPDP consent.
- **README:** the full launch checklist (hosted Supabase project, secrets, email/SMS providers, the payment provider, store listings).
- Optionally, a web landing page using **real** React Bits (D12).

**STOP for the final review.**
