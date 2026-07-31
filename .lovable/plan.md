# Eligibility Criteria + Exemption Approval in Bell Curve Analysis (ADR-221)

## What you get

1. **Eligibility becomes visible in Bell Curve Analysis** — a new "Eligibility" filter next to PMS Grade / Scoring Source (All · Eligible · Ineligible · Exempted), a KPI card ("Ineligible / Exempted"), and eligibility columns inside the heat-map drill-down list.
2. **Exemption approval workflow** — an admin/HR can request and approve an exemption for an employee who failed an *exemptable* criterion (Absent Days, LWP Days). Criteria marked non-exemptable (Disciplinary Action, 6-Month Completion) can never be exempted — the approve action is blocked in the UI **and** in the database.
3. **Downstream consistency** — the exemption result feeds the same place the rating/slab already flow: bell curve bands, drill-down rows, Annual Review Report grid, Excel/PDF exports and the increment slab resolution.

## Risk & Impact Report

- **Data impact:** additive only. One new table (`annual_review_eligibility_exemptions`) and one new master table for exemptable policy. No existing column is dropped; `annual_review_instances.eligibility_inputs` and template `sections.eligibility_criteria` stay as-is (SSOT for the answers themselves).
- **Workflow impact:** a new approval step that does not block any review stage — it only changes eligibility verdict and (optionally) the increment slab. Reviews already Completed are unaffected structurally.
- **UI/UX impact:** one extra filter chip row item, one KPI card, 2 columns + 1 action in the drill-down. No layout restructure.
- **Regression risk:** medium-low. Highest risk is the effective-eligibility resolver disagreeing between UI and export; mitigated by a single SSOT module used by every consumer (same pattern as `effectiveRating.ts` in ADR-220).
- **Scalability:** exemptions are fetched once per cycle as a keyed map (`instance_id → exemption`), same as the calibration hook; no per-row queries. Drill-down list keeps its 25-row pagination.
- **Rollback:** revert the touched files; the two new tables can be left in place harmlessly (resolver falls back to computed eligibility when no rows exist).

## Zero-hardcoding: which criteria are exemptable

"Absent days / LWP exemptable, disciplinary and 6-month never" is a **business policy**, so it is stored as master data, not in code:

- Add an `exemptable` flag on each template eligibility criterion (authored in the template editor), plus
- a master table `annual_review_eligibility_exemption_policy` (normalised question name → exemptable yes/no + reason-required flag) used as the fallback for criteria authored before this change.
- Seed it with: `absent days` → exemptable, `lwp days` / `leave without pay` → exemptable, `disciplinary*` → not exemptable, `*month completion` / tenure criteria → not exemptable.

Admins can change this later from the master screen without a code change.

## Effective eligibility model

```text
computed  = evaluateEligibility(template criteria, eligibility_inputs)   (existing SSOT)
exemption = approved exemption row for (instance, criterion)             (new)

effective:
  Eligible               → no failures
  Exempted (Eligible)    → every failure is covered by an APPROVED exemption
  Ineligible             → at least one failure has no approved exemption
```

The resolver never exempts a failure whose criterion is non-exemptable, even if a row somehow exists — a DB trigger rejects such rows at insert time as well.

## Implementation

### 1. Database (one migration)

- `annual_review_eligibility_exemption_policy` — master data: `question_key`, `label`, `is_exemptable`, `requires_reason`, timestamps. Admin-managed.
- `annual_review_eligibility_exemptions` — `instance_id`, `cycle_id`, `employee_id`, `criterion_id`, `criterion_name`, `status` (`pending` | `approved` | `rejected`), `reason`, `requested_by/at`, `decided_by/at`, `decision_note`, unique on (`instance_id`, `criterion_id`).
- GRANTs + RLS: employees never write; managers/HR can request within their scope; only Admin / HR-PMS / Management can approve. Read scoped to whoever can already see the instance.
- Trigger `trg_ar_exemption_guard`: rejects a `pending`/`approved` row when the criterion resolves to non-exemptable, and rejects self-approval.
- Immutable audit rows written on every request/decision (reuses the existing annual-review audit table).

### 2. Logic SSOT (new/edited files)

- `src/lib/annualReview/effectiveEligibility.ts` **(new)** — `resolveEffectiveEligibility(criteria, inputs, exemptions, policy)` returning `{ status: 'eligible' | 'exempted' | 'ineligible', failures[], exemptedFailures[], blockingFailures[] }` and `isExemptable(criterion, policy)`.
- `src/lib/annualReview/bellCurve.ts` — add `eligibility_status` to `BellCurveInput` / `BandEmployee` and a `matchesEligibility(row, filter)` predicate (mirrors `matchesScoringSource`).
- `src/lib/annualReview/ratingSlab.ts` — slab resolution respects the eligibility decision (see open decision A).

### 3. Data plumbing

- `src/hooks/annualReview/useEligibilityExemptions.ts` **(new)** — cycle-scoped fetch of exemptions + policy, cached, keyed map.
- `src/services/annualReview/eligibilityExemptions.ts` **(new)** — request / approve / reject service calls, all through RPCs with try-catch and toast feedback.
- `src/services/annualReview/eligibilityReportColumns.ts` — cells gain an `(Exempted)` marker; summary becomes `Pass` / `Fail (…)` / `Exempted (…)`.

### 4. UI

- `BellCurveTab.tsx` — "Eligibility" select in the filter row; new KPI card; filter applied before banding so charts, heat map and exports all agree; the value joins `drilldownResetKey`.
- `BandEmployeeList.tsx` — new columns **Eligibility** (badge: Eligible / Exempted / Ineligible with failed-criteria tooltip) and, for admins, an **Exemption** action opening the dialog. Non-exemptable failures render the reason as disabled text.
- `ExemptionDialog.tsx` **(new)** — lists the employee's failed criteria, shows which are exemptable, captures reason, supports request and (for approvers) approve/reject with note. Bulk mode over selected rows reuses the same dialog.
- `ComprehensiveTab.tsx` / `AnnualReviewReport.tsx` grid — Eligibility column shows the effective status + Exempted badge.
- `bellCurveExport.ts`, `ComprehensiveExport.ts` — Eligibility status, failed criteria, exemption reason and approver columns.
- Admin master screen for the exemptable policy table (small CRUD panel in Annual Review settings).

### 5. Tests

- `effectiveEligibility.test.ts`: exempted vs ineligible resolution, non-exemptable failure never exempted, mixed failures, missing answers.
- Bell curve tests: eligibility filter changes counts and drill-down list consistently.
- Service test: approval blocked for disciplinary / tenure criteria.
- Mock data covering an employee with absent-days breach + approved exemption, and one with a disciplinary breach.

### 6. Docs

`docs/adr/ADR-221.md`, POLICY §AR-ELIGIBILITY-EXEMPTION, DOCUMENTATION.md version history.

## Open decisions to brainstorm

- **A. Does ineligibility change the increment slab?** Option 1: eligibility is informational only in this report. Option 2 (matches the increment engine): ineligible ⇒ slab 0% and the employee moves into the 0% band on the bell curve; exempted ⇒ normal slab. My recommendation is Option 2, since the slab column already means "increment %".
- **B. Approver role.** Admin only, or Admin + HR-PMS + Management? Recommend: request by Admin/HR, approve by Admin or Management, no self-approval.
- **C. Scope of an exemption.** Per criterion per cycle (recommended) vs whole-employee blanket exemption for the cycle.
- **D. Where exemptions can be raised.** Only from the bell-curve drill-down, or also from the individual review detail page and the Annual Review Report grid? Recommend all three, one shared dialog.
- **E. Completed reviews.** Should an exemption be allowed after the review is Completed? Recommend yes (it does not touch scores), with an audit entry.
