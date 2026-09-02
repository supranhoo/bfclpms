# Scope change: say why a period was skipped, and let it be applied

## What you saw

"Changed to department across 3 period(s) · 8 skipped (locked)".

The word "locked" there is wrong. The database currently holds **no global/full period lock at all** (0 rows), so no period in your fiscal year can be skipped for being locked. The cascade skips a period for one of two reasons and the toast prints only the second wording:

- `period_locked` — the period is closed (not your case today)
- `no_org_kpi_rows` — this KPI does not exist in that month yet, so there is nothing whose scope could change

Your 8 skipped periods are the months where this LTI KPI has not been rolled out. The scope change did apply everywhere the KPI actually exists (3 periods).

## How to make the change apply to those months

Scope lives on the KPI row of each month; it cannot be written into a month with no row. So the fix has two parts.

### 1. Tell the truth in the result

Replace the single "N skipped (locked)" line with a per-reason breakdown in the toast and in the confirmation dialog's preview:

```text
Changed to "Department" across 3 periods.
8 periods skipped:
  - 8 have no rows for this KPI yet (Nov 2026 - Jun 2027)
  - 0 are locked
```

Locked periods are listed by name so it is obvious which month to unlock.

### 2. Offer "also roll this KPI into the remaining months"

When the preview reports `no_org_kpi_rows` periods, the dialog offers a checkbox: **Create this KPI in the remaining months of the fiscal year with the new scope**. Checked, the cascade seeds those months from the current month's definition (same KRA, KPI, type, ladder, weightage, frequency and employee set) with the new scope already applied, using the existing rollout path rather than a new write route. Left unchecked, behaviour is exactly as today.

Locked periods are never written by this option — they stay listed and require the period to be unlocked first.

## Technical notes

- `public.change_org_kpi_scope_cascading` (10-arg overload): keep the reason codes as they are; add counts per reason to the returned JSON so the client does not have to guess. Add an optional `p_seed_missing boolean default false` — when true, a period skipped with `no_org_kpi_rows` is populated by the existing rollout/rollover helper for the same signature, then scope-updated in the same loop and audit-logged with `ORG_KPI_SCOPE_CASCADED` plus `seeded: true`. The 9-arg overload is left untouched (POLICY §DB-FUNCTION-SIGNATURE-CHANGES: no in-place signature edit).
- `src/hooks/useOrgKpiManagement.ts`: `CascadeResponse.skipped` is grouped by reason; the toast text is built from the grouping instead of the hardcoded "(locked)". `useScopeCascadePreview` returns the same grouping so the dialog can show it before writing.
- Scope-change dialog: reason breakdown block + the seed checkbox (hidden when there is nothing to seed).
- Tests: grouping helper (locked vs missing vs mixed), toast text for each case, and an RPC test that `p_seed_missing = false` reproduces today's output exactly.
- Docs: ADR-344 and a POLICY note that a skip reason is always reported verbatim, never collapsed into "locked".

## Risk

- Data: seeding is opt-in and additive; it creates rows only in months that have none. No existing row is rewritten beyond the scope column already being changed today.
- Regression: default path byte-identical to current behaviour; the new argument defaults to false.
- Rollback: drop the new argument overload and revert the hook/dialog; written rows keep their scope.
