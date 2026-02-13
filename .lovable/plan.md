

# Fix: Wrap Category Text in KPI Details Table

## Problem

The Category column in the KPI Details table uses `truncate max-w-[100px]`, which clips long category names (e.g., "Recruitment ..."). The user wants this text to wrap instead of being truncated.

## Change

**File: `src/components/review/KpiDetailsTable.tsx`** (line 275)

Replace:
```
<span className="text-sm truncate max-w-[100px]">
```

With:
```
<span className="text-sm break-words">
```

This removes the truncation and fixed max-width, allowing the category name to wrap naturally within its cell across all dashboards (My KPIs, Team Review, Audit, Management).

## Scope

- Single line change in one file
- Affects all views that use KpiDetailsTable (My KPIs, Team Review, Audit, Management scorecards)
- Documentation update: not needed (cosmetic CSS fix)

