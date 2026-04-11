

## Updated Plan: Submission Date Display Logic in Review Journey

### Updated Requirement
- **Show submission date** when self-review is complete
- **Show pending count** only if self-review is NOT done by the last day of the month
- Never show "0 pending" — if complete, always show the date (or "Complete" if date is missing)

### Changes

| # | File | Change |
|---|------|--------|
| 1 | `src/components/review/KpiJourneySection.tsx` | Update display logic at line 565-567 |
| 2 | `src/components/admin/OrgKpiEntryCard.tsx` | Merge submission data into sub_factors at save time (from original plan) |
| 3 | `src/components/admin/OrgKpiScopedEntryTable.tsx` | Use live submission info for sub_factors defaults (from original plan) |
| 4 | `DOCUMENTATION.md` | Update |
| 5 | `POLICY.md` | Version sync |

### Technical Detail

**Display logic change** (KpiJourneySection.tsx line 565-567):

Current:
```typescript
{complianceData.subFactors.submission_complete
  ? (submission_date ? format(...) : 'Complete')
  : `${submission_pending_count} pending`}
```

New:
```typescript
{complianceData.subFactors.submission_date
  ? format(new Date(complianceData.subFactors.submission_date), 'dd MMM yyyy')
  : complianceData.subFactors.submission_complete
    ? 'Complete'
    : `${complianceData.subFactors.submission_pending_count} pending`}
```

Logic:
1. If `submission_date` exists → show formatted date
2. Else if `submission_complete` is true → show "Complete"
3. Else → show pending count (only when self-review genuinely not done)

**Save-time merge** and **default initialization** changes remain identical to the previously approved plan — merging live `submissionDates` hook data into `sub_factors` at save time in `OrgKpiEntryCard.tsx`, and using live info for defaults in `OrgKpiScopedEntryTable.tsx`.

### Risk Assessment
- **Data impact**: None — display-only change + additive save merge
- **Regression risk**: None — submission_date priority is strictly better than current logic

