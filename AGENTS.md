# AGENTS.md: KaamSetu

A two-sided mobile app for India. Businesses hire freelancers with **milestone payments held in escrow**, signed agreements, progress check-ins, dispute resolution and reliability scores, so that finishing the work always pays better than ghosting.

## Start here

| Read                            | Why                                                                            |
| ------------------------------- | ------------------------------------------------------------------------------ |
| `docs/STATUS.md`                | What is built, what's next, known gaps. **Read first.**                        |
| `docs/ROADMAP.md`               | Detailed tasks, acceptance criteria and 🛑 ASK points for each remaining phase |
| `docs/DECISIONS.md`             | Every deviation from the brief. **Overrides `docs/BRIEF.md`.**                 |
| `docs/BRIEF.md`                 | The original product spec (features F1–F8, quality bar)                        |
| `docs/api/*.md`                 | API contracts (tables, RLS, RPCs, error keys), one per area                    |
| `supabase/migrations/README.md` | SQL conventions                                                                |
| `components/motion/README.md`   | Animation components and where to use them                                     |

Rules live in `.agents/rules/`; `00-core.md` is always on. Workflows are in `.agents/workflows/`: `/start-phase`, `/verify`, `/review`, `/db-change`, `/run-ios`, `/finish-phase`.

## How we work

1. **Work one phase at a time.** Follow `docs/ROADMAP.md`. At the end of each phase, stop for the user's review. Never start the next phase on your own.
2. **Ask before deciding.** If the brief is ambiguous, or an external doc contradicts it, ask the user, then record the answer in `docs/DECISIONS.md`.
3. **Contract first.** Write `docs/api/<area>.md`, then `shared/schemas/<area>.ts` with tests, then the SQL and pgTAP tests, then regenerate the types, then the hooks and screens, then the Jest tests.
4. **Verify before you say it's done.** Run `/verify` and report the results honestly, including anything you could not verify.
5. **Don't commit or push** unless the user asks.

## Non-negotiables

- **Money:** money and state transitions are decided **only on the server** (SQL or edge functions). The app never decides that a payment succeeded. Money is integer paise (`bigint` in SQL, never floats).
- **Writes:** every write goes through a `security definer` RPC (`rpc_*`) or an edge function. There are no direct table writes from the app.
- **Database security:** every table has RLS, explicit grants and pgTAP tests that prove one user can't read or write another user's data.
- **App security:** no secrets in the app bundle. Never log PII, KYC data or payment payloads.
- **Code:** TypeScript strict, no `any`. Zod at every boundary.
- **Screens:** every screen has loading, empty and error states, is accessible, and supports dark mode.

## Stack

- **App:**
  - Expo SDK 58, Expo Router 58 with typed routes, React 19.3, React Native 0.88, TypeScript 6 in strict mode.
  - NativeWind 4 with semantic tokens.
  - TanStack Query 5, Zustand 5, react-hook-form + zod 4.
  - Reanimated 4 and Skia (motion).
- **Backend:** Supabase (Postgres 17, Auth with phone and email OTP, Storage, Realtime, Edge Functions on Deno 2, `pg_cron`).
- **Payments:** YouPI-PG for dev and test only. Production uses a licensed provider (D6) behind `PaymentProvider`.
- **Tests:** Jest + React Native Testing Library 14, pgTAP, Deno test. CI is in `.github/workflows/ci.yml`.

> **Expo changes every SDK release.** Before using any Expo or React Native API, check https://docs.expo.dev/versions/v58.0.0/ and https://docs.expo.dev/llms.txt. Install packages with `npx expo install <pkg>`. Never create or edit `ios/` or `android/` by hand: they're generated. Configure native behaviour in `app.json` and config plugins. After adding a native module, rebuild the dev client with `npx expo run:ios`.

## Repository map

```
app/                         Expo Router routes
  _layout.tsx                providers + Stack.Protected guards (auth → onboarding → app)
  index.tsx                  unguarded entry: redirects by auth/onboarding/mode
  (auth)/                    welcome, phone, email, otp
  onboarding/                roles, profile
  client/ freelancer/ admin/ tab navigators per mode (D7)
  (shared)/                  stack screens: project/[id], milestone/[id], profile/[id], invite/[token], settings, …
components/ui/               themed primitives (Button, Card, Input, Money, StatusChip, Screen, …)
components/motion/           native React Bits ports (D12)
features/<area>/             api.ts (query keys + hooks), errors.ts, components/, __tests__/
lib/                         supabase client (encrypted session), queryClient (offline-aware), env
shared/                      constants, money helpers, zod schemas (mirrors of SQL rules)
types/database.ts            GENERATED: npm run db:types (never edit by hand)
supabase/
  migrations/                timestamped SQL; README.md has the conventions
  tests/database/            pgTAP (NN_area.test.sql)
  functions/                 edge functions (Deno), _shared/providers/*
  templates/                 auth email templates (OTP codes)
  config.toml                LOCAL config (test OTP numbers; never `config push`, D19)
docs/                        BRIEF, DECISIONS, ROADMAP, STATUS, api/
.agents/                     Antigravity rules and workflows
```

## Commands

| Command                                      | Purpose                                                                      |
| -------------------------------------------- | ---------------------------------------------------------------------------- |
| `npm run db:start` / `npm run db:reset`      | Start the local Supabase stack (needs Docker) / re-apply migrations and seed |
| `npm run db:types`                           | Regenerate `types/database.ts` after any schema change                       |
| `npm start` / `npx expo run:ios`             | Start Metro / build and run the iOS dev client                               |
| `npm run check`                              | Lint, typecheck, format check and Jest                                       |
| `npm run test:db` / `npm run test:functions` | pgTAP / Deno tests                                                           |
| `npm run config:check-hosted`                | Guard before ever pushing auth config to a hosted project                    |

**Local login:** phone `9000000001`–`9000000008`, code `123456`. `9000000009` is the seeded admin.

## Gotchas already learned

- `select('*')` on `profiles` fails with 42501, because phone and email are column-protected (D14). List the columns explicitly, or use `public_profiles` / `get_profile_private()`.
- Don't put NativeWind `className` and a Reanimated animated `style` on the same view (D13).
- Under TypeScript 6, `tsconfig.json` needs `"types": ["jest"]`, and side-effect CSS imports need `declare module '*.css'` (in `nativewind-env.d.ts`).
- Jest mock factories may only reference variables whose names start with `mock`.
- BSD `sed` on macOS has no `\b`. Use `perl -pi -e` for word-boundary replacements.
- CocoaPods needs a UTF-8 locale: `LANG=en_US.UTF-8`.
- The iOS Simulator drops repeated keystrokes under automation. Verify from fresh screenshots, and script backend flows with supabase-js instead.
