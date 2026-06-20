
## Root Cause

`recalculate_bu_head` → `resolve_bu_head(...)` joins `public.levels` and orders by `COALESCE(lv.rank, 0)`. The `levels` table has no `rank` column (only `id`, `name`, `code`, `description`, `company_id`, `created_at`). Postgres therefore parses `lv.rank` as the `rank()` ordered-set aggregate and raises:

> WITHIN GROUP is required for ordered-set aggregate rank

So every "Recalculate from Hierarchy" click fails before any data is touched. Same bug lurks in `resolve_hr_head` (which delegates to `resolve_bu_head`), so HR Finalization → Recalculate is broken too.

## Risk & Impact

- **Data Impact**: None. Function is read-only until the UPDATE in `recalculate_bu_head`; failure prevents the UPDATE entirely. No prior recalcs ran successfully against the level-tiebreak column either (it never existed), so removing it changes nothing historically.
- **Workflow Impact**: Auto-derivation tie-break order changes from `(level.rank DESC, doj ASC)` to `(doj ASC, id ASC)`. Manual overrides via `set_bu_head` are unaffected. Annual Review reviewer chain still reads `business_units.head_user_id`.
- **Regression Risk**: Low. The current behaviour is "always errors", so any working tie-break is strictly better. Manual override remains the escape hatch.
- **Mitigation**: Surgical migration that replaces only `resolve_bu_head`; `recalculate_bu_head` / `set_bu_head` untouched. Update memory doc to reflect the corrected tie-break.

## Fix

Single migration that replaces `public.resolve_bu_head` with a version that:

1. Builds the same `scope` (active employees whose dept belongs to the BU) and `roots` (no manager, or manager outside scope) CTEs.
2. Drops the `levels` join and the bogus `lv.rank` reference.
3. Orders roots by earliest `doj` (NULLS LAST) then `id` for deterministic tie-break.
4. Returns the winning `id`.

Function stays `STABLE SECURITY DEFINER`, same signature, same return type — no callers change.

## Tests / Verification

- Manual: click Recalculate on any BU → toast "Recalculated from hierarchy", Head column updates to the root manager (or `Not set` if BU has no roots).
- Manual: click Recalculate on HR Finalization → toast success.
- Sanity SQL: `SELECT public.resolve_bu_head(id) FROM public.business_units LIMIT 5;` returns either a uuid or NULL, no exception.

## Docs & Memory

- Update `mem/features/admin/org-heads.md` resolver-SSOT line: tie-break is now "earliest `doj`, then `id`" (no `levels.rank`, since that column doesn't exist in this schema).

## Rollback

If anything regresses, re-run the previous `resolve_bu_head` definition (kept above in this message) via a follow-up migration. No data is touched by the fix itself.
