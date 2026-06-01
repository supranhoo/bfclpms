## Root Cause

The `01 Jun 2026` auto-rollover (and the manual one from the dialog) fails with:

```
duplicate key value violates unique constraint "idx_kpis_no_duplicates"
```

That unique index is `(employee_id, COALESCE(review_period,''), COALESCE(review_year,0), kra_name, kpi_name)`.

Two compounding defects in `supabase/functions/auto-rollover-kpis/index.ts` + its RPC let duplicates slip through:

1. **In-function dedup is incomplete for multi-month frequencies.**
   `possibleTargetMonths` (used to fetch existing target rows) is built by calling `getCycleMonthsForTarget(targetMonthIdx, freq)` **without each source KPI's `frequency_cycle_start`**. When a source KPI uses a non-standard `frequency_cycle_start` (e.g. Quarterly anchored `Feb-Apr`), its actual cycle months at insert time can fall outside `possibleTargetMonths`. The existing target row is therefore not loaded into `targetByEmployee`, dedup misses it, and the insert hits the unique index.

2. **The batch insert RPC has no ON CONFLICT clause** (`batch_insert_kpis_with_rollover_flag`, migration `20260528104120`). A single duplicate row in a 500-row batch raises an exception and rolls back the entire batch → "0 KPIs copied" → failure logged. This is the visible symptom.

A third contributing factor: prior partially-failed rollovers may have already inserted some of the target rows; defect #1 hides them and defect #2 turns one collision into a total failure.

## Risk & Impact Report

| Area | Impact |
|------|--------|
| Data | Additive only. Adds `ON CONFLICT DO NOTHING` and tightens dedup. No existing rows mutated. |
| Workflow | Manual + scheduled rollover both start succeeding; preview unchanged in shape. |
| UI/UX | Preview dialog unchanged. Result toast and `kra_rollover_logs.error_message` will now report `X duplicates skipped` instead of failing. |
| Regression | Low. RPC signature unchanged. Edge-function shape unchanged. |
| Scalability | Same batch size (500). Slightly more memory for the dedup set built from source KPIs (bounded by source row count). |

Mitigation: unit tests covering custom `frequency_cycle_start`, duplicate-in-batch, and partial-prior-rollover scenarios.

## Plan

### 1. Migration — make the batch insert idempotent
New migration that replaces `public.batch_insert_kpis_with_rollover_flag`:
- Keep signature `(kpis_json jsonb) RETURNS integer`.
- Append `ON CONFLICT (employee_id, COALESCE(review_period,''), COALESCE(review_year,0), kra_name, kpi_name) DO NOTHING` (matches `idx_kpis_no_duplicates`).
- `RETURN ROW_COUNT` (already inserted-only count).

### 2. Edge function — fix the dedup window
In `supabase/functions/auto-rollover-kpis/index.ts`:
- Build `possibleTargetMonths` from the **actual source KPIs** by iterating `sourceKpis` and calling `getCycleMonthsForTarget(targetMonthIdx, kpi.frequency, kpi.frequency_cycle_start)` for each, unioning all months `>= targetMonthIdx`. Always include `targetMonth` itself.
- Add a final safety pass right before insert: re-query `kpis` for the exact `(employee_id, kra_name, kpi_name, review_period, review_year)` keys present in `kpisToInsert` and drop any that already exist. Counts as `duplicates_skipped`.
- Track `duplicates_skipped` and include it in the response payload + `kra_rollover_logs` (new column, or appended to existing `error_message`/`status='completed_with_skips'`).

### 3. Logging
- On success-with-skips, write `kra_rollover_logs` with `status='completed'`, `error_message = 'Skipped N pre-existing duplicates'` (no schema change).
- Keep `status='failed'` only for true RPC errors.

### 4. Tests (`supabase/functions/auto-rollover-kpis/*.test.ts` or `src/lib/__tests__`)
- Pure helpers extracted (already present): `getCycleMonthsForTarget`, plus a new `buildPossibleTargetMonths(sourceKpis, targetMonthIdx)` helper that we can unit-test.
- Cases:
  1. Custom `frequency_cycle_start='Feb-Apr'` Quarterly source → possibleTargetMonths includes May/Jun/Jul correctly.
  2. Two source rows that resolve to the same target row → only one inserted, one counted as duplicate.
  3. Pre-existing target row + new source row → existing detected, no insert attempted.

### 5. Docs
- `DOCUMENTATION.md` — add v2.68.1 entry under KRA Rollover describing the idempotency fix.
- `POLICY.md` — add line: "Rollover is idempotent. Duplicate target KPIs are silently skipped and reported as `duplicates_skipped`."

## UI Changes

None to the dialog. The result toast string changes from `Rollover Failed — Edge Function returned a non-2xx status code` to `Rollover complete — X copied, Y duplicates skipped`. No layout/responsive impact.

## Out of Scope

- Re-architecting frequency resolution.
- UI redesign of the rollover dialog.
- Backfilling historical failed `kra_rollover_logs` entries.

## Open Question

Before I implement, confirm:

**Should the rollover succeed-with-skips be surfaced as a green toast (`Completed, X duplicates skipped`) or an amber warning toast?** Default: green success with a subtle "X duplicates skipped" subtext.
