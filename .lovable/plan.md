

## Add Org KPI + Bi-Monthly/Quarterly Badges to All Reviewer Employee Cards

### Problem
The "pending self", "org KPI", and "bi-monthly/quarterly" count badges on employee cards currently only appear in the `pending_self_review`, `pending_manager_review`, and `pending_skip_review` monitoring views. They are missing from:
- **Team Reviews** (`team`)
- **Skip-Level** (`skip_level`)
- **HR PMS** (`hr_pms`)
- **Audit** (`audit`)
- **Management** (`management` — the else branch)

Additionally, the stat card subtitle breakdown (showing org KPI and bi-monthly/quarterly counts) only works for `pending_self_review` — it should also work for `pending_manager_review` and `pending_skip_review`.

### Changes — `src/components/review/EmployeeSelectorGrid.tsx`

#### 1. Compute `orgKpiCount` and `nonMonthlyCount` for all view levels

Update `getEmployeeKpiStats` for `team`, `skip_level`, `hr_pms`, `audit`, and the `else` (management) branches to also compute and return `orgKpiCount` and `nonMonthlyCount` from the pending KPIs relevant to that view level:

- **team (direct)**: pending = `self_review` status KPIs
- **team (indirect)**: pending = reviewable statuses for skip_level
- **skip_level**: pending = reviewable statuses
- **hr_pms**: pending = badge1 + badge2 KPIs (before and in HR PMS)
- **audit**: pending = badge1 + badge2 KPIs (before and in audit)
- **management (else)**: pending = `management_review` KPIs

For each, add:
```typescript
orgKpiCount: pendingKpis.filter(k => k.is_org_level).length,
nonMonthlyCount: pendingKpis.filter(k => k.frequency && !['monthly','daily','weekly'].includes(k.frequency.toLowerCase())).length,
```

#### 2. Render badges in all employee card badge sections

For each view level's badge rendering block (`team`, `skip_level`, `hr_pms`, `audit`, `management`), append the org KPI and non-monthly badges after the existing badges:

```tsx
{(kpiStats as any).orgKpiCount > 0 && (
  <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-xs ...">
    {(kpiStats as any).orgKpiCount} org KPI
  </Badge>
)}
{(kpiStats as any).nonMonthlyCount > 0 && (
  <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200 text-xs ...">
    {(kpiStats as any).nonMonthlyCount} bi-monthly/quarterly
  </Badge>
)}
```

#### 3. Fix stat card subtitle for `pending_manager_review` and `pending_skip_review`

Update line 847 to remove the `viewLevel === 'pending_self_review'` restriction:

```typescript
const pendingSubtitle = (stats.stat2 > 0 || stats.stat3 > 0)
  ? [stats.stat2 > 0 ? `${stats.stat2} org KPI` : '', stats.stat3 > 0 ? `${stats.stat3} bi-monthly/quarterly` : ''].filter(Boolean).join(' · ')
  : 'KPIs at this stage';
```

### No database changes needed

