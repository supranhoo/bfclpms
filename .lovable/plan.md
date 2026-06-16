## Problem

In the Bulk Review side drawer (`BulkCellDrawer`), the reviewer sees **"Manual rating (0–5)"** even when the KPI has a proper scoring logic. The dashboard / single-cell scorecard correctly drives the score from:
- Achieved value → R5..R0 thresholds (numeric KPIs), or
- Yes/No selection (binary KPIs), or
- Tier selection (tiered KPIs).

Bulk Review must behave identically — the reviewer should never type a raw 0–5 when the KPI has a defined scoring logic.

## Root Cause

`BulkCellDrawer.tsx` decides whether to show the achievement-based input via:

```ts
const hasThresholds = [r0..r5].some(v => v !== null && v !== '' );
```

This check **ignores qualitative KPIs** (`uom_type = 'binary' | 'tiered'`), whose scoring lives in `qualitative_options`, not in R0..R5. For those KPIs `hasThresholds = false`, so the drawer auto-flips to Manual mode (line 115) — which is exactly what the screenshot shows.

`AchievedValueScoreInput` already supports binary + tiered (it renders Yes/No or tier chips and computes the score), so the fix is purely in the gating logic.

## Risk & Impact Report

- **Data Impact:** None. No schema, no RLS, no historical rows touched. Same write path (`achieved_values` map + computed score) already used for numeric KPIs.
- **Workflow Impact:** None. Same roles, same stages, same RPC.
- **UI/UX Impact:** Manual 0–5 input disappears for any KPI that has either numeric thresholds OR qualitative options. The "Use manual 0–5 rating instead" escape hatch is preserved for the rare case of thresholdless KPIs (and as a recoverable fallback).
- **Regression Risk:** Low. Single-cell scorecards already use the same component with the same inputs; we're just routing Bulk Review through it for qualitative KPIs too.
- **Scalability:** No change to data volume or queries.
- **Mitigation:** Unit tests for the new gating predicate covering numeric / binary / tiered / thresholdless KPIs.

## Plan

### 1. Extract a single predicate `kpiHasScoringLogic(kpi)`

New helper in `src/lib/reviewScoring.ts` (or co-located if already present):

```ts
export function kpiHasScoringLogic(kpi: {
  uom_type?: string | null;
  qualitative_options?: unknown[] | null;
  r0?: string | null; r1?: string | null; r2?: string | null;
  r3?: string | null; r4?: string | null; r5?: string | null;
}): boolean {
  const uom = kpi?.uom_type ?? 'numeric';
  if (uom === 'binary' || uom === 'tiered') {
    return Array.isArray(kpi.qualitative_options) && kpi.qualitative_options.length > 0;
  }
  return [kpi.r0, kpi.r1, kpi.r2, kpi.r3, kpi.r4, kpi.r5]
    .some(v => v !== null && v !== undefined && v !== '');
}
```

This becomes the **SSOT** for "does this KPI have an automated scoring mechanism?" Reused anywhere we need to decide between auto vs manual entry.

### 2. Wire it into `BulkCellDrawer.tsx`

- Replace the inline `hasThresholds` memo with `kpiHasScoringLogic(kpiDetail)`.
- Rename the local variable to `hasScoringLogic` for clarity.
- All three gates (render `AchievedValueScoreInput`, render manual fallback, auto-enable manual mode in the seeding `useEffect`) use the new flag — no other changes.
- Toggle label updated: "Use manual 0–5 rating instead" remains, but only appears as an explicit reviewer escape; default is always auto.

### 3. Defensive guard on the write payload

`handleWrite` already sends `achieved_values` only when `!manualMode`. No change needed, but add an assertion-style comment that links to POLICY §dashboard-scoring-parity.

### 4. Tests (`src/test/reviewScoring.test.ts`, new)

- numeric KPI with R5..R0 → true
- numeric KPI with all R blank → false
- binary KPI with `qualitative_options=[{label:'Yes',score:5},{label:'No',score:0}]` → true
- binary KPI with empty `qualitative_options` → false
- tiered KPI with 3 tiers → true
- unknown uom_type defaults to numeric branch

Plus a render test for `BulkCellDrawer` (or a focused logic test on the gating function) verifying a binary KPI no longer falls back to Manual 0–5.

### 5. Docs / Policy sync

- `DOCUMENTATION.md` → Bulk Review section: note that the cell drawer uses `kpiHasScoringLogic` and mirrors dashboard scoring for numeric, binary, and tiered KPIs.
- `POLICY.md` → new clause **§BULK-REVIEW-SCORING-PARITY**: "The Bulk Review cell drawer MUST present the same scoring input as the single-cell scorecard for the KPI's `uom_type`. Manual 0–5 entry is allowed only as an explicit reviewer override, or when the KPI has neither numeric thresholds nor qualitative options defined."
- Bump `DOCUMENTATION.md` version + changelog entry.

## Out of Scope

- No changes to `AchievedValueScoreInput` itself.
- No changes to the write RPC, validators, or RLS.
- No changes to single-cell scorecards (they already behave correctly).
- No visual redesign of the drawer beyond swapping the input block.

## Rollback

Single-file revert of `BulkCellDrawer.tsx` + delete the helper + test files. No DB migration to roll back.
