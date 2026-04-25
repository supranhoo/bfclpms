## Root Cause

Toggling a KPI from **Organization-Level → Normal** (or vice-versa) fails system-wide with:

> `Failed to update KPI — column rp.month_name does not exist`

This is **not** specific to Jitendra Dwivedi — it blocks **every user**. The error comes from a database trigger that fires automatically whenever `kpis.is_org_level` or `kpis.org_level_scope` changes.

### What's broken

Two database functions reference `public.review_periods` columns that don't exist on that table:

| Function uses | Actual column |
|---|---|
| `rp.month_name` | `rp.period_name` |
| `rp.year` | `rp.review_year` |

Affected functions (both introduced/last-edited on 2026-04-21):

1. **`fn_sync_org_status_to_future_open_periods`** — the AFTER UPDATE trigger on `kpis` that propagates Org→Normal flips to future open periods. **This is what's blowing up the toggle.**
2. **`change_org_kpi_scope_cascading`** — the cascading scope-change RPC (used by Org KPI Management's "Apply scope to future months").

Verified against live schema: `review_periods` has only `period_name` and `review_year` — no `month_name` or `year` column.

## Fix

A single migration that **redefines both functions** with the correct column names. Bodies are byte-equivalent to the existing versions except for the two-column rename — no logic, no signature, no behavioural change.

```sql
-- inside both functions, replace
JOIN public.review_periods rp ON rp.id = rpl.review_period_id
WHERE rp.month_name = ...
  AND rp.year       = ...
-- with
JOIN public.review_periods rp ON rp.id = rpl.review_period_id
WHERE rp.period_name = ...
  AND rp.review_year = ...
```

## Risk & Impact

- **Data**: None. Pure function redefinition; no rows touched, no schema/RLS change.
- **Workflow**: Restores the broken Org↔Normal toggle to working order. The lock-check inside both functions starts working correctly (today it always errors before reaching the check, so locked-period protection is currently *non-functional* — this fix actually re-enables it).
- **UI**: None.
- **Regression risk**: Very low. Function signatures unchanged; trigger binding unchanged. Existing migrations stay in history (we only redefine via `CREATE OR REPLACE`).
- **Mitigation**: Add `BUG-027` to `src/test/bugBountyFixes.test.ts` that pins the corrected column names by reading the latest migration file — prevents the typo from sneaking back in if either function is ever rewritten.

## Files

- `supabase/migrations/<timestamp>_fix_org_kpi_scope_toggle_column_names.sql` ⭐ new
- `src/test/bugBountyFixes.test.ts` — add BUG-027
- `DOCUMENTATION.md` — append v2.66.7.29 entry under Version History
- `POLICY.md` — append §100 codifying the canonical `review_periods` column names so future migrations don't repeat the typo

## Verification after deploy

1. Open Jitendra Dwivedi's KPI in *View KPI Details* → toggle **Organization-Level KPI** off → Save. Should succeed.
2. Spot-check an Org KPI demotion in a later month to confirm the forward-sync trigger now executes silently.
3. Run the new test: `bunx vitest run src/test/bugBountyFixes.test.ts`.
