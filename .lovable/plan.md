

## RCA + CAPA: Missing Department & BU Filters on Bulk Zero-Score

### 1. Root Cause

The `BulkZeroScoreSection` UI and the `bulk-zero-score-non-submitters` edge function were designed with only Period/Year filters. No organizational scoping (Division, Business Unit, Department) was implemented, despite the scan returning up to 1000+ rows. This is a **design gap**, not a bug — the feature was shipped without the cascading org filters that exist elsewhere in the admin suite (e.g., KPI Mapping Matrix).

Additionally, the scan query uses `limit(1500)` but the UI badge shows "1000 found" — suggesting the Supabase default 1000-row cap is truncating results, meaning some non-submitters are invisible to the admin.

### 2. Impact

- Admin cannot scope zero-scoring to a specific department or BU — forced to review 1000+ rows
- Risk of accidentally zero-scoring the wrong employees
- Possible data truncation at 1000 rows hides affected KPIs

### 3. Corrective Action

#### A. Edge Function Changes (`bulk-zero-score-non-submitters/index.ts`)

Accept new optional filter parameters in the request body:

```typescript
division_id?: string
business_unit_id?: string
department_id?: string
```

**Scan mode logic:**
1. If `department_id` is provided → filter `kpis` by employees in that department (`profiles.department_id`)
2. If `business_unit_id` is provided → resolve all departments under that BU, then filter
3. If `division_id` is provided → resolve BUs under that division, then departments, then filter
4. Build an `employee_id` allowlist from the org filter, then apply `.in("employee_id", allowlist)` to the stuck KPIs query

**Execute mode:** Same filters passed through for consistency (though execute uses explicit `kpi_ids`, the filters serve as a safety cross-check).

#### B. UI Changes (`BulkZeroScoreSection.tsx`)

Add three cascading Select dropdowns after the Year selector:

```text
[Period ▼] [Year ▼] [Division ▼] [Business Unit ▼] [Department ▼] ☐ Include Org KPIs [Scan]
```

- Fetch divisions, BUs, departments from existing tables
- BU options filtered by selected division; Department options filtered by selected BU
- Changing a parent filter clears child selections (same pattern as KPI Mapping Matrix)
- Pass selected IDs to the edge function scan/execute calls

#### C. Row Limit Fix

In the edge function scan query, increase the effective limit by paginating or removing the cap. Use batched fetching (500 per batch) to bypass the 1000-row default.

### 4. Preventive Action

- Update `DOCUMENTATION.md` with the organizational filter requirement for all bulk admin tools
- Add this as a checklist item: "Does the feature need org-scoping filters?"

### 5. Files to Create/Modify

| File | Change |
|------|--------|
| `supabase/functions/bulk-zero-score-non-submitters/index.ts` | Accept division/BU/department filters; resolve employee allowlist; fix row limit with batched fetch |
| `src/components/admin/BulkZeroScoreSection.tsx` | Add cascading Division → BU → Department dropdowns; pass filter IDs to scan/execute |
| `DOCUMENTATION.md` | Update feature spec with org filter support |
| `POLICY.md` | Sync version |

### 6. Risk Assessment

- **Data impact**: None — filters are additive constraints, no schema changes
- **Regression risk**: Low — existing unfiltered behavior preserved when no filter is selected ("All" default)
- **Security**: No change — `requireAdminUser()` still gates access

