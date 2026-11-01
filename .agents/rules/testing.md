---
trigger: model_decision
description: How to test and verify work in this repo (Jest, pgTAP, Deno, simulator), and how to report results.
---

# Testing and verification

- **App:** `npm test` (Jest + RNTL). Put tests next to the feature in `__tests__/`.
- **DB:** `npm run test:db` (pgTAP). Needs `npm run db:start` with Docker running.
- **Edge functions:** `npm run test:functions` (Deno).
- **Everything:** run the `/verify` workflow. It's the same set of checks CI runs (`.github/workflows/ci.yml`).
- **Runtime check on iOS:**
  1. `npx expo run:ios` builds the dev client. If CocoaPods complains about encoding, set `LANG=en_US.UTF-8`.
  2. `npx expo start --dev-client` starts Metro.
  3. Sign in with `9000000001`–`9000000009` and code `123456`. `9000000009` is the admin.
- The iOS Simulator may drop repeated keystrokes when automated. Verify state from a fresh screenshot. For backend flows, script the same RPC calls with `@supabase/supabase-js` against the local stack.
- **Report honestly:**
  - Paste the failing output.
  - Never say "done" while a check fails.
  - Say what you could not verify, for example "not run on Android".
