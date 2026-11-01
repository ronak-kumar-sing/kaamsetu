---
description: Start the next roadmap phase the same way every phase has been built (contract → SQL+tests → types → app → tests → verify → review).
---

# /start-phase

1. Read `docs/STATUS.md` to find the next phase. Then read its section in `docs/ROADMAP.md`, the relevant parts of `docs/BRIEF.md`, and all of `docs/DECISIONS.md`.
2. Handle every 🛑 **ASK** in that phase **before** coding. Ask the user, wait for the answers, then add them to `docs/DECISIONS.md` as new numbered entries.
3. Check that the tree is clean and the previous phase is committed: `git status`.
4. Write the contract in `docs/api/<area>.md`. Cover:
   - enums
   - tables and the columns the app reads
   - visibility (RLS)
   - RPC names, arguments, return types and rules
   - error keys
   - storage paths

   Follow the format of `docs/api/projects.md`.

5. Add zod mirrors and pure rule functions in `shared/schemas/<area>.ts`, with Jest tests.
6. **Database:** write new migrations and pgTAP tests (see `.agents/rules/database.md`). Then run `npx supabase db reset && npx supabase test db`, and `npm run db:types`.
7. **Edge functions**, if the phase has any: zod at the boundary and Deno tests (see `.agents/rules/edge-functions.md`).
8. **App:** hooks in `features/<area>/api.ts`, error mapping, then screens. Replace placeholder tabs. Add Jest/RNTL tests.
9. Run `/verify` and fix everything.
10. Run `/review`, fix the confirmed findings, then run `/verify` again.
11. Run the app on iOS (`/run-ios`) and walk the phase's main flow.
12. Run `/finish-phase`.
