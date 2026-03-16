
# Fix: Exclude Unsubmitted KPIs from Score Calculation — IMPLEMENTED ✅

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
