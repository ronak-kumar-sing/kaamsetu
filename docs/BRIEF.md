# Product brief (original spec)

> This is the original brief the project was started from. It is the **spec**.
> Where later decisions changed it, the change is recorded in `docs/DECISIONS.md`, and that file wins.

---

## 1. Product context

**Problem:** Businesses that hire freelancers informally (WhatsApp, referrals, social media) lose work and money when freelancers disappear mid-project after receiving a partial payment. There is no shared record of what was agreed, delivered or paid, and walking away costs the freelancer nothing. Freelancers have the opposite problem: clients who keep adding work, delay approval or don't pay.

**Goal:** A two-sided Expo app where **finishing the work is always more rewarding than ghosting**, for both sides. It does this through:

- milestone-based payments held in escrow
- verified identities
- reputation built from completed work
- signed agreements
- progress check-ins
- dispute resolution
- freelancer commitment deposits
- handover to a replacement freelancer

**Roles:** `client` (business), `freelancer`, `admin` (moderator for disputes and KYC review). One user can have both the client and freelancer roles.

## 2. Tech stack

| Layer         | Choice                                                                                                                 |
| ------------- | ---------------------------------------------------------------------------------------------------------------------- |
| App           | Expo SDK (latest stable), React Native, **TypeScript strict**, **Expo Router** (file-based, typed routes)              |
| UI            | NativeWind (Tailwind) and a small set of shared components in `components/ui`                                          |
| Server state  | TanStack Query v5                                                                                                      |
| Client state  | Zustand (auth/session, UI only)                                                                                        |
| Forms         | react-hook-form + zod (share zod schemas between app and edge functions where possible)                                |
| Backend       | **Supabase**: Postgres, Auth (phone OTP + email), Storage, Realtime, Edge Functions (Deno), `pg_cron`                  |
| Payments      | **YouPI-PG** (https://github.com/youpi-pg/YouPI-PG), a self-hosted UPI gateway (see §5)                                |
| Notifications | `expo-notifications` and an Edge Function that sends through the Expo Push API                                         |
| Files         | `expo-document-picker`, `expo-image-picker`, Supabase Storage                                                          |
| Testing       | Jest + React Native Testing Library (app), Deno tests (edge functions), pgTAP or SQL tests for RLS                     |
| Tooling       | ESLint, Prettier, Supabase CLI with local dev (`supabase start`), generated DB types (`supabase gen types typescript`) |

## 3. Repository structure

See `AGENTS.md` for the structure as built. The `(client)`, `(freelancer)` and `(admin)` route groups became real segments; the reason is in `docs/DECISIONS.md`.

## 4. The 8 features

### F1. Milestone escrow (core)

**Milestones.** A project has an ordered list of milestones. Each milestone has:

- a title
- a deliverable description
- acceptance criteria
- an amount (INR, stored as **integer paise**)
- a due date

**Validation.** No single milestone can be more than 30% of the project total (configurable), and a project needs at least 2 milestones. _This was changed to a scaled cap; see `docs/DECISIONS.md` (D9)._

**State machine.** Enforced in Postgres with a function and a trigger, not only in the app:

```
draft → funded → in_progress → submitted → approved → released
                                  ↘ revision_requested → in_progress
                 (funded|in_progress|submitted) → disputed → (released | refunded | partially_released)
                 (funded|in_progress) → abandoned → (refunded | reassigned)
```

**Funding.** The client funds a milestone through the payment provider. The milestone becomes `funded` only after a verified webhook arrives, never from the client-side callback alone.

**Release.** On approval, a `release` entry is written to the ledger and a payout to the freelancer is queued.

**Auto-approve.** If the client doesn't act within `AUTO_APPROVE_DAYS` (default 5) of `submitted`, the milestone is approved automatically by a `pg_cron` job.

**Ledger.** Escrow balances are tracked in an **append-only double-entry ledger** (`ledger_entries`), never in a mutable balance column. Balances are computed with views.

### F2. Verified profiles

**Profile fields:** name, avatar, headline, bio, skills (tags), categories, city, languages, portfolio links and files, hourly rate, availability status.

**Verification badges:** phone verified (Supabase OTP), email verified, KYC verified, portfolio verified (admin).

**KYC flow (MVP):**

- The user uploads a PAN or Aadhaar image to a **private** bucket. The record moves `pending → approved | rejected`, and an admin reviews it.
- The flow sits behind a `KycProvider` interface so that DigiLocker or a PAN API can be plugged in later.
- Full ID numbers are never stored in plain text. Only the last 4 digits and a hash are kept.

**Public profile** shows: completed milestones, on-time %, abandoned count, average rating and reliability score.

### F3. Work-based ratings and reliability score

**Ratings.** After each milestone is `approved` or `released`, both sides are asked to rate the other:

- The client rates the freelancer on quality, communication and timeliness (1–5 each), plus an optional comment.
- The freelancer rates the client on clarity, payment speed and fairness (1–5 each).

**Rating rules.** Each side may rate a milestone only once, and only after it has been funded and completed. RLS and a unique constraint enforce this. **No ratings without money moving.**

**Reliability score (0–100).** Computed in SQL and recalculated by trigger or nightly cron:

```
score = 40 * completion_rate + 25 * on_time_rate + 20 * (avg_rating / 5)
      + 15 * responsiveness_rate - abandonment_penalty
      -- the penalty is 15 points per abandonment, decaying linearly over 180 days
-- clamp 0..100; new users show "New" until 2 completed milestones
```

**Suggested rate.** The category median rate, adjusted by reliability (±20%), shown while the freelancer edits their rate.

### F4. In-app agreement and e-sign

**Generation.** When a project is created, an **agreement** is generated from the project and its milestones. It covers:

- scope and deliverables
- acceptance criteria
- payment schedule
- revision limit (default 2 per milestone)
- the auto-approve, inactivity and dispute rules
- IP transfer on final payment

**Signing.** Both parties tap **Accept & Sign**. Each signature records the user id, timestamp, IP (captured in an edge function), device info and the **SHA-256 hash of the agreement content**.

**Changes.** An agreement is immutable once both parties have signed. Any change creates a new version through a **change request**, which both parties must sign. A change in scope must be added as a new milestone.

**Output and extensibility.**

- The signed agreement is rendered as a PDF by an edge function and stored in Storage.
- A `SignatureProvider` interface keeps room for Aadhaar e-sign (Leegality, Digio, etc.).

### F5. Proof-of-progress check-ins

**Check-ins.** The freelancer posts check-ins on an `in_progress` milestone: a text update plus optional files, images or links. The cadence is set per project (default every 2 days).

**Inactivity escalation** (`pg_cron`, hourly):

| Check-in overdue by | What happens                                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------------------------------- |
| 1 day               | Push reminder to the freelancer                                                                               |
| 3 days              | The client is alerted, and a warning banner appears on the project                                            |
| 5 days              | The freelancer is flagged `unresponsive`, and the client is offered **Wait / Reassign (F8) / Request refund** |
| 7 days, no response | The client can mark the milestone `abandoned`, which counts against the freelancer's reliability              |

**Activity feed.** A live project activity feed via Supabase Realtime.

### F6. Freelancer commitment deposit

**When it applies.** For projects above `DEPOSIT_THRESHOLD` (₹20,000), the client can require the freelancer to pay a commitment deposit (default 5% of project value, capped). It is collected through the payment provider and recorded in the ledger as `deposit_held`.

**Refund.** The deposit is refunded in full when the project completes, or when it is cancelled by mutual agreement.

**Forfeit.** The deposit goes to the client, minus a platform fee, if the project is marked `abandoned` after the F5 escalation or a dispute is decided against the freelancer.

**Exemption.** Freelancers with a reliability score of 85 or more and at least 5 completed projects are exempt, shown as a badge.

### F7. Dispute resolution

**Raising.** Either party can raise a dispute on a `funded`, `in_progress` or `submitted` milestone. Raising a dispute freezes the milestone's funds.

**Flow.**

1. One party raises the dispute with a reason and evidence files.
2. The other party responds within 3 days.
3. Either party can propose a settlement (a percentage split).
4. If both accept, the settlement is executed automatically. Otherwise the dispute goes to **admin mediation**.

**Mediation.** The admin sees the agreement, check-ins, submissions, chat and evidence, then decides `release_full`, `refund_full` or `split(x%)`. The decision writes the ledger entries and updates the reliability scores.

**Audit.** Every step is stored in `dispute_events` as an audit trail.

### F8. Handover and replacement

**Handover package.** When a milestone is `abandoned`, or the client chooses **Reassign**, a handover package is built automatically. It contains the agreement, the remaining milestones, all check-ins and files so far, and client notes.

**Reposting.** The client can repost the remaining milestones as a new project, prefilled from the handover. Unreleased escrow carries over to the new freelancer, and the original freelancer's access ends.

**Takeovers.** Freelancers can browse open replacement projects, marked with a "Takeover" tag.

**Partial-work fairness.** If the original freelancer submitted work before abandoning, the client can choose to release a partial amount. This is optional, and the choice is recorded.

### Supporting features

- **Project discovery:**
  - Clients post projects.
  - Freelancers browse and filter by skill, budget and city, then send proposals.
  - Clients can also invite a specific freelancer by profile link or phone number.
- **Proposals:** a cover note, a proposed price and timeline, and optional milestone edits.
- **In-project chat:** built on Supabase Realtime and saved as evidence for disputes.
- **Notifications:** a notifications table plus push for every state change.
- **Wallet:** shows what's in escrow, released, pending payouts and deposits held, plus the transaction history from the ledger.
- **Admin screens** (in-app, gated by role): KYC queue, dispute queue, user flags.

## 5. Payments: YouPI-PG integration

> **Read `docs/DECISIONS.md` (D1–D6) first.** The real YouPI-PG docs contradict parts of this section, and the decisions there override it.

**What YouPI-PG is (from its README):**

- It is self-hosted Node.js (≥22.13), run as separate services: Payment API on :6100, Checkout Portal on :7000, Merchant Admin on :6001.
- Checkout is a browser script: `window.Youpi.pay({ order_id, amount, currency, handler, onClose })`. It shows a UPI QR code or deep links to UPI apps.
- Payments are confirmed by a webhook signed with HMAC-SHA256:
  - `X-Gateway-Signature: sha256=<hex>` covers the raw body.
  - `X-Gateway-Signature-V2` additionally binds the timestamp.
  - Failed deliveries are retried for up to 1 hour.
- It handles **collections only**: there is no escrow, split or payout API.
- It is **experimental and not approved by any bank or NPCI**.

**Implementation requirements:**

1. **`PaymentProvider` interface** in `lib/payments`, mirrored in the edge functions. Methods: `createOrder`, `verifyWebhook`, `parseWebhook`, and the optional `createPayout` and `refund`. Implement `YoupiProvider`, and keep the code ready for a licensed provider.
2. **`payments-create-order` edge function.** Creates a `payments` row with a unique, deterministic `order_id` (`MS-<milestone_id>-<attempt>`), calls the provider, and returns the checkout URL.
3. **Checkout in Expo.** Opens the checkout page in `expo-web-browser`. UPI deep links must open the installed UPI apps. The client callback is **UI-only**.
4. **`payments-webhook` edge function.**
   - Read the raw body.
   - Verify the V2 signature with a timing-safe compare, falling back to V1.
   - Reject stale timestamps and dedupe on `deliveryId` with a unique constraint.
   - Check that the amount matches the stored order.
   - In ONE transaction: mark the payment succeeded, write the ledger entries, and move the milestone to `funded` (or the deposit to `held`).
   - Return 2xx only after the commit.
5. **Payouts and refunds.**
   - `payout_requests` and an admin payout screen: the admin pays manually by UPI, enters the UTR, and the request is marked paid in the ledger.
   - Refunds work the same way.
   - All of this sits behind the provider interface.
6. **Config.** `YOUPI_API_URL`, `YOUPI_CHECKOUT_URL`, `YOUPI_PUBLIC_KEY` and `YOUPI_WEBHOOK_SECRET`, stored as Supabase secrets. The webhook secret never ships in the app.
7. **`payments-gateway/README.md`.** Explains how to run YouPI-PG locally next to `supabase start` and how to expose the webhook with ngrok or cloudflared.
8. **Simulate payment (dev only).** A "simulate payment" button calls a protected edge function that sends a correctly signed fake webhook.

## 6. Database rules

**Tables:** `profiles`, `user_roles`, `skills`, `profile_skills`, `portfolio_items`, `kyc_verifications`, `projects`, `project_members`, `proposals`, `milestones`, `milestone_status_history`, `agreements`, `agreement_versions`, `agreement_signatures`, `change_requests`, `check_ins`, `check_in_attachments`, `submissions`, `payments`, `webhook_deliveries`, `ledger_accounts`, `ledger_entries`, `payout_requests`, `refund_requests`, `deposits`, `ratings`, `reliability_scores`, `disputes`, `dispute_events`, `dispute_evidence`, `handovers`, `messages`, `notifications`, `push_tokens`, `audit_log`.

**Access:**

- **RLS on every table.** Users can see only the projects they belong to, public profiles, and open projects. Admins go through `is_admin()`.
- SQL tests must prove that a user **cannot** read another project's milestones, payments, check-ins, messages or disputes.

**Data rules:**

- All money columns are `bigint` paise. No floats.
- Every state change goes through a `security definer` RPC function, never a direct table update from the client.

**Storage buckets:**

| Bucket          | Access                        |
| --------------- | ----------------------------- |
| `avatars`       | public                        |
| `portfolio`     | public                        |
| `kyc`           | private: the owner and admins |
| `project-files` | private: project members      |
| `agreements`    | private                       |

**`pg_cron` jobs:** auto-approve, inactivity escalation, reliability score recalculation, dispute response deadlines.

## 7. Screens

**Auth and onboarding:** welcome → phone OTP → choose role(s) → profile setup → (optional) KYC.

| Area            | Screens                                                                                                                                                                                                                           |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Client tabs     | Home (active projects and alerts) · Post Project · Find Freelancers · Wallet · Profile                                                                                                                                            |
| Freelancer tabs | Home (active milestones and overdue check-ins) · Browse Projects (including Takeovers) · Proposals · Wallet · Profile                                                                                                             |
| Shared          | Project Detail (timeline, activity feed, chat) · Milestone Detail (fund / check-in / submit / approve / revise / dispute) · Agreement View and Sign · Dispute Detail · Public Profile · Rate Milestone · Notifications · Settings |
| Admin           | KYC Queue · Dispute Queue · Payout Queue · User Flags                                                                                                                                                                             |

**Design:**

- A clean, trustworthy fintech feel.
- Status chips with a consistent colour for each milestone state.
- Money always formatted as `₹1,23,456`.
- Loading, empty and error states on every screen.
- Dark mode.

## 8. Build phases

| Phase                                      | Scope                                                                                                          |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| 1. Foundation                              | Expo project, NativeWind, router layout, local Supabase, phone OTP auth, profiles, roles, generated types, CI  |
| 2. Projects and milestones                 | Posting, proposals, invites, milestone builder with validation, the state machine in SQL, RLS and its tests    |
| 3. Agreements (F4)                         | Generate, sign, hash, version, PDF                                                                             |
| 4. Payments and escrow (F1, F6)            | PaymentProvider, YouPI integration, webhook, ledger, wallet, manual payouts and refunds, simulate-payment tool |
| 5. Check-ins and inactivity (F5)           | Check-ins, realtime feed, cron escalation, push notifications                                                  |
| 6. Ratings and reliability (F2 badges, F3) | Ratings, score function, suggested rate, KYC flow, public profile stats                                        |
| 7. Disputes (F7)                           | The full flow and admin mediation                                                                              |
| 8. Handover (F8) and admin screens         |                                                                                                                |
| 9. Hardening                               | Tests, seed data (3 clients, 5 freelancers, projects in every state), an accessibility pass, README            |

## 9. Quality bar

- TypeScript strict, with no `any`. Inputs are validated with zod at every edge-function boundary.
- Money logic and state transitions live **only on the server**. The app never decides that a payment succeeded.
- Every edge function that touches money is idempotent.
- Never log secrets, KYC data or full payment payloads.
- `README.md` covers setup, environment variables, running Supabase and YouPI-PG locally, tests, and a Mermaid architecture diagram.
- When something in the brief is ambiguous, or the YouPI-PG docs contradict it, **ask the user before deciding**.
