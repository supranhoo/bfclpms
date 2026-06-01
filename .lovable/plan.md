## Goal

Add a configurable provision so that employees who join AFTER a configured Increment Eligibility Cutoff Date are skipped for the joining AY, and (when enabled) their unused balance months are carried forward and added to the next AY's eligible months using the next AY's rating/slab.

This is distinct from the existing `joining_month_cutoff_day` (1–31), which only decides whether the GDOJ month itself counts. It must remain unchanged.

## Assumptions

- Cutoff is one full date (month + day) per AY/scope, e.g. 31 Dec. Year is implied by the AY.
- "Post-cutoff" means `GDOJ > cutoffDate` AND `GDOJ` falls inside the joining AY.
- Setting lives on the existing `increment_method_configs` row (same per-AY, per-company scope as the Method tab) — no new scope plumbing.
- Carry-forward affects ONLY service-month counts; PMS score, slab band, criteria, confirmation-adjustment logic stay untouched.
- Default carry-forward = `No` (additive, zero impact on historical runs).
- Next AY's method (full / prorated_doj / custom) decides whether/how the extra months are usable: `full` ignores months by design, `prorated_doj` caps at 12 (carry-forward cannot exceed the prorated ceiling, see Open Question 1), `custom` uses the bumped month count to match its slab.

## Risk & Impact Report

- **Data Impact**: Additive. 3 nullable columns on `increment_method_configs`; 2 nullable columns on `increment_run_items` and `confirmation_increment_adjustments.inputs_snapshot` JSON. No backfill needed; legacy rows behave exactly as today (carry-forward = false, cutoff = null → feature disabled).
- **Workflow Impact**: New admin checkbox + date inputs in the Increment Method tab. No permission changes.
- **UI/UX Impact**: Adds one row to Method tab; adds 3 columns to the Run Details table and 4 columns to Excel exports. No layout regression.
- **Regression Risk**: Low. Engine branch is gated by `carry_forward_post_cutoff = true` AND cutoff present AND GDOJ in joining AY AND GDOJ > cutoff. All other paths unchanged.
- **Scalability Impact**: One extra `select` per run to fetch the prior-AY post-cutoff carry rows (scoped by `assessment_year` and `employee_id IN (...)`). O(n) over the run population, batched.
- **Mitigation**: Feature flag is the config column itself (default false); unit tests cover the 3 examples in the spec plus edge cases.
- **Rollback**: Drop the 3 columns (or set `carry_forward_post_cutoff = false`); engine no-ops.

## Placement Decision

Increment Method tab in System Settings > Increment. Rationale: the rule directly drives "Final Eligible Months" / method math, which is what the Method tab already owns (it also already holds `joining_month_cutoff_day`). General Eligibility tab is about who is allowed, not how months are counted.

## Plan

### 1. Schema (single migration)

```sql
ALTER TABLE public.increment_method_configs
  ADD COLUMN IF NOT EXISTS eligibility_cutoff_month smallint
    CHECK (eligibility_cutoff_month BETWEEN 1 AND 12),
  ADD COLUMN IF NOT EXISTS eligibility_cutoff_day   smallint
    CHECK (eligibility_cutoff_day   BETWEEN 1 AND 31),
  ADD COLUMN IF NOT EXISTS carry_forward_post_cutoff boolean NOT NULL DEFAULT false;

ALTER TABLE public.increment_run_items
  ADD COLUMN IF NOT EXISTS post_cutoff_joiner boolean,
  ADD COLUMN IF NOT EXISTS post_cutoff_carry_forward_months smallint;
```

No new tables, no RLS/GRANT changes (existing row policies cover the columns).

### 2. Pure helper (testable, no DB)

`src/lib/postCutoffCarryForward.ts`

```ts
export interface PostCutoffInput {
  gdoj: Date | null;
  ayStart: Date;           // Jul 1
  ayEnd: Date;             // Jun 30
  cutoffMonth: number | null;   // 1-12
  cutoffDay: number | null;     // 1-31
  carryForwardEnabled: boolean;
}
export interface PostCutoffResult {
  isPostCutoffJoiner: boolean;
  carryForwardMonths: number;   // 0 when disabled or not applicable
  cutoffDateISO: string | null;
  reason: string;               // human-readable for run details
}
export function evaluatePostCutoff(i: PostCutoffInput): PostCutoffResult;
```

Logic:
1. If cutoff month/day missing or `gdoj` missing → `{ isPostCutoffJoiner: false, carryForwardMonths: 0 }`.
2. Cutoff date = `Date(ayStart.year, cutoffMonth-1, cutoffDay)`; if that date < ayStart, roll to next calendar year so it stays inside the AY window.
3. If `gdoj` outside `[ayStart, ayEnd]` → not a post-cutoff scenario.
4. If `gdoj <= cutoffDate` → not post-cutoff; carry = 0.
5. If `gdoj > cutoffDate` → post-cutoff. Carry months = whole months from start of month-after-GDOJ through `ayEnd`, capped at 12.
6. Carry returned ONLY when `carryForwardEnabled`; otherwise carry = 0 but `isPostCutoffJoiner = true` (so we can still surface the reason).

### 3. Edge function (`supabase/functions/compute-increment/index.ts`)

- After resolving `resolvedCfg` per employee, call `evaluatePostCutoff` with the resolved cutoff and `carry_forward_post_cutoff` flag.
- **If post-cutoff joiner**: set `eligibility = 'ineligible'`, `reason = 'Joined after eligibility cutoff (DD-MMM)'`. Persist `post_cutoff_joiner=true`, `post_cutoff_carry_forward_months = result.carryForwardMonths` on `increment_run_items` (and inside `inputs_snapshot`).
- **Carry-forward lookup**: BEFORE the per-employee loop, fetch prior AY (`startYear - 1`) `increment_run_items` rows with `post_cutoff_carry_forward_months > 0` for the same employee population from the most recent *completed* prior run, into a `Map<employee_id, number>`.
- During normal employees' calculation, add the looked-up months to `ayMonths.months` (capped at 12 for `prorated_doj`; uncapped for `custom`). Note the addition in `methodNotes` so it shows in Run Details.
- Persist both numbers (carry IN + carry OUT) in `inputs_snapshot` for audit traceability.

Note: We do NOT mutate the `confirmation_increment_adjustments` table semantics — the existing `carry_forward_months` column there remains confirmation-only.

### 4. UI – Increment Method tab (`src/components/admin/scoring/IncrementMethodSection.tsx`)

Add below the existing "Joining Month Cutoff Day" row:

- **Eligibility Cutoff Date**: a Month dropdown + Day number input (1–31). Helper text: "Employees joining after this date may be excluded from increment in the joining AY."
- **Carry forward post-cutoff joining months to next AY?**: a Switch with Yes/No. Default off. Helper text quoted verbatim from the spec.
- Validation: if Switch=Yes, both month and day must be set (block save with inline error).
- Wire through `useSaveIncrementMethod` and `useCopyIncrementMethodFromYear` so the three new fields are preserved on save and copy.

Mirror the new fields in `IncrementMethodConfigRow` (`src/hooks/useIncrementMethod.ts`).

### 5. Run Details + Excel (`src/pages/incentive/IncrementInputs.tsx`)

- Add three TableHead columns near "Final Eligible Months": **GDOJ**, **Cutoff Date**, **Post-Cutoff Joiner**, **Carried-Forward Months**. Treatment/Reason is already shown via existing `adjustment_reason` / `ineligibility_reason`.
- Excel exports (both `downloadXlsx` calls): add columns **GDOJ, Increment Eligibility Cutoff Date, Post-Cutoff Joiner, Carried Forward Months, Final Eligible Months, Carry Forward Applied, Carry Forward Reason**. Pull from the new `increment_run_items` columns + the config snapshot embedded in the run.

### 6. Tests (Deno + Vitest)

- `supabase/functions/compute-increment/post_cutoff_carry_forward_test.ts` — covers the 3 spec examples + edge cases: cutoff null, carry-off, GDOJ outside AY, prorated_doj cap at 12, custom-method slab bumping, missing GDOJ.
- `src/lib/postCutoffCarryForward.test.ts` — pure helper unit tests.

### 7. Docs

- `DOCUMENTATION.md`: new section under Increment Method.
- `POLICY.md`: append rule + version-history entry.

## UI Changes Summary

- **Location**: System Settings → Increment → "Increment Method" tab, directly below the existing Joining Month Cutoff Day field.
- **Interactions**: Toggling the Switch off disables the date inputs visually; toggling on requires a valid date before Save is enabled.
- **Responsiveness**: Single-row layout on desktop, stacks on mobile (matches existing tab pattern).

## Out of Scope

- Confirmation-Increment Adjustment tab (untouched).
- PMS score / rating slab / criteria evaluation (untouched).
- The pre-existing `joining_month_cutoff_day` (untouched).
- No retroactive recomputation of historical runs.

## Open Questions (please confirm before build)

1. **prorated_doj cap**: when `carry_forward_post_cutoff = true` and the employee in the next AY uses `prorated_doj`, should the engine allow `monthsForMethod > 12` (which would exceed 100% of `slabPercent` — e.g. 18/12 × 10% = 15%), or cap at 12 (carry-forward effectively no-ops for fully-served next-AY employees)? Spec example 1 says "18 months considered for next AY calculation" → I assume **no cap** for `prorated_doj` and `custom`; please confirm.
2. **Scope cascade**: cutoff/carry-forward fields will follow the same scope hierarchy as the rest of `increment_method_configs` (per-AY, optionally per-company). OK?
3. **Multiple runs in prior AY**: when picking "carry IN" months, use the row from the **latest completed** prior-AY run for that employee. Correct?