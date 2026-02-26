

# Enhanced Employee Cards: Progress Bar + Auto-Prioritization (v1.46.15)

## What Changes

Each employee card in the reviewer grid will be enhanced with:

1. **Mini progress bar** showing how many KPIs have been actioned vs total, with color-coded segments
2. **Fraction text** like "7/13 reviewed" so reviewers instantly see scope
3. **Auto-sort by urgency** -- employees with the most pending KPIs appear first

## Visual Design

```text
Current card:
+--------------------------------------+
| [Avatar] Jaspal                   -> |
|          Senior General Manager      |
|          Manager: Gaurav Budhia      |
|          [2 pending] [11 forwarded]  |
+--------------------------------------+

Enhanced card:
+--------------------------------------+
| [Avatar] Jaspal                   -> |
|          Senior General Manager      |
|          Manager: Gaurav Budhia      |
|          [=========-------] 11/13    |
|          [2 pending] [11 forwarded]  |
+--------------------------------------+
```

The progress bar will show:
- Green segment = completed/forwarded/reviewed KPIs
- Amber/yellow segment = in-progress (in audit, in review, etc.)
- Gray = remaining/pending
- Fraction text to the right: "11/13"

## Level-Specific Progress Logic

| View Level | "Done" = | "In Progress" = | "Pending" = |
|------------|----------|-----------------|-------------|
| Team (Direct) | reviewed (badge2) | -- | pending (badge1) |
| Team (Indirect) | reviewed (badge2) | -- | pending (badge1) |
| Skip-Level | reviewed (badge2) | -- | pending (badge1) |
| HR PMS | reviewed (badge3) | in review (badge2) | pending (badge1) |
| Audit | forwarded (badge3) | in audit (badge2) | pending (badge1) |
| Management | approved (badge2) | -- | pending (badge1) |

## Auto-Sort Logic

Employees will be sorted by:
1. **Pending count descending** (most urgent first)
2. **Total KPIs descending** (tie-breaker)
3. **Name alphabetically** (final tie-breaker)

Employees with 0 KPIs sink to the bottom.

## File to Change

**`src/components/review/EmployeeSelectorGrid.tsx`**

### Changes:

1. **Update `renderEmployeeBadges`** (lines 591-699): Add a mini progress bar above the existing badges. The bar uses the existing `getEmployeeKpiStats` data (badge1, badge2, badge3, total) to compute segment widths.

2. **Sort `displayMembers`** (around line 336): After all filtering, sort by pending KPI count descending using the same `getEmployeeKpiStats` function.

3. **Progress bar component**: Add a small inline `EmployeeProgressBar` component at the bottom of the file (similar to `StatCard`) that renders a thin colored bar with fraction text.

## Technical Detail

### Progress Bar Component
```typescript
function EmployeeProgressBar({ done, inProgress, total }: { done: number; inProgress: number; total: number }) {
  if (total === 0) return null;
  const donePct = (done / total) * 100;
  const inProgressPct = (inProgress / total) * 100;
  return (
    <div className="flex items-center gap-2 w-full">
      <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
        <div className="h-full bg-green-500" style={{ width: `${donePct}%` }} />
        <!-- in-progress segment stacked after done -->
      </div>
      <span className="text-xs text-muted-foreground whitespace-nowrap">
        {done + inProgress}/{total}
      </span>
    </div>
  );
}
```

### Sorting (in `displayMembers` useMemo)
After filtering, sort the array:
```typescript
filtered?.sort((a, b) => {
  const statsA = getEmployeeKpiStats(a.id, a.relationship);
  const statsB = getEmployeeKpiStats(b.id, b.relationship);
  // Most pending first
  if (statsB.badge1 !== statsA.badge1) return statsB.badge1 - statsA.badge1;
  // More total KPIs = higher priority
  if (statsB.total !== statsA.total) return statsB.total - statsA.total;
  // Alphabetical fallback
  return (a.full_name || '').localeCompare(b.full_name || '');
});
```

## Risk Assessment

| Aspect | Risk | Mitigation |
|--------|------|-----------|
| Data impact | None | UI-only, no DB changes |
| Regression | Low | Existing badges preserved; progress bar is additive |
| Performance | None | Uses already-fetched `periodKpis` data, no new queries |
| Sorting stability | Low | Sort is deterministic with 3-tier comparison |

