

## Fix: "Pending Self" Count Not Excluding Org/Non-Monthly KPIs

### Root Cause
Two issues found:

1. **Tile-level stat (line 633)**: The `nonMonthlyCount` filter only excludes `'monthly'` but misses `'daily'` and `'weekly'`, making the non-monthly count too high and inconsistent with the card-level logic.

2. **Card-level badge (lines 363-368)**: The logic is actually correct — `badge1` uses `regularCount` which properly excludes org and non-monthly KPIs. However, if `regularCount` is 0, the badge is hidden entirely (line 895: `badge1 > 0`), which may confuse users. We should show "0 pending self" when other badges are visible, so users understand the breakdown.

### Fix

#### File: `src/components/review/EmployeeSelectorGrid.tsx`

**1. Fix tile-level nonMonthlyCount (line 633)**
Change:
```typescript
const nonMonthlyCount = pendingKpis.filter(k => k.frequency && !['monthly'].includes(k.frequency.toLowerCase())).length;
```
To:
```typescript
const nonMonthlyCount = pendingKpis.filter(k => k.frequency && !['monthly','daily','weekly'].includes(k.frequency.toLowerCase())).length;
```

Also update `stat1` to show only regular count (excluding org and non-monthly), matching the card behavior:
```typescript
const regularCount = pendingKpis.filter(k => !k.is_org_level && (!k.frequency || ['monthly','daily','weekly'].includes(k.frequency.toLowerCase()))).length;
return { ..., stat1: regularCount, stat2: orgKpiCount, stat3: nonMonthlyCount, ... };
```

**2. Show "0 pending self" badge when org/non-monthly badges exist (line 895)**
Change `{kpiStats.badge1 > 0 && (` to always show the badge in `pending_self_review` view when there are org or non-monthly KPIs:
```typescript
{(kpiStats.badge1 > 0 || (viewLevel === 'pending_self_review' && ((kpiStats as any).orgKpiCount > 0 || (kpiStats as any).nonMonthlyCount > 0))) && (
```

### No database changes needed

