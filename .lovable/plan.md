

# Fix: Show All KPI Statuses on Management Employee Cards (v1.46.17)

## Problem

In the Management view, employee cards only show "pending" (at `management_review`) and "approved" badges. KPIs still progressing through earlier stages (audit, HR PMS, manager check, etc.) are invisible -- the counts don't add up to the total.

Example: 9 pending + 2 approved = 11, but total is 13. The missing 2 are in earlier pipeline stages.

## Solution

Add a third badge ("in pipeline") for the management view to show KPIs that haven't yet reached `management_review`. This makes all KPIs visible and the progress bar accurate.

## Visual Result

```text
+--------------------------------------+
| [Avatar] Jaspal                   -> |
|          Senior General Manager      |
|          Manager: Gaurav Budhia      |
|          [=========-------] 2/13     |
|          [9 pending] [2 in pipeline] |
|          [2 approved]                |
+--------------------------------------+
```

## File to Change

**`src/components/review/EmployeeSelectorGrid.tsx`**

### 1. Update `getEmployeeKpiStats` management branch (~line 298-305)

Add `badge3` to count KPIs NOT at `management_review` and NOT `approved` (i.e., still in earlier stages):

```typescript
} else {
  const pending = empKpis.filter(k => k.status === 'management_review').length;
  const approved = empKpis.filter(k => k.status === 'approved').length;
  const inPipeline = empKpis.length - pending - approved;
  return {
    badge1: pending,
    badge2: approved,
    badge3: inPipeline,
    total: empKpis.length,
  };
}
```

### 2. Update `getProgressSegments` (~line 606-614)

Include management in the 3-tier logic so the progress bar correctly shows all segments:

```typescript
if (viewLevel === 'hr_pms' || viewLevel === 'audit' || viewLevel === 'management') {
  return { done: kpiStats.badge2, inProgress: kpiStats.badge3, total: kpiStats.total };
}
```

For management: done = approved (badge2), inProgress = in-pipeline (badge3), pending = management_review (badge1).

### 3. Update management badge rendering (~line 713-728)

Add "in pipeline" badge between pending and approved:

```tsx
{kpiStats.badge1 > 0 && (
  <Badge ...>{kpiStats.badge1} pending</Badge>
)}
{kpiStats.badge3 > 0 && (
  <Badge variant="outline" className="bg-blue-50 text-blue-700 ...">
    {kpiStats.badge3} in pipeline
  </Badge>
)}
{kpiStats.badge2 > 0 && (
  <Badge ...>{kpiStats.badge2} approved</Badge>
)}
```

### 4. Update global stats computation (~line 491-498)

Add the "in pipeline" count to the management stats block so the stat cards can optionally reflect it.

## Risk Assessment

| Aspect | Risk | Mitigation |
|--------|------|-----------|
| Data impact | None | UI-only, reads existing KPI statuses |
| Regression | None | Only management view changes; other levels untouched |
| Accuracy | Positive | All KPIs now accounted for -- counts always sum to total |

