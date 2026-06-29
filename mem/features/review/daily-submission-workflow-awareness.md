---
name: daily-submission-workflow-awareness
description: DailySubmissionSummary reviewer columns must be gated by BOTH status-reached and template-includes-stage; no maximal 6-stage chain
type: feature
---

`src/components/review/DailySubmissionSummary` renders one reviewer column
per workflow stage (Manager / Skip-Lvl / HR PMS / Auditor / Mgmt). Per
POLICY §DAILY-SUBMISSION-WORKFLOW-AWARENESS (ADR-100, v2.66.69):

- A reviewer column renders **only** when BOTH:
  1. KPI `status` has reached/passed the stage (legacy `STATUS_ORDER`
     gate), AND
  2. The stage is present in the employee's resolved workflow template
     (`workflowStages` prop, sourced from `useEmployeeWorkflowStages` /
     `get_employee_workflow`).
- Stage-column mapping:
  `manager_check`→Manager, `skip_level_check`→Skip-Lvl,
  `hr_pms_review`→HR PMS, `audit`→Auditor, `management_review`→Mgmt.
- `workflowStages` is optional for back-compat only — every new call site
  MUST pass it. The five active call sites already do
  (`UnifiedScorecard`, `EmployeeScorecard`, `AuditScorecard`,
  `ManagementScorecard`, `SelfReviewSheet` via `effectiveStages`;
  `InlineDailySubmissionRow` resolves the hook from `kpi.employee_id`).
- Header chip "N review levels" is derived from `visibleColumns.length`
  so it auto-trims (e.g. "3 review levels" for `self_l1_audit`).

**Why:** rendering empty `—` cells for stages absent from the template
falsely implies "not yet reviewed". Same SSOT defect class as BUG-033 /
POLICY §105 (per-employee workflow resolution for reports).

**Regression:** `src/test/dailySubmissionSummaryWorkflowAware.test.tsx`
(`self_l1_audit`, `self_hr_pms`, full template, omitted-prop fallback).