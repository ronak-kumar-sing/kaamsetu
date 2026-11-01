# Decision log

Every intentional deviation from `docs/BRIEF.md`, with the reason. **This file overrides the brief.** Add new entries at the bottom, numbered. Never silently change one; supersede it with a new entry.

Status key: ✅ decided by the user · 🔧 engineering decision (can be revisited)

---

## Payments (from reading the real YouPI-PG docs, 2026-10-30)

**D1 ✅ Fund only on `RECONCILED`.**

- **What the gateway sends.** UPI payments never send `SUCCESS`; that event is for cash and counter payments only. A UPI payment first sends `OBSERVED_SUCCESS` (`settlementState: NOT_RECONCILED`), which comes from a bank SMS or email alert and does not prove settlement. Then it sends `RECONCILED`, but only after an admin imports a bank statement CSV.
- **Decision.** A milestone moves to `funded` **only** on `event=RECONCILED`, `method=UPI` and `settlementState=RECONCILED`.
- `OBSERVED_SUCCESS` sets the payment to `observed`, and the UI shows "Payment detected, confirming with bank".
- `MANUAL_REVIEW` and every other event are never a funding trigger.

**D2 🔧 75-minute webhook freshness window.**

- Retries resend the _original_ timestamp for up to 1 hour, so a 5-minute window would reject legitimate retries.
- Use 75 minutes, and dedupe on `deliveryId` (unique constraint) as the real replay guard.

**D3 🔧 Amounts and order creation.**

- `POST /api/v1/payments` takes `amount` as a **rupee string** (`"499.00"`). Store paise everywhere and convert only at the provider boundary with `paiseToRupeeString`.
- Send `Idempotency-Key = order_id`.
- A `409` can mean `DUPLICATE_SESSION_DETECTED` or `ORDER_AMOUNT_MISMATCH`. Handle both.

**D4 🔧 No `@youpi/merchant-sdk`.** Call the REST API directly with `fetch` from Deno.

**D5 🔧 Accept the hosted-checkout sign-in.** The YouPI checkout makes the payer sign in or verify by WhatsApp OTP before showing the QR code. This is UX debt that we accept. Open `checkoutUrl` in `expo-web-browser`.

**D6 ✅ YouPI is a dev/test provider only.**

- The YouPI README forbids using it to pool or route funds for third parties, which is exactly what escrow does.
- It is experimental, not NPCI-approved, and limited to about 20 transactions a day.
- Everything goes behind `PaymentProvider` / `PayoutProvider`. **Production needs a licensed escrow or nodal partner** (e.g. Razorpay Route, Cashfree Easy Split, or a bank escrow account). **Ask the user which one before Phase 4**, and implement it next to `YoupiProvider`.

## App structure

**D7 🔧 Mode routes are real segments, not groups.**

- The brief's `(client)`, `(freelancer)` and `(admin)` became `/client`, `/freelancer` and `/admin`. Their tabs share names (home, wallet, profile), and typed routes reject group routes that resolve to the same URL.
- `(auth)` and `(shared)` remain groups.
- `app/index.tsx` is the **unguarded** entry point that redirects by auth, onboarding and mode state. Everything else sits behind `Stack.Protected` guards in `app/_layout.tsx`.

**D8 🔧 Working name "KaamSetu".** Scheme `kaamsetu://`, bundle id `in.kaamsetu.app`. It's a placeholder and easy to rename.

## Business rules

**D9 ✅ Scaled milestone cap.**

- A flat 30% cap combined with a 2-milestone minimum is impossible: 2 milestones force at least 50%, and 3 force at least 33.4%.
- Rule: `cap_pct(n) = max(30, ceil(120 / n))`, which gives 2 → 60%, 3 → 40% and 4 or more → 30%.
- The numbers are configurable in `app_config` (`max_milestone_pct`, `milestone_cap_slack_pct`) and mirrored in `shared/constants.ts`.
- Compare with integer maths only.

**D10 🔧 Project status `awarded`.** It's added between `open` and `in_progress`: a freelancer has been chosen, and the agreement and funding are pending. The first funded milestone moves the project to `in_progress`.

**D11 🔧 Dates are `date` values in Asia/Kolkata.** "Today" in SQL is `(now() at time zone 'Asia/Kolkata')::date`.

## UI and animation

**D12 ✅ Native ports of React Bits.**

- React Bits (reactbits.dev) is web-only: it needs DOM, GSAP and Three.js.
- At the user's request, 12 components were re-implemented natively in `components/motion/` with Reanimated 4 and Skia: CountUp/MoneyCountUp, BlurText, SplitText, ShinyText, GradientText, SpotlightCard, StarBorder, AnimatedList, FadeContent, ClickSpark, Aurora, Particles, plus PressableScale.
- Use these, not web React Bits, and keep motion calm.
- Every component respects reduced motion.

**D13 🔧 NativeWind and animated styles don't mix.** NativeWind drops `className` styles on a component that also gets a Reanimated animated `style`. Put the animated transform on a wrapper `Animated.View` and the classes on a plain inner `View`, as `PressableScale` does.

## Security

**D14 🔧 Column-protected profiles.**

- `profiles.phone`, `email` and `is_flagged` are excluded from the SELECT grant, so `select('*')` on `profiles` fails with 42501.
- Read other users through the `public_profiles` view or explicit column lists.
- Read your own private fields with `get_profile_private()`.

**D15 🔧 Supabase's default grants are revoked.** Every table and function gets explicit grants. `anon` can read only `skills`. `admin` is granted only in SQL (`rpc_admin_set_role`), never self-assigned.

**D16 🔧 Encrypted session storage.** The Supabase session is AES-256-CTR encrypted, with a fresh key per write. The key lives in SecureStore (Keychain/Keystore) and the ciphertext in expo-sqlite localStorage. See `lib/secureSessionStorage.ts`.

**D17 🔧 Storage paths are strict.**

- Paths are `<owner_or_project_id>/<file>`, using only `[A-Za-z0-9._-]`, with no `..`. Enforced by CHECK constraints and storage policies.
- Public buckets (`avatars`, `portfolio`) have **no** public SELECT policy, so they can't be listed. Their files are served through public URLs.

**D18 🔧 Push tokens can't be stolen.** `rpc_register_push_token` refuses a token that another account owns (42501). The app must call `rpc_unregister_push_token` on sign-out (Phase 5).

**D19 🔧 Local-only auth config.** Test OTP numbers (`+91 90000 0000x`, code `123456`) and `exp://` redirects are local only. Never run `supabase config push`; configure hosted auth in the dashboard. `npm run config:check-hosted` guards this.

**D20 🔧 pgTAP is test-only.** It's not installed by migrations. Each test file creates it inside its own rolled-back transaction.

## Phase 2

**D21 🔧 Invites grant visibility.**

- An accepted (or pending) invite makes the project readable by the invitee, including an invite-only project in `open` status. Otherwise they couldn't propose.
- Re-inviting the same freelancer or phone revokes the earlier pending invite.
- A project can have at most 50 pending invites.
- A `pg_cron` job expires invites every 15 minutes.

**D22 🔧 Drafts validate every field when saved.**

- `rpc_save_project_draft` checks every field's bounds when saving.
- Only the cross-milestone rules (count, cap, date order) wait until publish.
- All its arguments `default null`, so omitting `p_project_id` creates a new draft.

**D23 🔧 Milestone terms are frozen after `open`.** A trigger blocks changes to amount, due date and position, and blocks adding or removing milestones, once the project leaves `open` or any milestone leaves `draft`. Changes after that go through change requests (Phase 3).

**D24 🔧 Orphaned sessions sign out.** A stored session whose user has no `profiles` row (account deleted, local DB reset) is signed out instead of being stranded in onboarding (`app/_layout.tsx`).

**D25 🔧 Inputs always set letter spacing.** iOS recycles native text inputs, so one input's `tracking-*` can leak into the next. `components/ui/Input.tsx` applies `tracking-normal` unless the caller passes its own `tracking-*`.

**D26 🔧 A proposal's price is the sum of its milestones.**

- With a counter-plan, `sum(edits.amount_paise)` must equal `proposed_total_paise`. Without one, `proposed_total_paise` must equal the project's `total_paise`. So changing the price requires a plan.
- Each plan row may set `source_milestone_id`: the client milestone it replaces. That row inherits the source's deliverable and acceptance criteria. Rows without a source must include their own.
- Rows are matched by id, never by position.
- Enforced in `rpc_submit_proposal` and again in `rpc_accept_proposal`. Mirrored in `shared/schemas/projects.ts` (`proposalPriceIssue`).
- The final plan is always validated (cap, count, future and ordered dates) before a project is awarded, whether or not edits are applied.

**D27 🔧 Invite rules.**

- Invites are allowed only while a project is `open`.
- The client can revoke `pending` **and** `accepted` invites while the project is `open`. Revoking removes the invitee's visibility.
- An invite link opened while signed out (or during onboarding) is saved on the device and resumed after sign-in.
