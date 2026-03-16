

# Improve Send-Back KPI Experience

## Problems Identified

**1. Employee data gets wiped on send-back to employee**
When a reviewer sends back a KPI to the employee (target = `kra_set`), the cascade-clear in `UnifiedScorecard.tsx` (lines 648-656) nullifies `self_rating`, `self_score`, `self_remarks`, `self_evidence_url`, and `achieved_value`. The employee then sees a blank form and has to re-enter everything from scratch — even if only a minor correction was needed.

The same pattern exists in `useSendBackKpi()` in `useKpis.ts` (the manager-only send-back hook), which also resets `kpi_status` to `'open'`.

**2. Send-back reason is buried**
The reason is stored as a `kpi_queries` record but the `SelfReviewSheet` banner only shows a generic "This KPI was sent back for revision" message. The employee must open the Query History dialog to find the actual reason — poor discoverability.

## Proposed Changes

### 1. Preserve employee data on send-back (2 files)

**`src/components/review/UnifiedScorecard.tsx`** — In the cascade-clear block (lines 648-656), when `newStatus === 'kra_set'`, stop clearing self-level fields. Only set `kpi_status = 'open'`:

```diff
  if (newStatus === 'kra_set') {
    clearFields.kpi_status = 'open';
-   clearFields.self_rating = null;
-   clearFields.self_score = null;
-   clearFields.self_remarks = null;
-   clearFields.self_evidence_url = null;
-   clearFields.achieved_value = null;
  }
```

**`src/hooks/useKpis.ts`** — In `useSendBackKpi()` (line 974), stop clearing `kpi_status` to `'open'`. The employee's previous self-review data stays intact so they can see what they submitted and make targeted corrections.

```diff
  .update({
-   kpi_status: 'open' as const,
    manager_rating: null,
    ...
```

This means when the employee reopens the KPI, their previous achieved value, score, rating, remarks, and evidence will all be pre-populated in the form (the existing `useEffect` initialization at line 249 already reads from `submissionMap`).

### 2. Show send-back reason on the banner (2 files)

**`src/components/review/SelfReviewSheet.tsx`**:
- Fetch the latest send-back query for the selected KPI using `useKpiQueries` (already available in the codebase) or a lightweight targeted query
- When `isSentBack` is true, find the most recent `kpi_queries` record with `query_type = 'send_back'` for that KPI
- Update the amber banner (lines 553-557) to display: the reason text, who sent it back, and when

Updated banner design:
```text
┌─────────────────────────────────────────────────────┐
│ ↩ This KPI was sent back for revision               │
│                                                     │
│ Reason: "Please recheck the achieved value,         │
│ the target was 85% not 58%"                         │
│                                                     │
│ Sent back by: Rajesh Kumar · 14 Mar 2026            │
└─────────────────────────────────────────────────────┘
```

**`src/components/review/KpiDetailsTable.tsx`** (optional enhancement):
- For KPIs in `kra_set` status that have a prior submission (sent-back), show a small "Sent Back" badge with the reason in a tooltip, so it's visible even from the KPI list without opening the sheet.

### 3. Show send-back reason on reviewer scorecards too

**`src/components/review/UnifiedScorecard.tsx`** and **`src/components/review/ManagementScorecard.tsx`**:
- When viewing a KPI that was sent back (detected via audit log or query), show a subtle info banner with the send-back reason so all reviewers in the chain can see why it was returned.

### Summary of files to modify

| File | Change |
|------|--------|
| `src/components/review/UnifiedScorecard.tsx` | Remove self-field clearing on send-back to employee |
| `src/hooks/useKpis.ts` | Remove `kpi_status: 'open'` reset in `useSendBackKpi` |
| `src/components/review/SelfReviewSheet.tsx` | Fetch & display send-back reason + sender on the banner |
| `src/components/review/KpiDetailsTable.tsx` | Add "Sent Back" badge with reason tooltip for sent-back KPIs |

No database changes required — all data is already stored in `kpi_queries` and `kpi_audit_logs`.

