

# Add "Ref_Code" Column to PMS Scorecard Import/Export

## Overview

Add a `ref_code` column to the `kpis` table that serves as a user-defined reference identifier. Users can populate this during import to verify data accuracy, and it will be included when exporting current data.

## Changes Required

### 1. Database Migration

Add a `ref_code` text column to the `kpis` table:

```sql
ALTER TABLE public.kpis ADD COLUMN ref_code text;
```

No constraints needed -- it's a free-form optional text field for the user's reference.

### 2. Frontend Import (`src/pages/admin/ImportData.tsx`)

**a) KpiImportRow interface (~line 69):** Add `refCode?: string;`

**b) normalizeKpiRow function (~line 498-548):** Add mapping:
```typescript
refCode: getValue(['refCode', 'ref_code', 'Ref_Code', 'referenceCode', 'reference_code']),
```

**c) Download Template (~line 1299-1437):** Add `refCode` field to template sample rows (placed near `sNo`/`newCode` for visibility).

**d) Export Current Data (~line 1617-1652):** Include `ref_code` from the KPI select query and add `refCode: kpi.ref_code || ''` to the export object.

**e) KPI select in export query (~line 1566-1587):** Add `ref_code` to the select fields.

### 3. Edge Function (`supabase/functions/import-kpis/index.ts`)

Add `refCode` to the validation schema and pass it through to the KPI upsert/insert logic so it gets stored in the database.

### 4. Foreground Import Logic

In the foreground import path (handleImport), pass `ref_code` when creating/upserting KPIs.

### 5. Documentation (`DOCUMENTATION.md`)

Update the PMS template column list to include `Ref_Code` as an optional column for user reference tracking.

## Technical Notes

- The column is purely for user convenience (tracking/verification) -- it does not affect scoring, reviews, or any business logic
- Column position in template: placed early (after `sNo`) so users see it immediately
- The column is optional -- blank values are fine

