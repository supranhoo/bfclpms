

## Show Org KPI Count on Employee Cards (Pending Self Review)

### What
Add an "org KPI" count badge next to the existing "pending self" badge on each employee card in the `pending_self_review` view. For example, if an employee has "7 pending self" and 5 of those are org-level KPIs, the card will show: `7 pending self` `5 org KPI`.

### How

#### File: `src/components/review/EmployeeSelectorGrid.tsx`

**1. Update `getEmployeeKpiStats` for `pending_self_review` (line 359-363)**
Add a new field `orgKpiCount` that counts KPIs at `kra_set` status where `is_org_level === true`:
```typescript
} else if (viewLevel === 'pending_self_review') {
  const pendingKpis = empKpis.filter(k => k.status === 'kra_set');
  return {
    badge1: pendingKpis.length,
    badge2: 0, badge3: 0, total: empKpis.length, clearedKraSet,
    orgKpiCount: pendingKpis.filter(k => k.is_org_level).length,
  };
}
```

**2. Update `renderEmployeeBadges` for `pending_self_review` (line 876-886)**
After the existing "pending self" badge, render a second badge showing org KPI count (only if > 0):
```
{kpiStats.orgKpiCount > 0 && (
  <Badge className="bg-blue-50 text-blue-700 border-blue-200 ...">
    {kpiStats.orgKpiCount} org KPI
  </Badge>
)}
```

**3. Update the return type of `getEmployeeKpiStats`**
Add `orgKpiCount` (default 0) to the base return so it doesn't break other view levels.

### No database changes needed

