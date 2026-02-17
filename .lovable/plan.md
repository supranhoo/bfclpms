

# Add Weightage Display to Individual KPIs Cards

## Overview

Add the KPI weightage percentage to each individual KPI card in the expanded employee section on the All KPIs page. This will appear alongside the existing "Month . Category" metadata line.

## What Changes

### `src/pages/admin/AllKpis.tsx`

In the individual KPI card's metadata line (currently showing period and category), append the weightage value:

**Before:**
```
January 2026 · Cost Management & Optimization
```

**After:**
```
January 2026 · Cost Management & Optimization · Weightage: 15%
```

The change is a single line edit at line 676, adding `· Weightage: {kpi.weightage ?? 0}%` to the existing text.

### `DOCUMENTATION.md`

Note the addition of weightage display in the All KPIs individual card metadata.

## Technical Detail

| File | Change |
|---|---|
| `src/pages/admin/AllKpis.tsx` | Append weightage to the metadata line in the KPI card (~line 676) |
| `DOCUMENTATION.md` | Document the UI addition |

The `kpi.weightage` field is already fetched in the query (it's part of the `kpis` table columns selected). No new queries or data fetching needed.

