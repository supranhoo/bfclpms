

## Fix: PDF Download Button Missing After Send-Back

### Root Cause

The PDF button is guarded by `hasAnyData`, which checks if any visible stage has status !== `'pending'`. After a send-back (e.g., auditor sends back to employee), the KPI status resets to `self_review`. With `self_review` as the current status, the `getStageStatus` function returns:
- Self → `current`
- Auditor → `pending`
- Management → `pending`

So `hasAnyData` should be `true` (Self is "current", not "pending"). However, looking more closely, the real issue is that the screenshot shows **all three** stages as "Pending" — this means the KPI status might be at an even earlier state like `kra_set`, or the workflow stages mapping doesn't match.

**More likely cause**: The KPI has audit log entries (send-back records exist in the DB), so even when all stages show "pending", the PDF button should still appear if there's meaningful history to export.

### Fix — `src/components/review/KpiJourneySection.tsx`

Expand the `hasAnyData` check to also consider whether audit logs exist:

```typescript
// Current (line 284-287):
const hasAnyData = visibleStages.some(stage => {
  const status = getStageStatus(stage, kpiStatus, viewLevel, effectiveStages);
  return status !== 'pending';
});

// Fixed:
const hasAnyData = visibleStages.some(stage => {
  const status = getStageStatus(stage, kpiStatus, viewLevel, effectiveStages);
  return status !== 'pending';
}) || auditLogs.length > 0;
```

This ensures the PDF button is visible whenever there's any audit trail history — even if all stages currently show as "pending" after a send-back.

### Risk Assessment
- **Data Impact**: None — read-only visibility logic
- **Workflow Impact**: None — additive condition
- **Regression Risk**: Zero — only makes the button visible in more cases

### Files Changed
1. **`src/components/review/KpiJourneySection.tsx`** — Add `|| auditLogs.length > 0` to `hasAnyData`
2. **`DOCUMENTATION.md`** — Version history update
3. **`POLICY.md`** — Version history update

