# Fix: Step Back dialog hides workflow stages that the KPI actually used

## Root Cause Analysis

**Reported case**: Amol Ashok Shivankar — *Stack Emission and PM Monitoring Adherence* — March 2026, currently `approved`. The Target Stage dropdown offers only: KRA Set, Self Review, Manager Review, Skip-Level Review, HR PMS Review. **Audit Review and Management Review are missing.**

**What the database shows**:

| Field            | Value |
|------------------|-------|
| status           | approved |
| self_score       | 5 |
| manager_score    | 5 |
| skip_level_score | NULL |
| hr_pms_score     | NULL |
| **auditor_score**| **0** ← KPI did go through audit |
| management_score | NULL |
| final_score      | 0 |

`get_employee_workflow('Amol')` (no period args) returns:
```
[kra_set, self_review, manager_check, skip_level_check, hr_pms_review, approved]
```
— a **5-stage** workflow with no `audit` and no `management_review`.

**Two compounding defects:**

### Defect A — Period-blind workflow lookup
`AdminStatusStepBackDialog` calls `get_employee_workflow(employee_uuid)` **without `p_review_period` / `p_review_year`**. The RPC therefore skips all the period-specific priority branches and returns the *current* global fallback. If the workflow template was changed since the KPI was reviewed, the dialog shows the new template's stages — not the stages the KPI actually traversed.

### Defect B — Workflow template ignores stages with real data
Even when the resolved workflow doesn't include `audit`, the KPI's `review_submissions` row has `auditor_score = 0`. Stages that hold actual scoring data MUST be reachable via step-back, otherwise the admin can never reverse a wrong auditor decision (the very purpose of step-back).

The result: a user-facing toast called this *"incorrect target stages"* — and they're right. The dialog hides legitimate, data-bearing stages.

## What to Build

### 1. Pass the KPI's period to the workflow lookup

In `AdminStatusStepBackDialog.tsx`:

- Accept new optional props `reviewPeriod?: string` and `reviewYear?: number`.
- Pass them through to `supabase.rpc('get_employee_workflow', { employee_uuid, p_review_period, p_review_year })` so the RPC walks its period-specific priority chain (which falls back to global only when no period match exists).
- Update every caller (`KpiHeaderSection`, `AllKpis`, anywhere else that opens the dialog) to forward the KPI's `review_period` / `review_year`.

### 2. Union with stages that hold real submission data

Add a second query in the dialog that fetches the KPI's `review_submissions` row and inspects which `*_score` columns are non-NULL. For each non-NULL score, ensure the corresponding stage (`self_review`, `manager_check`, `skip_level_check`, `hr_pms_review`, `audit`, `management_review`) is **always present** in `availableTargets`, even if the resolved workflow omits it. Sort the union by `FULL_STATUS_ORDER` so the dropdown stays in canonical order.

This guarantees: any stage with persisted data is reachable for step-back, and pure metadata-only stages from the configured template still show too.

### 3. Default-target safety

`getPreviousStatus` currently returns the stage immediately before `current` in the resolved workflow. With the union from step 2, also recompute the default selection so it points to the **immediately-prior data-bearing stage** if one exists (i.e. for an approved KPI with auditor_score=0, default to `audit`, not `hr_pms_review`). Falls through to the existing logic when no scored stages precede `current`.

### 4. Visual hint

When a stage in the dropdown is included only because it has data (not because it's part of the current workflow template), append a small inline badge `(historic)` next to its label so the admin knows why it's offered. Pure tooltip — no behavior change.

### 5. Documentation + memory sync

- POLICY.md — add §117 "Step-Back Target Set Composition": *"The step-back target dropdown is the union of (a) stages in the KPI's period-resolved workflow template and (b) every stage with non-NULL persisted data in `review_submissions`. Hiding a data-bearing stage is forbidden because it makes recorded scores unreachable for correction."*
- Memory `workflow-resilient-status-stepback` — append the union rule and period-aware lookup requirement.

### 6. Regression tests

`src/test/` — new tests for `AdminStatusStepBackDialog`:
- KPI with `auditor_score=0` but workflow template lacks `audit` → dropdown still includes `Audit Review`.
- Period-aware RPC called with `p_review_period` / `p_review_year`.
- Default target = nearest prior data-bearing stage when one exists.
- Workflow + data both empty for a stage → that stage is not offered.

## Risk & Impact Report

| Area              | Impact / Mitigation                                                                                                              |
|-------------------|----------------------------------------------------------------------------------------------------------------------------------|
| Data Impact       | None. Only UI selection logic changes; RPC + step-back mutation untouched.                                                       |
| Workflow Impact   | The step-back mutation already accepts any `target_status` enum; allowing a data-bearing stage to be selected does not bypass any policy — the cascade-clear in `useAdminStatusStepBack` already handles arbitrary targets. |
| UI/UX Consistency | Dropdown gains 0–2 extra options only when persisted data warrants. Non-disruptive for KPIs whose workflow + data align.         |
| Regression Risk   | Low. Existing call sites continue working without the new period props (default = current behavior); union fallback is additive.  |
| Mitigation        | Period args are optional; data-union runs only when the KPI has a `review_submissions` row; tests cover all four combinations.    |

## Files to Change

- `src/components/admin/AdminStatusStepBackDialog.tsx` — period-aware RPC, union with data-bearing stages, smarter default
- `src/components/review/KpiHeaderSection.tsx` — forward `reviewPeriod`/`reviewYear` to dialog
- `src/pages/admin/AllKpis.tsx` — forward `reviewPeriod`/`reviewYear` to dialog
- `src/hooks/useAdminDataEntry.ts` — minor: optional `getPreviousStatus` data-aware variant (or keep separate util)
- `POLICY.md` — new §117
- `mem/features/admin/workflow-resilient-status-stepback` — append union rule
- `src/test/` — new tests

Approve to implement.
