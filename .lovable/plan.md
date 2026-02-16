

# Fix: Three Issues on Org KPI Data Entry Page

## Issue 1: "duplicate key value violates unique constraint review_submissions_kpi_id_unique"

### Root Cause
The propagation code in `usePropagateOrgKpiValue.ts` uses a check-then-insert pattern (lines 123-152): it queries for an existing submission, then either updates or inserts. This is **not atomic** -- if a submission is created between the check and the insert (e.g., by a concurrent propagation or a previous propagation that wasn't fully cleaned up during rollback), the INSERT fails with the unique constraint violation.

### Fix
Replace the check-then-insert/update pattern with a Supabase **upsert** using `onConflict: 'kpi_id'`. This is atomic and handles both insert and update in a single call. Apply this fix in both `usePropagateOrgKpiValue` (single propagation) and `useBulkPropagateOrgKpiValues`.

---

## Issue 2: Bi-Monthly / Quarterly KPIs should only show for entry in their due month

### Root Cause
The Org KPI Data Entry page does not apply any frequency-based filtering. The `useOrgLevelKpis` hook fetches all org-level KPIs for the selected period without checking their `frequency` field. Meanwhile, the self-review side correctly uses `isKpiLockedForPeriod` from `frequencyUtils.ts`.

### Fix
1. Include `frequency` and `frequency_cycle_start` in the KPI data fetched by `useOrgLevelKpisWithEmployees`.
2. In `OrgKpiDataEntry.tsx`, filter the displayed KPIs using `isKpiLockedForPeriod` -- KPIs that are locked for the selected month should be hidden or shown with a "not due" indicator.
3. Add a `frequency` and `frequency_cycle_start` field to `OrgKpiCardData` and display a badge showing when the KPI is due (e.g., "Due: Feb" for a Bi-Monthly KPI viewed in January).

---

## Issue 3: Upload should have clipboard paste option

### Current State
The `OrgKpiFileUpload` component **already has clipboard paste support** (lines 71-103). It listens for the `paste` event on the document and handles file paste. However, it only activates when `existingUrl` is null, `disabled` is false, and `isUploading` is false. There is no visual indicator telling users they can paste.

### Fix
Add a small "or paste" hint text next to the Upload button so users know the feature exists.

---

## Technical Details

### Files to Change

| File | Change |
|---|---|
| `src/hooks/usePropagateOrgKpiValue.ts` | Replace check-then-insert with `.upsert(..., { onConflict: 'kpi_id' })` in both mutation functions |
| `src/hooks/useOrgLevelKpis.ts` | Already fetches `*` (all columns including `frequency`), so no query change needed |
| `src/pages/admin/OrgKpiDataEntry.tsx` | Add frequency-based filtering using `isKpiLockedForPeriod`; pass frequency data to card |
| `src/components/admin/OrgKpiEntryCard.tsx` | Add optional `frequency` prop; show "Due: Month" badge for non-monthly KPIs; show locked overlay for non-due months |
| `src/components/admin/OrgKpiFileUpload.tsx` | Add "or Ctrl+V to paste" hint text next to Upload button |
| `DOCUMENTATION.md` | Document the frequency filtering and upsert fix |

### Propagation Upsert (Fix 1)

Before:
```typescript
const { data: existing } = await supabase
  .from('review_submissions')
  .select('id, self_score')
  .eq('kpi_id', kpi.id)
  .maybeSingle();

if (existing) {
  await supabase.from('review_submissions').update({...}).eq('id', existing.id);
} else {
  await supabase.from('review_submissions').insert({...});
}
```

After:
```typescript
const { data: existing } = await supabase
  .from('review_submissions')
  .select('self_score')
  .eq('kpi_id', kpi.id)
  .maybeSingle();

const oldScore = existing?.self_score ?? null;

await supabase
  .from('review_submissions')
  .upsert({
    kpi_id: kpi.id,
    achieved_value: achievedValue,
    self_score: ratingResult.rating,
    self_rating: ratingLevel,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'kpi_id' });
```

### Frequency Filter (Fix 2)

In `OrgKpiDataEntry.tsx`, after the ownership filter:
```typescript
const frequencyFilteredKpis = useMemo(() => {
  return ownershipFilteredKpis.filter(kpi => {
    const freq = kpi.frequency;
    if (!freq || freq === 'Monthly') return true;
    return !isKpiLockedForPeriod(freq, selectedPeriod, selectedYear, kpi.frequency_cycle_start);
  });
}, [ownershipFilteredKpis, selectedPeriod, selectedYear]);
```

### Paste Hint (Fix 3)

Next to the Upload button, add:
```tsx
<span className="text-[10px] text-muted-foreground">or Ctrl+V</span>
```
