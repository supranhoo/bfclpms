

# Fix: Value History Not Loading in Org KPI Data Entry

## Root Cause

In `src/components/admin/OrgKpiAuditLog.tsx` line 25, the `enabled` parameter is hardcoded to `false`:

```ts
const { data: logs, isLoading } = useOrgKpiAuditLog(
  categoryId, kraName, kpiName, reviewPeriod, reviewYear,
  false  // <-- Query is permanently disabled, never fetches data
);
```

The hook `useOrgKpiAuditLog` defaults `enabled` to `true`, but the component explicitly overrides it with `false`. This means the database query never runs, so it always shows "No history yet."

## Fix

### File: `src/components/admin/OrgKpiAuditLog.tsx`

Change line 25 from `false` to `true` (or simply omit the parameter to use the default):

```ts
// Before
const { data: logs, isLoading } = useOrgKpiAuditLog(categoryId, kraName, kpiName, reviewPeriod, reviewYear, false);

// After
const { data: logs, isLoading } = useOrgKpiAuditLog(categoryId, kraName, kpiName, reviewPeriod, reviewYear);
```

### File: `DOCUMENTATION.md`

- Version bump to 1.45.43
- Note: Fixed Value History not loading in Org KPI Data Entry cards

## Impact

- The History popover will now fetch and display audit log entries when clicked
- No database or schema changes needed
- No other components are affected

