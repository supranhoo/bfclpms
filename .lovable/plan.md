## Problem

KRA Rollover for Sindhu Raj Singh fails with:
`Insert failed: invalid input syntax for type numeric: ">1"`

(from `auto-rollover-kpis` edge function logs, May→June 2026 rollover).

## Root Cause

The DB function `public.batch_insert_kpis_with_rollover_flag(kpis_json jsonb)` casts the rating threshold fields `r5, r4, r3, r2, r1, r0` to `numeric`:

```sql
(kpi->>'r5')::numeric, ... (kpi->>'r0')::numeric,
```

But in `public.kpis` these columns are actually **`text`** — they legitimately hold qualitative threshold strings like `">1"`, `"Yes"`, `"<=2"`, etc. As soon as any source KPI carries a non-numeric threshold (Sindhu's KRA set has one with `">1"`), the rollover insert blows up and the whole batch is rolled back, producing the toast "Edge Function returned a non-2xx status code".

This is a regression in the RPC contract — the table is text, the RPC pretends it's numeric.

## Fix

Single migration that replaces `batch_insert_kpis_with_rollover_flag` so the r-threshold columns are inserted as **text** (matching the table), while keeping `target_value`, `weightage`, `review_year` numeric/int casts unchanged. No app/edge-function code change needed — same signature, same behavior, just correct types.

```sql
CREATE OR REPLACE FUNCTION public.batch_insert_kpis_with_rollover_flag(kpis_json jsonb)
RETURNS integer ... AS $$
  ...
  SELECT
    ...
    (kpi->>'target_value')::numeric,
    ...
    (kpi->>'weightage')::numeric,
    ...
    kpi->>'r5',
    kpi->>'r4',
    kpi->>'r3',
    kpi->>'r2',
    kpi->>'r1',
    kpi->>'r0',
    ...
$$;
```

Also harden `target_value`: source rows can theoretically be NULL — keep current `(... )::numeric` since column allows NULL and `NULL::numeric` is fine; no change needed.

## Risk & Impact

- **Data**: None — only fixes a cast bug; existing rows untouched.
- **Workflow**: Rollover succeeds for KRAs containing qualitative/operator thresholds (`">1"`, `"Yes"`, etc.). No other caller of this RPC exists outside `auto-rollover-kpis`.
- **Regression**: Low — r-columns are already text everywhere else in the codebase. The buggy cast only worked accidentally when all thresholds happened to be pure numbers.
- **Rollback**: Replace function with previous body if needed (additive change).

## Verification

1. Re-run Sindhu Raj Singh rollover from May→June 2026 → should succeed and report 22 KPIs copied.
2. Spot-check a target KPI: `r` columns preserve `">1"` exactly as on source.
3. Dry-run for another employee with purely numeric thresholds still works.

## Docs

- Update `DOCUMENTATION.md` rollover section: note r-thresholds are text passthrough.
- Add entry to `mem://features/admin/enhanced-kra-rollover-system` about text-typed thresholds.
