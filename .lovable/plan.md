
# Workflow Configuration: "Effective From" Period Support — IMPLEMENTED ✅

## What Changed
- Added `is_ongoing` BOOLEAN column to `workflow_config` table
- Created `month_name_to_index()` and `find_ongoing_workflow()` helper functions
- Updated 3 RPCs with ongoing resolution: exact match → ongoing match → global fallback
- Frontend: "Apply from this month onward" toggle + ongoing badges
- Hook: `useUpsertWorkflowConfig` accepts `isOngoing` parameter

---

# Org-Level KPI Toggle in Assign New KRA Dialog — IMPLEMENTED ✅

## What Changed
- Added `isOrgLevel` toggle switch and `orgLevelScope` selector to the Advanced section of `AdminKpiCreateDialog`
- Submit now uses these state values instead of hardcoded `is_org_level: false`
- Scope options: Organization, Department, Employee (matching `MarkOrgLevelDialog` pattern)

---


## Problem
KPIs with no `review_submissions` record (e.g., still at `kra_set` status, or Quarterly KPIs in non-terminal months) were included in the denominator but contributed 0 to the numerator, deflating overall scores. Affected 61 KPIs across 19 employees in January alone.

## Fix Applied
Guard clause `if (!submission || submission.is_na) return;` added in 4 files:

| File | Line | Change |
|---|---|---|
| `UnifiedScorecard.tsx` | 483 | `if (!submission \|\| submission.is_na) return;` |
| `EmployeeScorecard.tsx` | 220 | Same |
| `AuditScorecard.tsx` | 221 | Same |
| `ManagementScorecard.tsx` | 222 | Same |

## Impact
- Biswajit's score: 382/468 → 382/443 (correct)
- 19 employees with unsubmitted KPIs now show accurate weighted scores
- Quarterly KPIs in non-terminal months are correctly excluded
- No database migration needed — frontend calculation fix only

---

# Improve Send-Back KPI Experience — IMPLEMENTED ✅

## Problems Fixed

### 1. Employee data preserved on send-back
Previously, sending back a KPI to employee cleared all self-level fields (rating, score, remarks, evidence, achieved value). Now only `kpi_status` is reset to `open` — employee sees their previous data pre-filled.

| File | Change |
|---|---|
| `UnifiedScorecard.tsx` | Removed self-field clearing in cascade-clear for `kra_set` |
| `useKpis.ts` | `useSendBackKpi` no longer clears self-level fields |

### 2. Send-back reason shown on face
- **SentBackBanner component**: Fetches latest `kpi_queries` record with `query_type = 'send_back'`, displays reason, sender name, and date
- **SelfReviewSheet**: Uses `SentBackBanner` instead of generic text
- **KpiDetailsTable**: Shows "Sent Back" badge for KPIs at `kra_set` with prior submissions

### 3. Send-back queries created from all reviewer levels
UnifiedScorecard's send-back mutation now creates `kpi_queries` records (like `useSendBackKpi` already did), ensuring send-back reasons are always discoverable.

| File | Change |
|---|---|
| `SentBackBanner.tsx` | New component — fetches & displays send-back reason |
| `SelfReviewSheet.tsx` | Uses SentBackBanner |
| `KpiDetailsTable.tsx` | Added "Sent Back" badge for sent-back KPIs at kra_set |
| `UnifiedScorecard.tsx` | Creates kpi_queries record on send-back; invalidates kpi-queries cache |

---

# Audit Fix: Send-Back Gaps Across Levels — IMPLEMENTED ✅

## Gaps Fixed

### 1. ManagementScorecard now creates `kpi_queries` record on send-back
Previously only an audit log was created. Now a `kpi_queries` record with `query_type: 'send_back'` is inserted, making the reason discoverable by the `SentBackBanner`.

### 2. SentBackBanner shown to all reviewer levels
The `SentBackBanner` is now rendered in both `UnifiedScorecard` (manager, auditor, skip-level, HR PMS) and `ManagementScorecard` review sheets. It auto-hides when no send-back record exists.

### 3. SentBackBanner conditionally renders
Returns `null` when no send-back query is found, so it doesn't show an empty banner.

| File | Change |
|---|---|
| `ManagementScorecard.tsx` | Added `kpi_queries` insert + `SentBackBanner` in review sheet |
| `UnifiedScorecard.tsx` | Added `SentBackBanner` in review sheet |
| `SentBackBanner.tsx` | Returns null when no data (safe for unconditional rendering) |

---

# Fix: Stale `final_score` in Fallback Chains — IMPLEMENTED ✅

## Problem
9 files used `final_score ?? management_score ?? ...` fallback chains without checking KPI approval status, causing stale imported `final_score` values to override actual reviewer scores.

## Fix Applied
Gated `final_score` behind `status === 'approved'` check in all fallback chains:

| File | Change |
|------|--------|
| `DirectReporteesMonitor.tsx` | Added `status` to query select; gated fallback |
| `ManagementDashboard.tsx` | Gated `getScore()` helper |
| `PerformanceReport.tsx` | Gated category scores + avg score |
| `EmployeePerformanceSummary.tsx` | Gated both fallback chains (lines 180, 288) |
| `KpiDetailReport.tsx` | Added `status` param to `resolveFinalScore()` |
| `KpiHistoryCard.tsx` | Gated history chart scores |
| `KpiReviewPanel.tsx` | Gated `baseScore` prop |
| `KpiTrackerModal.tsx` | Gated `finalScore` display |
| `ImportData.tsx` | Gated export rating column |

---

# KRA Library → KPI Master: Template Propagation — IMPLEMENTED ✅

## What Changed

### Database
- Added `source_template_id` column to `kpis` table (FK → `kpi_templates`)
- Backfilled 5922 of 7387 KPIs via case-insensitive `(kra_name, kpi_name, category_id)` matching
- Created `template_change_logs` table with admin-only RLS for audit trail

### Edge Function: `propagate-template-change`
- Receives: template_id, changed fields, effective_month/year, optional employee_ids, dry_run flag
- Updates only structural fields (target_value, weightage, uom, r5-r0, etc.) — never scores
- Skips approved KPIs; filters by effective month onwards
- Supports dry-run preview returning impact summary
- Creates audit log entries for each propagated KPI

### Assignment Flows Updated
All 4 assignment flows now write `source_template_id`:
- `BulkTemplateAssignDialog.tsx` — template.id
- `BundleAssignDialog.tsx` — template.id via bundle items
- `SmartAssignmentDialog.tsx` — template.id (both bundle + individual paths)
- `AdminKpiCreateDialog.tsx` — selectedTemplateId when created from template

### Enhanced UI
- **TemplateFormDialog**: Propagation Settings section with effective month, scope (all/selected), field diff, preview impact, "Save & Propagate" button
- **TemplatePropagationPreview**: Dry-run summary cards showing KPIs/employees affected
- **TemplateChangeHistory**: Timeline dialog showing all past propagation events
- **KRALibrary page**: "Linked" column with KPI count, "View Change History" action, 3 stats cards

