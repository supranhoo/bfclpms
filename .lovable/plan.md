# Joining Month Cutoff — Universal Scope + Final Eligible Months Fix

## Problem

1. **Final Eligible Months shows `11.17`** — it currently uses the continuous-day `monthsServed` (days/30) value, ignoring the configured Joining Month Cutoff Day. With cutoff = 15 and DOJ before the cutoff day, the AY-bounded inclusive month count should be a whole `11` (e.g. Aug→Jun), not `11.17`.
2. **Cutoff field is hidden inside the Prorated DOJ card** — but DOJ-month inclusion is a calendar concept that also affects Custom Service-Period Slabs (slab matching by months) and the displayed eligibility/period for Full Increment. It must be configurable once, independently of method.

## Risk & Impact

- **Data**: Reuses existing `increment_method_configs.joining_month_cutoff_day` column. No schema migration. Existing rows already carry the value (default 15). Persist it for every method, not only `prorated_doj`.
- **Workflow**: Recomputes `final_eligible_months` and (for `custom` method) slab match using the AY-bounded whole-month count. Historical saved runs are not retroactively recomputed.
- **UI/UX**: New independent card above the Method cards; cutoff input removed from inside the Prorated DOJ card.
- **Regression**: Confirmation-increment adjuster currently consumes `naiveEligibleMonths`. Switching its input to the cutoff-aware whole months changes `period_covered_months`, `balance_eligible_months`, and `final_eligible_months` for any prorated-affected employee. Mitigated by full unit-test coverage and explicit fallback when `p.doj` is missing.
- **Scalability**: Pure in-memory math; zero query change.
- **Rollback**: Revert the edge function + UI file; column stays.

## UI Changes

Location: **System Settings → Increment → Increment Method** (`IncrementMethodSection.tsx`).

Layout (top → bottom):
```text
┌──────────────────────────────────────────────────┐
│  Joining Month Cutoff Day      [ 15 ]  (1–31)    │  ← NEW independent card
│  Applies to ALL increment methods. DOJ day <     │
│  cutoff ⇒ joining month counted; DOJ day ≥       │
│  cutoff ⇒ next month counted.                    │
└──────────────────────────────────────────────────┘
┌─────────────┬───────────────────┬───────────────┐
│ Full        │ Prorated by DOJ   │ Custom Slabs  │  ← existing radio cards
│             │ (no cutoff field) │               │
└─────────────┴───────────────────┴───────────────┘
```
- Numeric `Input` (1–31), helper text, "Reset to 15" link.
- Cutoff card always visible regardless of selected method.
- Removed from inside the Prorated DOJ card.
- `handleSave` always passes `joiningMonthCutoffDay`.

Location: **Calculate Increment % → Run Details** (`IncrementInputs.tsx`).
- `FINAL ELIGIBLE MONTHS` column now displays a **whole number** (the cutoff-aware AY-bounded count). Row in the example becomes `11`.
- `METHOD` column note appended with cutoff decision for `prorated_doj` and `custom` (already implemented for prorated; extend to custom).

## Implementation

### 1. Hook — `src/hooks/useIncrementMethod.ts`
- Drop the `method === 'prorated_doj'` conditional in both `useSaveIncrementMethod` and `useCopyIncrementMethodFromYear`. Persist `joining_month_cutoff_day` for every method (default 15 when null).

### 2. UI — `src/components/admin/scoring/IncrementMethodSection.tsx`
- Render a new `<Card>` ("Joining Month Cutoff Day") above the radio group, always visible.
- Remove the cutoff `<Input>` block from the Prorated DOJ card.
- Validation: 1–31 integer, required.

### 3. Edge function — `supabase/functions/compute-increment/index.ts`
- Compute `ayMonths = monthsServedInAY(doj, cutoffDay, ayStart, ayEnd, validationDate)` **once per employee** when `p.doj` is present, **before** the confirmation adjuster runs. Fallback to `monthsServed` (legacy continuous) when DOJ is absent.
- `naiveEligibleMonths = ayMonths.months` (whole-number, clamped 0..12). Feed to `adjustConfirmationIncrement`. Result: `final_eligible_months` is a whole integer.
- Method engine:
  - `full`: unchanged eligibility%, but `final_eligible_months` already correct via the change above.
  - `prorated_doj`: keep current behaviour (already uses `r.months`).
  - `custom`: switch slab match input from `monthsServed` (continuous) to `ayMonths.months` (cutoff-aware) so the configured slab boundaries map to the same calendar concept admins see in the cutoff card.
- Persist the cutoff decision string in `inputs_snapshot.cutoff_decision` for traceability.

### 4. Tests
- Extend `supabase/functions/compute-increment/joining_month_cutoff_test.ts`:
  - DOJ 14 Aug, cutoff 15 → `final_eligible_months = 11`, eligible% = `slab × 11/12`.
  - DOJ 15 Aug, cutoff 15 → `final_eligible_months = 10`.
  - Custom method, DOJ 14 Aug, cutoff 15, slab `[10–12)=100%` → matches slab using `ayMonths.months=11`.
  - Full method → eligible% unchanged, `final_eligible_months` reflects cutoff-aware count.
- New `src/test/incrementMethodCutoffPersistence.test.ts`: asserts the save hook writes `joining_month_cutoff_day` for all three method values.

### 5. Docs
- `DOCUMENTATION.md`: section "Increment Method → Joining Month Cutoff Day" updated to "independent of method, applies to all".
- `POLICY.md`: add policy item "Joining Month Cutoff Day governs the AY-bounded whole-month count used by every increment method and by Final Eligible Months."

## Acceptance

- Cutoff card visible at top of Increment Method page; persists for any method.
- `FINAL ELIGIBLE MONTHS` shows whole integer (`11` for the reported employee).
- Eligible % for prorated DOJ uses the same whole-month count.
- Custom-slab matching uses the cutoff-aware month count.
- All new + existing tests pass.
