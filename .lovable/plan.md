## Goal
Make Confirmation Increment Adjustment **scope-aware by company** and **gated by the pre-confirmation status transition**, so the rule only impacts intended employees (e.g. Trainee→Confirmation), and never penalises lateral/probation hires unless explicitly opted-in.

## Assumptions
- The adjuster (`src/lib/confirmationIncrementAdjuster.ts`) is a pure function with no production caller yet — eligibility can be added as a pre-filter without touching downstream callers.
- Pre-confirmation status comes from `profiles.employment_status` (existing master `employment_statuses`, per memory). Post-confirmation = `'Confirmed'`. Today's status + a new optional `previous_employment_status` field will drive transition matching. If unavailable, rule short-circuits to `ignore` (safe default).
- Companies come from existing companies master used in `useCompanies`.
- Backward compatibility: existing rows (no transitions, no company) keep behaving as **Global / Trainee→Confirmation** (current de-facto behaviour).

## Risk & Impact Report
- **Data Impact:** additive columns on `confirmation_increment_rules`; one nullable text column on `profiles`. No destructive change. Existing rules auto-migrated to `applicable_transitions = ['trainee_to_confirmed']` to preserve current behaviour.
- **Workflow Impact:** none — increment engine not yet wired; adjuster gains a guard clause.
- **UI Impact:** Scope section gains Company selector (Global / Selected / Per-company); new "Applicable Confirmation Type(s)" multi-select; summary chip "Rule Applies To: …". Existing radio Treatments untouched.
- **Regression Risk:** Low. Adjuster guard returns naive months when transition not eligible — identical to `ignore`.
- **Scalability:** Rule rows scale O(companies × AY); query already scoped via unique index — no change.
- **Mitigation:** Feature behind backward-compatible defaults; unit tests for every transition × scope combination.

## Plan (Step → Verification)

### 1. Database migration (additive)
- Add to `confirmation_increment_rules`:
  - `applicable_transitions text[] NOT NULL DEFAULT ARRAY['trainee_to_confirmed']`
  - `company_scope_mode text NOT NULL DEFAULT 'global'` CHECK in (`global`, `selected`, `per_company`)
  - `selected_company_ids uuid[] NOT NULL DEFAULT '{}'` (used when mode = `selected`)
- Add to `profiles`: `previous_employment_status text NULL` (captured at confirmation time; nullable so unknown = ineligible).
- Backfill: existing rule rows already default; no data change.
- **Verify:** `psql \d` shows columns; existing `useConfirmationIncrementRule` queries still return rows.

### 2. Hook updates (`src/hooks/useConfirmationIncrementRule.ts`)
- Extend `ConfirmationIncrementRuleRow` with `applicable_transitions`, `company_scope_mode`, `selected_company_ids`.
- Extend `useSaveConfirmationIncrementRule` mutation input + insert payload.
- **Verify:** TS compiles; save round-trips fields.

### 3. Pure adjuster guard (`src/lib/confirmationIncrementAdjuster.ts`)
- Extend `AdjusterInput` with `preConfirmationStatus: string | null` and `rule.applicableTransitions: string[]`.
- At top of `adjustConfirmationIncrement`, if `preConfirmationStatus` doesn't map to a value in `applicableTransitions` (e.g. `Trainee` → `trainee_to_confirmed`, `Probation` → `probation_to_confirmed`), short-circuit with `treatmentApplied = 'ignore'`, `finalEligibleMonths = naive`, reason `"Transition X→Confirmed not in applicability list"`.
- Status→transition mapping table lives next to the adjuster (constants, no hardcoded business policy).
- **Verify:** new unit tests in `confirmationIncrementAdjuster.test.ts` cover: trainee included, probation excluded, probation included, unknown prior status, multi-select.

### 4. UI — `ConfirmationIncrementSection.tsx`
- **Scope block:** add `RadioGroup` (`Global` / `Selected companies` / `Per-company rule`).  
  - `Selected`: `MultiSelect` of companies (uses existing `useCompanies`).  
  - `Per-company`: company `Select` that drives the loaded rule's `company_id` (one rule per company).
- **New "Applicable Confirmation Type(s)" block:** checkbox list — Trainee→Confirmation, Probation→Confirmation, Contract→Confirmation, Apprenticeship→Confirmation. Multi-select, min 1 required to save.
- **Summary chip** under header: `Rule Applies To: Trainee → Confirmation, Probation → Confirmation` (or `None — rule inactive` when empty).
- Save button disabled until ≥1 transition selected.
- Permissions, version history UI, treatment radios — untouched.
- **Verify:** load existing rule → defaults shown as Global + Trainee→Confirmation; save creates new version with selections persisted.

### 5. Docs & Policy
- `DOCUMENTATION.md`: add new fields, UI flow, status mapping table.
- `POLICY.md`: codify "Confirmation increment adjustment only applies when employee's pre-confirmation status transition is in the rule's `applicable_transitions`."
- `docs/adr/ADR-068.md`: decision record.

### 6. Tests
- Adjuster unit tests for eligibility gating (success/skip).
- Hook test for save payload round-trip.

## UI Changes (visible)
```text
Confirmation Increment Adjustment
─────────────────────────────────────────────
Assessment Year [2025-26 ▾]   Scope ▾
   ( ) Global (all companies)
   ( ) Selected companies   [Multi-select ▾]
   ( ) Per-company rule     [Company ▾]

Applicable Confirmation Type(s) *
   [x] Trainee → Confirmation
   [ ] Probation → Confirmation
   [ ] Contract → Confirmation
   [ ] Apprenticeship → Confirmation

Rule Applies To: Trainee → Confirmation

Treatment   ( ) Ignore  ( ) Adjust  ( ) Shift  ( ) Carry Forward
Notes [ ... ]                    [Save as new version]
Version history …
```

## Rollback
Drop the 4 new columns; UI falls back to original Global-only + Trainee behaviour. No data loss.

## Files
- **Migrations (1):** add columns to `confirmation_increment_rules` + `profiles.previous_employment_status`.
- **Edit:** `src/hooks/useConfirmationIncrementRule.ts`, `src/lib/confirmationIncrementAdjuster.ts`, `src/lib/confirmationIncrementAdjuster.test.ts`, `src/components/admin/scoring/ConfirmationIncrementSection.tsx`.
- **New:** `docs/adr/ADR-068.md`; updates to `DOCUMENTATION.md`, `POLICY.md`.

Ready to implement on approval.