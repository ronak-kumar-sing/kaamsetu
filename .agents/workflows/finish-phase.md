---
description: Close out a phase - verify, update STATUS/README/DECISIONS, summarise for the user, and stop for review.
---

# /finish-phase

1. `/verify` must be fully green.
2. Update `docs/STATUS.md`:
   - mark the phase done, with the date;
   - list what was built (routes, RPCs, tables) and the test counts;
   - list known gaps and anything not verified.
3. Update `README.md` if setup, env vars or scripts changed.
4. Make sure every decision made during the phase is in `docs/DECISIONS.md`.
5. Show the user a summary: what was built, the test results, what was not verified, and the decisions they should know about. Then ask whether to commit.
6. **Commit only if the user says so.** Use a conventional message (`Phase N: <title>`) and the user's attribution rules.
7. **Stop.** Do not start the next phase until the user asks.
