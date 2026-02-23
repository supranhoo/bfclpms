
# Filter Employee Chart Departments to Only Those with KPIs (v1.45.89)

## Problem

The "By Employee" chart's Department dropdown currently lists **all** departments from the organization, including those with zero pending KPIs. This clutters the filter with irrelevant options.

## Solution

Compute a list of departments that actually have pending KPIs in the current filtered dataset, and use that list instead of the full `departments` array for the employee chart's dropdown.

## Changes

### 1. `src/hooks/useBottleneckReport.ts`

Add a new computed value `employeeChartDepartments` that derives unique departments from `filteredRows`:

```typescript
const employeeChartDepartments = useMemo(() => {
  const deptSet = new Map<string, string>();
  filteredRows.forEach(r => {
    if (r.departmentId && r.departmentName !== '-') {
      deptSet.set(r.departmentId, r.departmentName);
    }
  });
  return Array.from(deptSet.entries())
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}, [filteredRows]);
```

Export it in the return object.

### 2. `src/pages/reports/BottleneckReport.tsx`

Replace `departments.map(d => ...)` in the employee chart's `<Select>` with `employeeChartDepartments.map(d => ...)` so only departments with active bottleneck KPIs appear.

### 3. `DOCUMENTATION.md`

Bump version to **1.45.89**, note the filtered department list behavior.

## Risk Assessment

| Aspect | Risk |
|--------|------|
| Data impact | None -- read-only filtering |
| Regression risk | None -- only changes dropdown options for one chart |
