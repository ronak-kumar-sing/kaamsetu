---
description: Run every check CI runs (lint, types, format, Jest, Deno, pgTAP, DB lint, type drift) and report results honestly.
---

# /verify

Run these from the repo root, in order. Don't stop at the first failure: collect every result, then report them all.

1. Make sure Docker is running and the local stack is up. If it isn't, run `npm run db:start`.
   // turbo
2. `npm run lint`
   // turbo
3. `npm run typecheck`
   // turbo
4. `npm run format:check`. If it fails, run `npx prettier --write .`, then re-run the check.
   // turbo
5. `npm test -- --ci`
   // turbo
6. `npm run test:functions`
7. `npx supabase db reset`
   // turbo
8. `npx supabase test db`
   // turbo
9. `npx supabase db lint --schema public`
10. Type drift: `cp types/database.ts /tmp/db.before.ts && npm run db:types && diff -u /tmp/db.before.ts types/database.ts`. A diff means the committed types were stale. Keep the regenerated file and say so in the report.
11. Bundle check: `npx expo export --platform ios --output-dir /tmp/ks-verify && rm -rf /tmp/ks-verify`

Report a table with one row per check: ✅ or ❌, plus the key output for every ❌ (test names and error lines). Never call the work done while anything is ❌.
