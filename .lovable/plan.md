

# Fix: Review Journey Shows Wrong Stages + KPI History Zero-Score Bug

## Bugs Found

### Bug 1: Review Journey in Self-Review shows default stages instead of employee's actual workflow

**Root Cause**: In `SelfReviewSheet.tsx` (line 493-505), the `KpiReviewPanel` component is rendered **without** the `workflowStages` prop, even though the employee's workflow stages are already fetched and stored in `effectiveStages` (line 120). This causes `KpiJourneySection` to fall back to `DEFAULT_WORKFLOW_STAGES` (the basic 6-stage pipeline: Self, Manager, Auditor, Management).

Jaspal's actual workflow is: `KRA Set -> Self Review -> Audit Review -> Management Review -> Approved` (no Manager Check, no Skip-Level, no HR PMS). But the Review Journey was showing the default 4-reviewer stages.

### Bug 2: KPI History shows score of 0 as a dash

**Root Cause**: In `KpiHistoryCard.tsx` (line 133), the expression `entry.score || '-'` uses the logical OR operator which treats `0` as falsy. Any KPI with a legitimate score of 0 is displayed as `-`.

---

## Fixes

### File 1: `src/components/review/SelfReviewSheet.tsx` (line 493-505)

Add the missing `workflowStages` prop:

```typescript
<KpiReviewPanel
  kpi={selectedKpi}
  submission={submissionMap.get(selectedKpi.id) || null}
  allKpis={allKpis}
  allSubmissions={allSubmissions}
  viewLevel="employee"
  currentUserId={profile?.id}
  selectedPeriod={selectedPeriod}
  selectedYear={selectedYear}
  onOpenQueryHistory={() => setQueryHistoryOpen(true)}
  onOpenFullHistory={() => setTrackerModalOpen(true)}
  onOpenTimeline={() => setTimelineOpen(true)}
  workflowStages={effectiveStages}          // <-- ADD THIS
/>
```

### File 2: `src/components/review/KpiHistoryCard.tsx` (line 133)

Replace the falsy check with a nullish check:

```typescript
// Before:
{entry.isNa ? 'N/A' : (entry.score || '-')}

// After:
{entry.isNa ? 'N/A' : (entry.score != null ? entry.score : '-')}
```

### File 3: `DOCUMENTATION.md`

Version bump to 1.45.62 and document both fixes.

---

## Summary

| File | Change |
|------|--------|
| `src/components/review/SelfReviewSheet.tsx` | Pass `workflowStages={effectiveStages}` to `KpiReviewPanel` |
| `src/components/review/KpiHistoryCard.tsx` | Fix zero-score display with nullish check |
| `DOCUMENTATION.md` | Version bump to 1.45.62 |

