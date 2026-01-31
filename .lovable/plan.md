
# Plan: Integrate KpiDetailsTable into My KPIs Page

## Overview

Replace the inline KPI table in `MyKpis.tsx` (lines 734-958) with the unified `KpiDetailsTable` component to ensure consistency with Team Review, Audit, and Management views.

---

## Current State

The `MyKpis.tsx` page has a custom inline table with the following columns:

| Current Column | Issue |
|----------------|-------|
| Category | Separate column |
| KRA | Separate column |
| KPI | Separate column |
| Target | OK |
| Achieved | Shows raw achieved_value, not score |
| Rating | Shows score with description badge (e.g., "4 - Exceeds Expectations") |
| Status | OK |
| Actions | Different button structure |

**Lines to replace:** ~734-958 (inline Table component)

---

## Target State

Use `<KpiDetailsTable viewType="my-kpis" />` with unified columns:

| New Column | Description |
|------------|-------------|
| Category | Category with org-level indicator |
| KRA / KPI | Combined with Daily badge |
| Target | Target value with UOM |
| Self | Employee's score (1-5), single digit |
| Manager | Manager score (if visible) |
| Auditor | Auditor score (if visible) |
| Mgmt | Management score (if visible) |
| Status | Status badge with query count |
| Actions | Review/View buttons |

---

## Implementation Details

### Step 1: Add Import

```typescript
import { KpiDetailsTable } from '@/components/review/KpiDetailsTable';
```

### Step 2: Add Required State and Handlers

The `MyKpis.tsx` page needs to provide:

1. **`expandedKpis` state** - For daily KPI expand/collapse:
```typescript
const [expandedKpis, setExpandedKpis] = useState<Set<string>>(new Set());
const toggleExpand = (kpiId: string) => {
  setExpandedKpis(prev => {
    const next = new Set(prev);
    if (next.has(kpiId)) next.delete(kpiId);
    else next.add(kpiId);
    return next;
  });
};
```

2. **`isKpiFrequencyLocked` function** - Already exists in the file

3. **`openTimeline` as `onShowLogic`** - Reuse existing timeline handler

### Step 3: Replace Inline Table

Replace lines 734-958 with:

```tsx
<div className="rounded-lg border overflow-hidden">
  <KpiDetailsTable
    kpis={sortedKpis}
    submissionMap={submissionMap}
    viewType="my-kpis"
    selectedPeriod={selectedPeriod}
    selectedYear={selectedYear}
    onReview={openReviewDialog}
    onView={openReviewDialog}
    onShowLogic={openTimeline}
    expandedKpis={expandedKpis}
    onToggleExpand={toggleExpand}
    getOrgKpiValue={getOrgKpiValue}
    isKpiLocked={isKpiFrequencyLocked}
  />
</div>
```

---

## What Changes for Users

| Before | After |
|--------|-------|
| Separate KRA and KPI columns | Combined "KRA / KPI" column |
| "Achieved" shows raw value (95) | "Self" shows score (4) |
| "Rating" shows "4 - Exceeds Expectations" | Score shown as single digit (4) |
| Fixed columns | Dynamic columns based on status |

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/pages/MyKpis.tsx` | Import component, add state, replace table |
| `DOCUMENTATION.md` | Update to reflect My KPIs uses unified table |

---

## Cleanup

Remove unused imports from MyKpis.tsx after refactoring:
- `Table, TableBody, TableCell, TableHead, TableHeader, TableRow` (if no longer needed elsewhere in file)
- `Clock` icon (used in old actions column)

---

## Testing Checklist

1. **My KPIs Table Display**
   - [ ] Self column shows score (1-5), not achieved value
   - [ ] Score displayed as single digit without /5
   - [ ] No rating description badges shown
   - [ ] Dynamic columns appear based on KPI status

2. **Actions Work Correctly**
   - [ ] "Review" button opens review dialog for kra_set status
   - [ ] "View" button opens dialog for submitted KPIs
   - [ ] Timeline button (KPI click) opens timeline modal

3. **Daily KPIs**
   - [ ] Daily badge shown
   - [ ] Expand/collapse button works
   - [ ] Inline daily summary row displays

4. **Org-Level KPIs**
   - [ ] Scope icons display correctly
   - [ ] Tooltip shows scope info

5. **Locked KPIs**
   - [ ] Locked badge displays for frequency-locked KPIs
   - [ ] Row has reduced opacity
