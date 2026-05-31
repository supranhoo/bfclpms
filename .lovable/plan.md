## Goal
Reframe the "Increment Eligibility Criteria" module as **Increment Ineligibility Criteria** across UI, engine, and exports — without changing schema, thresholds, scopes, audit history, or downstream PMS/slab/method logic.

## Risk & Impact
- **Data**: No schema change. Existing rows in `increment_eligibility_*` and `increment_eligibility_exclusions` stay as-is (internal key names retained for back-compat; only display labels change).
- **Workflow**: Engine already treats criteria breach → `ineligible`. Logic stays generic over `criteria[]` (any future row in the same table is auto-applied). No new hardcoding.
- **UI**: Tab label, section header, descriptions, button labels, exempt-card wording, confirm-dialog copy all updated.
- **Regression**: PMS missing remains `no_score` (separate bucket), not an "ineligibility reason". Criteria-exempt continues to bypass criteria block only.

## Changes

### 1. UI relabeling (presentation only)
**`src/components/admin/scoring/IncrementEligibilitySection.tsx`**
- Header: `Increment Eligibility Criteria` → `Increment Ineligibility Criteria`
- Description → "These rules disqualify employees from increment when configured thresholds are breached. Employees who do not breach these rules continue through PMS score, slab, and increment method calculation."
- Button + dialog title: `Add Criterion` → `Add Ineligibility Criterion` / `Edit Ineligibility Criterion`
- Empty-state copy updated accordingly.

**`src/components/admin/scoring/ExclusionsCard.tsx`**
- Card heading: `Criteria-Exempt Employees` → `Ineligibility Criteria Exempt Employees`
- Intro paragraph rewritten: "These employees bypass the Increment Ineligibility Criteria only. They remain subject to PMS score, slab, increment method, salary inputs, and confirmation-increment rules."
- Delete-confirm dialog copy updated ("…governed by the Increment Ineligibility Criteria for {year}").

**`src/pages/admin/SystemSettings.tsx`** (Increment tab strip)
- Subtab label `Eligibility Criteria` → `Ineligibility Criteria` (route/key unchanged).

### 2. Run Details + Excel wording
**`src/pages/incentive/IncrementInputs.tsx`**
- Table column header `Ineligibility Reason` (verify; already implied) and badge legend tweak: ineligible badge subtitled "criterion breached".
- Excel export header for `ineligibility_reason` → "Ineligibility Reason (Criterion Breached)". Ensure rows where `eligibility_status === 'no_score'` export an empty `ineligibility_reason` (PMS-missing is not an ineligibility reason — only the existing `no_score` bucket carries that meaning).

### 3. Engine (no behavior change, copy + safety only)
**`supabase/functions/compute-increment/index.ts`**
- Confirm criteria loop already iterates ALL active `criteria` rows generically (it does, lines 527–541) — leave logic untouched.
- When `pmsScore === null`, keep `eligibility = 'no_score'` and `reason = 'No PMS score found'` (internal). Do NOT surface this string in the `ineligibility_reason` Excel column (handled in step 2 by export-side filter).
- Comment block at line 488 reworded to "Ineligibility-criteria-exempt list".

### 4. Tests
- Add `src/test/incrementIneligibilityLabels.test.tsx` snapshot-style assertion that section header + button render with new wording.
- Extend `supabase/functions/compute-increment/criteria_exempt_test.ts` with a source-level assertion that the criteria loop remains generic (no hardcoded keys in the breach check) so future criteria automatically participate.
- Pure-logic test in `src/test/incrementEligibility.test.ts` verifying `evaluateIncrementEligibility` with a brand-new criterion_key (e.g. `late_arrivals`) flips result to ineligible — proves genericity.

### 5. Docs & memory
- Update `DOCUMENTATION.md` + `POLICY.md`: rename section, restate the rule ("any active criterion breach ⇒ ineligible, eligible % = 0; criteria-exempt bypasses only this block").
- Update `mem/features/admin/increment-eligibility-exclusions` to reflect new wording.
- New ADR `docs/adr/ADR-069.md` capturing the rename rationale and back-compat decision (internal table/column names retained).

## Out of scope
- PMS score derivation, slabs, rating bands, increment methods, confirmation-increment adjuster — unchanged.
- Database schema, RLS, audit trail, exclusions table — unchanged.
- `no_score` bucket semantics — unchanged (still distinct from ineligible).

## Rollback
Pure presentation + comment changes outside the engine; revert the touched files. Engine criteria loop is unchanged, so historical runs remain reproducible.