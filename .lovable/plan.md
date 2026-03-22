

## Exclude Sent-Back KPIs from "Self Reviewed" Date

### Problem
The "Self reviewed: [date]" indicator should not include KPIs that have been sent back for revision, as they haven't completed a valid self-review cycle.

### Fix

#### File: `src/components/review/UnifiedScorecard.tsx` (lines 399-413)

Add a check in the `lastSelfReviewDate` computation to skip KPIs where the submission's `kpi_status` is `'sent_back'`:

```typescript
const lastSelfReviewDate = useMemo(() => {
  if (!kpis || !submissions) return null;
  const regularKpis = kpis.filter(k =>
    !k.is_org_level &&
    (!k.frequency || ['monthly', 'daily', 'weekly'].includes(k.frequency.toLowerCase())) &&
    k.status !== 'kra_set'
  );
  let maxDate: string | null = null;
  for (const k of regularKpis) {
    const sub = submissionMap.get(k.id);
    if (!sub) continue;
    // Exclude sent-back KPIs
    if (sub.kpi_status === 'sent_back') continue;
    const d = sub.submitted_at || sub.updated_at;
    if (d && (!maxDate || d > maxDate)) maxDate = d;
  }
  return maxDate;
}, [kpis, submissions, submissionMap]);
```

### No database changes needed

