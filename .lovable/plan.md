
# Remove subtree-only rows from Team Annual Review "My Queue"

## Root cause (verified in DB)

Piyush Bansal is `100076`. Both flagged rows appear because Umesh Kumar Singh (`100600`) reports to Piyush, and Saroj Devi (`101786`) / Vikash Kumar Anand (`101832`) report to Umesh — putting them inside Piyush's reporting subtree.

`get_my_annual_review_queue` (SECURITY DEFINER RPC, scope=`any`) currently returns any row where:

```
is_named   -- user is on a reviewer slot listed in enabled_stages
OR is_subtree -- employee is anywhere in the user's reporting subtree
```

For both 101786 and 101832:
- `manager_id / skip_id / dept_head_id / bu_head_id / hr_id / management_id` — none equal Piyush.
- `enabled_stages` = `[self, bu_head]` / `[self, dept_head, bu_head]` — Piyush is not a stage on either workflow.
- `is_subtree` = true.

The RPC therefore adds them to Piyush's queue with `visibility_only: true` (rendered as "View only" — no `You: <role>` badge, no action). That is exactly the two cards the screenshot circles.

The "Hierarchy — Completed" tab already exists to give managers downline visibility into completed reviews, so "My Queue" does not need to double as a subtree viewer.

## Fix

Restrict "My Queue" (scope=`any`) to rows where the viewer is a named reviewer. Subtree visibility stays in the "Hierarchy — Completed" tab and in the explicit `subtree` scope (unchanged).

### DB — new migration

Redefine `public.get_my_annual_review_queue` with a single change: the `any` branch drops `OR v.is_subtree`.

```sql
WHEN 'subtree' THEN v.is_subtree
ELSE v.is_named            -- was: (v.is_named OR v.is_subtree)
```

Everything else (auth check, status/scope validation, search, pagination, `visibility_only` flag, seniority ordering) stays identical. `subtree` scope is preserved so any current caller that opts in still works.

### Frontend

No functional change required. Optional cleanup in `src/pages/annual-review/TeamAnnualReview.tsx`:
- `resolveMyRole` no longer needs its stage-membership defence for visibility_only rows (rows returned will always have `is_named=true`), but leaving it in is safe.
- The "View only" chip path in the queue card can stay — used only for edge cases where a reviewer slot was reassigned mid-flight.

No change to `HierarchyCompletedList` / `get_hierarchy_completed_reviews` — that remains the canonical downline visibility surface.

## Verification

Run in the same migration after the CREATE FUNCTION, as a sanity SELECT (not asserted):

- `get_my_annual_review_queue(active_cycle, 1, 100, null, 'all', 'any')` impersonated for Piyush (`100076`) must NOT contain 101786 or 101832.
- Same call for a user who IS a named reviewer on those instances must still return them.
- `scope='subtree'` for Piyush must still return them (contract preserved).

Add regression test `src/test/annualReview/queueScopeAnyExcludesSubtreeVisibilityOnly.test.ts` locking:
1. The RPC's `any` branch uses `v.is_named` only.
2. The `subtree` branch still includes `v.is_subtree` rows.

## Rollback

Single-file DB migration; rollback = re-issue the previous function body (kept in the migration comment header). No data mutation, no UI-breaking API change.

## Risk & impact

- Data impact: none — read-only RPC.
- Workflow impact: none — no reviewer/stage rewiring.
- UI impact: managers stop seeing downline "View only" completed rows in "My Queue"; they still see them under "Hierarchy — Completed".
- Regression risk: low. Subtree-scope callers unaffected. Named reviewers unaffected.
- Scalability: strictly reduces the row count returned per user; positive impact.
