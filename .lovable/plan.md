

# Add "Final" Sorting Option to KPI Details Table

## Before (Current)

The Sort control in KPI Details has **2 buttons** (desktop) or **6 dropdown options** (compact/mobile):
- Weightage (High to Low / Low to High)
- Category (A to Z / Z to A)

```text
Sort: [Weightage ↓] [Category ↕]
```

There is no way to sort KPIs by their Final Score.

---

## After (New)

A third **"Final"** sort button is added, allowing sorting by final_score from submissions:

```text
Sort: [Weightage ↓] [Category ↕] [Final ↕]
```

- **Final (High to Low)**: KPIs with highest final scores appear first; KPIs without a final score sink to the bottom
- **Final (Low to High)**: KPIs with lowest final scores appear first; null scores still at the bottom
- Secondary sort within same final score: by weightage descending
- Compact dropdown also gets two new options: "Final Score (High to Low)" and "Final Score (Low to High)"

This applies to **all dashboards** that use the KPI Details table: My KPIs, Team Review, Audit, Management, and the main Dashboard.

---

## Technical Changes

### 1. `src/hooks/useKpiSorting.ts`

- Add `'final'` to the `KpiSortField` type union
- Accept an optional `submissionMap` parameter (so the hook can look up `final_score` per KPI)
- Add a `case 'final'` sort branch that reads `final_score` from the submission, treating null as -Infinity so they sink to the bottom
- Update the generic constraint to include `id` (needed for submission lookup)

```typescript
// New type
export type KpiSortField = 'category' | 'weightage' | 'kra' | 'final';

// Updated hook signature
export function useKpiSorting<T extends Pick<KPI, 'id' | 'kra_categories' | 'weightage' | 'kra_name'>>(
  kpis: T[] | undefined,
  options: UseKpiSortingOptions = {},
  submissionMap?: Map<string, any>
)

// New sort case
case 'final': {
  const scoreA = submissionMap?.get(a.id)?.final_score ?? -Infinity;
  const scoreB = submissionMap?.get(b.id)?.final_score ?? -Infinity;
  const result = scoreA - scoreB;
  if (result === 0) return (b.weightage || 0) - (a.weightage || 0);
  return result * direction;
}
```

### 2. `src/components/ui/KpiSortControl.tsx`

- Add `'final'` to the `sortLabels` map: `final: 'Final'`
- Add the `'final'` button to the desktop button list: `['weightage', 'category', 'final']`
- Add two new compact dropdown options: `"final-desc"` (Final Score High to Low) and `"final-asc"` (Final Score Low to High)

### 3. All consumers (5 files) -- pass `submissionMap` to `useKpiSorting`

Each file already has a `submissionMap` variable. The only change is passing it as the third argument:

| File | Current | New |
|------|---------|-----|
| `src/pages/Dashboard.tsx` | `useKpiSorting(fullyFilteredKpis)` | `useKpiSorting(fullyFilteredKpis, {}, submissionMap)` |
| `src/pages/MyKpis.tsx` | `useKpiSorting(filteredKpis)` | `useKpiSorting(filteredKpis, {}, submissionMap)` |
| `src/components/review/EmployeeScorecard.tsx` | `useKpiSorting(kpis)` | `useKpiSorting(kpis, {}, submissionMap)` |
| `src/components/review/UnifiedScorecard.tsx` | `useKpiSorting(kpis)` | `useKpiSorting(kpis, {}, submissionMap)` |

Note: `submissionMap` must be defined before the `useKpiSorting` call in each file; if the order needs adjusting, we will move the `submissionMap` creation above the hook call.

### 4. `DOCUMENTATION.md`

Update the KPI sorting documentation to list 4 sort options (Weightage, Category, KRA Name, Final Score).

