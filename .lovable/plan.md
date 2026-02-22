

# Fix: KPI Mapping Matrix Data Truncation (1,000-Row Limit)

## Root Cause

The KPI Mapping Matrix shows inaccurate data because the database query for KPIs hits the default **1,000-row limit**. For year 2025, there are **2,908 KPI records** but only the first 1,000 are fetched. Employee "101125 Jaspal" (and many others) have KPIs that fall beyond this cutoff, so they appear unmapped.

## Fix

### File: `src/hooks/useAdminReports.ts`

Replace the single KPI fetch query with a **paginated fetch loop** that retrieves all rows in batches of 1,000. This is a common pattern when Supabase data exceeds the default limit.

**Current code (broken):**
```typescript
const { data, error } = await supabase
  .from('kpis')
  .select('employee_id, review_period')
  .eq('review_year', filters.year);
```

**New code (fetches all rows):**
```typescript
let allKpis: { employee_id: string; review_period: string }[] = [];
let from = 0;
const batchSize = 1000;
while (true) {
  const { data, error } = await supabase
    .from('kpis')
    .select('employee_id, review_period')
    .eq('review_year', filters.year)
    .range(from, from + batchSize - 1);
  if (error) throw error;
  if (!data || data.length === 0) break;
  allKpis = allKpis.concat(data);
  if (data.length < batchSize) break;
  from += batchSize;
}
return allKpis;
```

The same fix is not needed for profiles (451 rows, under the limit) but will be applied as a safety measure for future growth.

### File: `DOCUMENTATION.md`

Version bump to 1.45.68.

## Impact Assessment

| Risk | Assessment |
|------|-----------|
| Data Impact | None -- read-only queries, no schema changes |
| Regression Risk | None -- same data shape, just fetches completely |
| Performance | Minimal -- adds 1-2 extra round trips for large datasets |

