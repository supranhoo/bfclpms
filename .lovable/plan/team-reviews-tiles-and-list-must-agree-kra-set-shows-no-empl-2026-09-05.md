# Team Reviews — tiles and list must agree (KRA Set shows "no employees")

## What you are seeing
Team Reviews shows **28 employees** and a **KRA Set = 23** tile, but with that tile
selected the list says *"No employees match the current filters"*. So the counter and
the list disagree: something is counted that the list then throws away.

## What the code shows (verified)
`EmployeeSelectorGrid.tsx` computes the tile numbers and the list membership with **two
different rule sets**:

- Tile counter (`stats`): counts a `kra_set` KPI when the employee is a direct report
  **or** when the viewer is a full-access role — no check on the employee's workflow.
- List filter: uses `matchesTeamTile('pending_kra_set', …)` in
  `src/lib/teamReviewTileFilter.ts`, which additionally requires
  `isDirect`, **or** full-access **and** the employee's resolved workflow contains a
  `self_review` stage. Skip-level and functional reports are rejected outright.

Any employee counted by the first rule but rejected by the second disappears from the
list while still inflating the tile — exactly the 23-vs-zero symptom. Which branch is
biting for this reviewer (relationship vs missing `self_review` stage) is not yet
confirmed; step 1 below confirms it against the real data before the fix lands.

## Fix

1. **Confirm the branch** — query the reviewer's Aug 2026 `kra_set` KPIs and the
   resolved workflow stages of those employees, and record the result in the ADR.

2. **One rule for both** (`src/lib/teamReviewTileFilter.ts` becomes the single source of
   truth): the `stats` counter stops using its own inline conditions and calls
   `matchesTeamTile` for each of the five team tiles. A tile can then never count a KPI
   the list will hide.

3. **Correct the KRA Set rule.** KRA Set means "waiting on the employee". A reviewer who
   can see the person at all (direct, skip-level or functional report, or full access)
   should see them under KRA Set. The `self_review`-stage requirement is dropped for
   full access; `isIndirect` and `isFunctional` are accepted alongside `isDirect`.
   The other four tiles keep their existing stage-true rules unchanged.

4. **No-KRA safety net.** With a tile selected, the queue mode (`With KRAs` /
   `Pending action` / `All`) is not applied on top — a tile pick already defines the
   subset, so it can no longer subtract from it.

5. **Empty-state honesty.** If a tile is selected and the result is still empty, the
   empty state says so and offers "Show all team members" instead of the generic
   "no employees match".

6. **Toggle visibility.** The queue control renders once for every reviewer on Team
   Reviews (today the non-full-access placement sits below the diagnostics block and
   can be missed) — moved into the filter row next to "More filters".

## Tests
`src/tests/teamReviewTileFilter.test.ts` (new/extended): KRA Set visible for direct,
skip-level, functional and full-access viewers; `pending_direct` / `pending_skip` /
`pending_functional` stay stage-true; counter and filter agree on the same fixture set.

## Risk & impact
- Data / RLS / workflow / scoring: unchanged — presentation and counting only.
- Counts: the KRA Set tile may move for full-access viewers whose employees lack a
  `self_review` stage; that number becomes the truthful one.
- Regression: low; the four other tiles keep their current predicates, now applied in
  both places.
- Rollback: revert the predicate change; the counter delegation is a single call site.

## Docs
ADR-360, POLICY §129 amendment (tile counts and list share one predicate),
DOCUMENTATION.md version entry, roadmap.
