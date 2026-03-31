

## Plan: Enhanced Incentive Report with Filters & Excel Export (No Row Limit)

### Updated from Previous Plan

The only change from the previously approved plan: **remove the 1000-row Supabase default limit** by implementing paginated fetching that retrieves ALL records.

### Pagination Strategy

Supabase caps `.select()` at 1000 rows by default. To fetch all records, the new `useIncentiveReportData` hook will use a **batched fetch loop**:

```typescript
async function fetchAllIncentiveRecords(filters) {
  const PAGE_SIZE = 1000;
  let allData = [];
  let offset = 0;
  let hasMore = true;
  
  while (hasMore) {
    let query = supabase
      .from('employee_incentive_records')
      .select('*, profiles:employee_id(...), incentive_slabs:matched_slab_id(...), incentive_programs:program_id(...)')
      .range(offset, offset + PAGE_SIZE - 1)
      .order('created_at', { ascending: true });
    
    // Apply filters only when not "all"
    if (filters.month !== 'all') query = query.eq('review_period', filters.month);
    if (filters.year !== 'all') query = query.eq('review_year', filters.year);
    if (filters.programId !== 'all') query = query.eq('program_id', filters.programId);
    
    const { data, error } = await query;
    if (error) throw error;
    allData = [...allData, ...(data || [])];
    hasMore = (data?.length || 0) === PAGE_SIZE;
    offset += PAGE_SIZE;
  }
  return allData;
}
```

### All Other Details — Same as Previously Approved Plan

**Filters**: Month (All + 12), Year (All + range), Programme (All + active programmes), Search input

**Summary Cards**: Total Records, Eligible, Disqualified, Pro-rata, Total Incentive Amount

**Preview Table**: Code, Name, Desig, Dept, BU, Month, Year, Programme, Final%, Status

**Excel Export — 28 columns**: Employee Info (6), Period & Programme (3), Scores & Slabs (4), DQ Fields (3), Adjustments (4), Final (3), Analytical (5)

### Files Modified

| File | Change |
|------|--------|
| `src/hooks/useIncentiveRecords.ts` | Add `useIncentiveReportData` with batched pagination (no 1000-row limit) |
| `src/components/incentive/IncentiveReportExport.tsx` | New report UI with filters, summary cards, table, Excel export |
| `src/pages/reports/IncentiveReport.tsx` | Add new "Incentive Report" tab |
| `DOCUMENTATION.md` | v2.15.18 |
| `POLICY.md` | Incentive report completeness invariant |

### Risk Assessment
- **Regression**: Zero — additive tab
- **Performance**: Batched fetching prevents timeout; UI renders preview table (first 50 rows) while full dataset loads for export
- **Data**: Read-only queries, no schema changes

