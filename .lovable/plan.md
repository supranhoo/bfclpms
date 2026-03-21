

## Add Non-Monthly KPI Count Badge on Employee Cards (Pending Self Review)

### What
Next to the existing "X org KPI" badge on each employee card, add a third badge showing the count of non-monthly (bi-monthly, quarterly, half-yearly, yearly) KPIs that are pending self review. Example: `7 pending self` `1 org KPI` `3 bi-monthly/quarterly`.

### File: `src/components/review/EmployeeSelectorGrid.tsx`

**1. Update `getEmployeeKpiStats` for `pending_self_review` (line 359-365)**
Add `nonMonthlyCount` field counting pending KPIs where frequency is not "monthly" or "daily" or "weekly":
```typescript
nonMonthlyCount: pendingKpis.filter(k => 
  k.frequency && !['monthly','daily','weekly'].includes(k.frequency.toLowerCase())
).length,
```

**2. Update `renderEmployeeBadges` (after line 897)**
Add a new badge after the org KPI badge:
```tsx
{viewLevel === 'pending_self_review' && (kpiStats as any).nonMonthlyCount > 0 && (
  <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200 ...">
    {(kpiStats as any).nonMonthlyCount} bi-monthly/quarterly
  </Badge>
)}
```

### No database changes needed

