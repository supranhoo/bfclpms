

## Show "Regular" Pending Count (Excluding Org KPI and Non-Monthly)

### What
Change the "pending self" badge count to exclude org KPIs and bi-monthly/quarterly KPIs, so it only shows "regular" monthly KPIs. The three badges will then represent mutually exclusive groups:
- **X pending self** — regular monthly KPIs only
- **Y org KPI** — org-level KPIs
- **Z bi-monthly/quarterly** — non-monthly frequency KPIs

### File: `src/components/review/EmployeeSelectorGrid.tsx`

**1. Update `getEmployeeKpiStats` (line 360-366)**
Change `badge1` from total pending to only regular (non-org, monthly) KPIs:
```typescript
const pendingKpis = empKpis.filter(k => k.status === 'kra_set');
const orgKpiCount = pendingKpis.filter(k => k.is_org_level).length;
const nonMonthlyCount = pendingKpis.filter(k => k.frequency && !['monthly','daily','weekly'].includes(k.frequency.toLowerCase())).length;
const regularCount = pendingKpis.length - orgKpiCount - nonMonthlyCount;
// Avoid double-subtract if a KPI is both org AND non-monthly
```

Need to handle overlap (KPI that is both org-level AND non-monthly). Use proper set subtraction:
```typescript
const regularCount = pendingKpis.filter(k => 
  !k.is_org_level && 
  (!k.frequency || ['monthly','daily','weekly'].includes(k.frequency.toLowerCase()))
).length;
```

Set `badge1: regularCount`.

**2. No UI changes needed** — the badge already renders `kpiStats.badge1` with label "pending self". It will now show only regular KPIs.

### No database changes needed

