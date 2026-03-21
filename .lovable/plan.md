

## Updated Plan: Preserve Existing Remarks on Manager Penalty KPI

### Change
When penalizing a manager's "Implementation of common - policies / systems / processes" KPI, if a `review_submission` already exists with a non-empty `self_remarks`, the system-generated remark should be **appended** to the existing remark rather than overwriting it.

### Implementation

**Modified: `src/hooks/usePendingSelfReviews.ts`** — in `useBulkManagerPenalty` mutation:

Current code (line ~377-395) fetches existing submission but only checks for `id`. Change to also fetch `self_remarks`:

```typescript
const { data: existing } = await supabase
  .from('review_submissions')
  .select('id, self_remarks')
  .eq('kpi_id', mgrKpi.id)
  .maybeSingle();
```

Then when updating, append the system remark:

```typescript
if (existing) {
  const combinedRemark = existing.self_remarks
    ? `${existing.self_remarks}\n[System] ${remark}`
    : remark;
  // use combinedRemark instead of remark in the update
}
```

For new inserts (no existing submission), just use the system remark as-is.

### No other files changed

