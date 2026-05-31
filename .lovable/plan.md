
## Goal
Prevent duplicate increment benefits when an employee already received a salary revision on confirmation from Trainee. Calculate only the **balance eligible period** at the annual increment cycle. Build as a **configuration-driven rule engine** (no hardcoded trainee logic), scoped by Company / Category / Level / Assessment Year.

## Risk & Impact Report
- **Data**: Adds new employee fields (confirmation date, increment-on-confirmation flag, effective date, previous status). Additive, nullable, no historical breakage.
- **Workflow**: Affects only increment computation. Existing eligibility, slab, and method logic untouched — adjustment runs as a pre-step modifier on `eligible_months`.
- **UI/UX**: One new tab under System Settings → Increment ("Confirmation Adjustment"). One new section on Employee Profile (Employment Lifecycle). Increment report gets 6 new columns.
- **Regression**: Low. When config = "Ignore Confirmation Increment" (the default seed), behavior is identical to today.
- **Scalability**: Adjustment is per-employee, O(1) lookup against config table. Report columns reuse existing pagination.
- **Mitigation**: Feature is opt-in per scope. Pure function with full unit-test matrix covering all 4 treatments × the 3 user-supplied scenarios.

## Schema Changes (additive)

**`employees` — new nullable columns**
- `previous_employment_status` text
- `confirmation_date` date
- `confirmation_increment_granted` boolean default false
- `confirmation_increment_effective_date` date
(DOJ and current employment status already exist.)

**New table `confirmation_increment_rules`** — scope-keyed rule config
- `assessment_year` text (required)
- `company_id`, `category_id`, `level_id` (nullable → wildcard match)
- `treatment` enum: `ignore` | `adjust_covered_period` | `shift_next_cycle` | `carry_forward_uncovered`
- `version`, `status` (draft/active/archived), `created_by`, audit timestamps
- Unique active row per (AY, company, category, level)
- Standard GRANTs + RLS (Admin write, authenticated read)

**New table `confirmation_increment_adjustments`** — immutable audit per run
- `employee_id`, `assessment_year`, `run_id`
- `treatment_applied`, `period_covered_months`, `balance_eligible_months`, `carry_forward_months`, `final_eligible_months`
- `inputs_snapshot` jsonb, `created_at`
- RLS: Admin + Management read, service_role write

## Rule Engine (pure module)
**`src/lib/confirmationIncrementAdjuster.ts`**

Input: `{ employee, assessmentCycleStart, assessmentCycleEnd, eligibilityCutoff, rule }`
Output: `{ treatment, periodCoveredMonths, balanceEligibleMonths, carryForwardMonths, finalEligibleMonths, adjustmentReason }`

Treatment behavior:
- **ignore** → finalEligible = naive months (today's behavior)
- **adjust_covered_period** → subtract months from DOJ→confirmation increment date that fall inside the assessment cycle
- **shift_next_cycle** → finalEligible = 0 this AY; flag employee for normal cycle next AY
- **carry_forward_uncovered** → current-cycle balance + previous-cycle uncovered tail (read from prior `confirmation_increment_adjustments` row)

All month math via existing fiscal helpers; no Date math inline.

## Integration Points
1. `compute-increment` edge function — resolve rule, call adjuster, persist adjustment row, pass `finalEligibleMonths` into existing slab/method calc.
2. `useIncrementInputs` — surface adjustment output for the report.
3. Increment report — add 6 columns listed in spec (Confirmation Granted, Date, Period Covered, Balance, Carry Forward, Final Months, Treatment Applied).

## UI Changes

### A) System Settings → Increment → new 5th tab "Confirmation Adjustment"
```text
┌─ System Settings ─────────────────────────────────────────────┐
│ [Eligibility] [Method] [General] [Slabs] [Confirmation Adj.]  │ ← NEW tab
├───────────────────────────────────────────────────────────────┤
│ Assessment Year: [2025-26 ▾]   Scope: Company/Cat/Level ▾     │
│                                                               │
│ Treatment for confirmation increments:                        │
│  ( ) Ignore Confirmation Increment            (default)       │
│  ( ) Adjust Covered Period                                    │
│  ( ) Shift Employee to Next Normal Cycle                      │
│  ( ) Carry Forward Uncovered Period                           │
│                                                               │
│ Notes: [____________________________________________]         │
│                                                               │
│ Version History (collapsible)                                 │
│ [Copy from previous year]            [Save as new version]    │
└───────────────────────────────────────────────────────────────┘
```

### B) Employee Profile → new card "Employment Lifecycle"
```text
┌─ Employment Lifecycle ─────────────────────────┐
│ Previous Status   : Trainee                    │
│ Current Status    : Confirmed                  │
│ Date of Joining   : 01-Dec-2024                │
│ Confirmation Date : 01-Dec-2025                │
│ Conf. Increment   : ☑ Granted                  │
│ Effective Date    : 01-Dec-2025                │
└────────────────────────────────────────────────┘
```

### C) Increment Inputs report — 6 appended columns
```text
… | Conf.Inc? | Conf.Date | Period Covered | Balance | Carry Fwd | Final Months | Treatment
```
Existing pagination unchanged.

## Tests
- `confirmationIncrementAdjuster.test.ts` — all 3 user scenarios + 4 treatments + edge cases (no confirmation date, confirmation outside cycle, missing rule → default ignore).
- `rule resolution` test — scope cascade (Level → Category → Company → Global).
- Regression test in `bugBountyFixes.test.ts` locking Scenario 1 / 2 / 3 outputs.

## SSOT Updates
- `DOCUMENTATION.md` → new section "Confirmation Increment Adjustment Engine" with treatment matrix.
- `POLICY.md` → policy entry + Version History append.
- New memory file `mem/features/increment/confirmation-adjustment-engine`.

## Rollout
1. Migration (additive cols + 2 tables + RLS + GRANTs) — reversible.
2. Default-seed `treatment = 'ignore'` for current AY → zero behavior change on deploy.
3. Admin opts in per scope when ready.

## Not Applicable
- Auth / payment / storage changes.
