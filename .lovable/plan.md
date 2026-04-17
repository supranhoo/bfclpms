

## Plan: Fix "Something went wrong" After Clicking Compute

### RCA — Most Likely Causes
The error in screenshot 701 is the `ErrorBoundary` fallback in `DashboardLayout` triggered by a render-time crash. After clicking **Compute** the only new render paths that activate are:

1. **`IncentiveDryRunDialog`** — opens with the dry-run result.
2. **`MonthlyIncentiveTable`** rows — re-render when records refetch after a non-dry-run compute.

Likely defects in `IncentiveDryRunDialog` (`src/components/incentive/IncentiveDryRunDialog.tsx`):
- **Line 67**: `summary.avg_incentive_percent.toFixed(1)` — crashes if `avg_incentive_percent` is missing/undefined for any reason (e.g., an older cached payload, scope returning 0 records, or shape drift).
- **Line 102**: `r.pms_score?.toFixed(2) ?? r.production_value ?? '—'` — `r.pms_score` from DB can be a **string** (`numeric` columns are returned as strings from PostgREST in some versions). `"7.00".toFixed` is `undefined.toFixed` → `TypeError`.
- **Lines 109/110**: `r.lti_penalty_percent`/`r.pro_rata_factor` likewise can be string from PostgREST → `> 0` works on strings but `.toFixed(2)` crashes.
- **Line 117**: `Math.round(r.incentive_amount!)` — `incentive_amount` can be string too; `Math.round("123.45")` returns `NaN` after coercion in some paths.

Same pattern likely blowing up `MonthlyIncentiveTable.tsx` after refetch:
- **Line 673**: `r.pms_score?.toFixed(2)` — same string-vs-number issue.
- **Line 717**: `Math.round(Number(r.incentive_amount))` — already guarded ✓.

### Fix

**File: `src/components/incentive/IncentiveDryRunDialog.tsx`**
- Wrap all numeric formatting in a `toNum(v)` helper: `Number(v ?? 0)` then format.
- Guard `summary.avg_incentive_percent` with `(summary.avg_incentive_percent ?? 0)`.
- Guard `summary.total_amount` already done (`|| 0`) ✓.
- Render rows with: `toNum(r.pms_score).toFixed(2)`, `toNum(r.pro_rata_factor).toFixed(2)`, `toNum(r.lti_penalty_percent)` for comparisons.
- Empty-records safe path: when `records.length === 0`, show a friendly "No records to compute (filters returned 0 employees)" message instead of the empty table — avoids any future blank-shape crash.

**File: `src/components/incentive/MonthlyIncentiveTable.tsx`**
- Apply the same `toNum()` guard to row cells: `pms_score`, `final_incentive_percent`, `pro_rata_factor`, `lti_penalty_percent`, `incentive_amount`, `base_incentive_percent`. Cells that crash silently when one record has bad shape will take down the whole table → wrap each render in `Number(... ?? 0)`.
- Also guard `slab.min_value`/`slab.max_value` similarly (numeric columns).

**Diagnostics**
- Add a one-time `console.error('Compute payload shape:', { summary, recordSample: result.records?.[0] })` in `handleCompute` so future regressions are easy to diagnose from console logs.

### Files Touched
| File | Change |
|---|---|
| `src/components/incentive/IncentiveDryRunDialog.tsx` | Numeric `toNum()` guards + empty-state path |
| `src/components/incentive/MonthlyIncentiveTable.tsx` | `Number(... ?? 0)` wrap on numeric cells + diagnostic log |

### Risk & Impact
| Area | Impact |
|---|---|
| Data | None — display-only guards |
| Workflow | None |
| UI/UX | Identical when data is valid; resilient when fields are string/null |
| Regression | Very low — purely defensive numeric coercion |
| Mitigation | If real cause is elsewhere, console diagnostic surfaces it on next click |

### Out of Scope
- Edge-function shape changes (already returns numbers)
- Migrating PostgREST numeric → bigint (broader change)

