## Root-Cause Analysis (RCA)

After querying the production data for **March 2026**, I confirmed each issue stems from a different defect in `EmployeeSelectorGrid.tsx` and the score-signature seed in `useProfilesByWorkflowStage`. Database verified:

- **Anant Shankar Shet (200208)** — VP. His resolved workflow returns `[kra_set, self_review, audit, management_review, approved]` — **no `hr_pms_review` stage**. He has 36 KPIs, of which 5 carry a stale `hr_pms_score` (set on 2026-04-22) — likely from a prior workflow template before HR PMS was removed for VPs.
- **Devendra Kumar Yadav (100707)** — Asst. Manager. All 22 KPIs are `status='approved'`, all `review_submissions.is_na=true`, all stage scores NULL.
- **Roster math**: 54 visible employees, 798 KPIs, 518 KPIs with `hr_pms_score IS NOT NULL`. Only 470 of those 518 belong to employees whose current workflow includes `hr_pms_review`.

### Issue-by-issue diagnosis

| # | Symptom | Root cause | File / line |
|---|---|---|---|
| 1 | "HR PMS Reviewed" shows **184**, expected ~470–518 | The stat loop early-returns at `if (hrIdx === -1) return;` for employees whose workflow lacks HR PMS, **before** the `hr_pms_score` counter on the next line — but those same employees are still seeded into the visible roster (798 / 54). N/A KPIs are also not credited. | `EmployeeSelectorGrid.tsx:980-993` |
| 2 | "Total KPIs" **798** is inflated | The roster includes employees seeded purely by the historical `hr_pms_score` signature (e.g. Anant, +36 KPIs) even though their *current* workflow no longer contains HR PMS. | `useOrganization.ts:417-475` (score-signature seed never re-validates against the current workflow) |
| 3 | Anant Shankar Shet appears in HR PMS panel | Same as #2 — the `scoreSigSeededIds` branch admits him on the strength of 5 stale `hr_pms_score` rows, despite his current workflow excluding the HR PMS stage. | `useOrganization.ts:469-475` |
| 4 | Devendra shows blank: no "reviewed" pill, no rating badge | (a) Progress bar `done` counter at `getEmployeeKpiStats` line 492-494 only credits KPIs with `hr_pms_score IS NOT NULL`; **N/A KPIs are excluded** even though "Approve as N/A" *is* a completed HR PMS action. (b) `useEmployeeScoresForPeriod.ts:108` correctly excludes N/A from the weighted average → empty badge — this is correct behavior but combined with (a) the card looks completely empty. | `EmployeeSelectorGrid.tsx:492-494, 952-953, 992-993, 1025-1026` |

---

## Proposed Fix

### A. Treat "Approved as N/A" as a completed reviewer action
A KPI marked N/A and approved by HR PMS *is* a reviewed KPI — it just has no score. Update the "reviewed" signature in three reviewer panels (HR PMS, Audit, Management) to credit `(hr_pms_score IS NOT NULL OR is_na = true AND status is at-or-past the stage)`.

- `submissionScoreMap` already contains the row but **does not select `is_na`**. Extend `useReviewSubmissionScoresByKpiIds` (`src/hooks/useKpis.ts:354-371`) to also return `is_na`.
- Update the "reviewed" predicate in:
  - `EmployeeSelectorGrid.tsx:492-495` (HR PMS card progress bar `scoreReviewed`)
  - `EmployeeSelectorGrid.tsx:508-511` (Audit card progress bar)
  - `EmployeeSelectorGrid.tsx:567-570` (Management card progress bar)
  - `EmployeeSelectorGrid.tsx:951-953` (Auditor Reviewed stat card)
  - `EmployeeSelectorGrid.tsx:991-993` (HR PMS Reviewed stat card)
  - `EmployeeSelectorGrid.tsx:1025-1026` (Management Reviewed stat card)

This will give Devendra `22/22` with a "22 reviewed" pill.

### B. Fix the HR PMS Reviewed counter to also count employees outside HR PMS workflow whose KPIs were already scored at HR PMS
Move the `hr_pms_score` counter (line 992-993) **before** the `if (hrIdx === -1) return;` early-return at line 980-981, so historically-scored KPIs still contribute to "HR PMS Reviewed". Apply the same restructure to the Audit (line 939-953) and Management branches for symmetry.

### C. Exclude employees from the HR PMS roster whose CURRENT workflow no longer contains the stage
This is the SSOT fix for issues #2 and #3. Anant should not appear in the HR PMS panel even if a stale score exists.

In `useProfilesByWorkflowStage` (`src/hooks/useOrganization.ts:469-475`), change the inclusion rule:

```ts
const filtered = profiles.filter(p => {
  const empStages = stagesMap.get(p.id);
  // Authoritative check: current resolved workflow MUST include the stage
  if (empStages) return empStages.includes(stage);
  // Only fall back to score-signature / KPI-presence seeds when RPC failed for this employee
  if (seededIds.has(p.id)) return true;
  if (scoreSigSeededIds.has(p.id)) return true;
  return fallbackStages.includes(stage);
});
```

Net effect: Anant disappears from the HR PMS roster; `Total KPIs` drops from 798 → ~595 (matches employees whose current workflow includes HR PMS); `Total Employees` drops 54 → 42.

### D. Tooltip clarification on the stat cards
Update the "HR PMS Reviewed" and "Total KPIs" tooltips to say *"Counted across employees whose current workflow includes the HR PMS stage; N/A approvals count as reviewed."* — keeps governance transparent.

---

## Files to edit

- `src/hooks/useKpis.ts` — extend `useReviewSubmissionScoresByKpiIds` select + return type with `is_na`
- `src/components/review/EmployeeSelectorGrid.tsx` — update 6 reviewed-signature predicates + restructure the HR PMS / Audit stat loops to count score-signature regardless of early-return
- `src/hooks/useOrganization.ts` — tighten roster inclusion rule (workflow-first, seeds as fallback only)
- `src/test/bugBountyFixes.test.ts` — add **BUG-046** assertions:
  - `useReviewSubmissionScoresByKpiIds` selects `is_na`
  - HR PMS reviewed predicate credits `hr_pms_score != null OR is_na === true`
  - `useProfilesByWorkflowStage` filter prefers resolved workflow over score signature
- `POLICY.md` — add **§115 — HR PMS Roster Authority**: current resolved workflow is the SSOT; N/A approvals count as reviewed events
- `DOCUMENTATION.md` — bump to **v2.66.7.48**, append change log entry
- `mem/features/review/unified-scorecard-component` — add note on N/A-as-reviewed

---

## Risk & Impact Report

- **Data Impact**: None — read-only logic changes; no schema, RLS, or data mutations.
- **Workflow Impact**: HR PMS / Audit / Management dashboards become stricter (employees outside the stage's current workflow disappear). Aligns with POLICY §107 (workflow-stage authority).
- **UI/UX**: Devendra-style N/A-only employees will now show the green "X reviewed" pill and full progress bar; cards no longer look empty.
- **Regression Risk**:
  - Stat-card numbers will change — *expected*. Visible deltas: HR PMS Reviewed 184 → ~470, Total Employees 54 → ~42, Total KPIs 798 → ~595.
  - Other reviewer panels (Audit, Management) get the same treatment — verify with regression tests.
- **Mitigation**: BUG-046 unit tests pin the new predicates and roster rule.
