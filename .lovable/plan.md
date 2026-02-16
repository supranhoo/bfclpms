

# Enhanced Org KPI Suggestions -- Smart Prioritization and Similarity Matching

## Overview

Upgrade the Org KPI Suggestions engine to surface the most actionable suggestions at the top, including KPIs that match existing org-level KPIs (even if assigned to only 1 employee), and KPIs with similar names to existing org KPIs. The suggestions table will show a "Reason" column explaining why each KPI is suggested.

---

## Current Limitations

- Only shows KPIs assigned to 3+ employees
- Sorts purely by employee count (descending)
- Misses newly assigned KPIs that match existing org KPIs (like the "Adherence to Manning Norms" case)
- No fuzzy/similarity matching

## New Suggestion Categories (Priority Order)

| Priority | Category | Badge Label | Description |
|---|---|---|---|
| 1 | Already Org-Level | "Already Org" | KPIs already marked as org-level (current behavior, kept for scope editing) |
| 2 | Exact Match -- Unmapped | "Matches Org KPI" | NEW: KPIs whose KRA+KPI name exactly matches an existing org KPI but are not yet marked org-level themselves (e.g., newly assigned to an employee). No minimum employee threshold. |
| 3 | Similar Name | "Similar to Org KPI" | NEW: KPIs whose name is similar (contains or is contained by) an existing org KPI name. No minimum employee threshold. |
| 4 | High Employee Count | "3+ Employees" | Current behavior: non-org KPIs shared by 3+ employees |

Within each category, items are sorted by employee count descending.

---

## Changes

### File: `src/hooks/useOrgKpiSuggestions.ts`

**Expand the `OrgKpiSuggestion` interface:**
- Add `suggestion_reason` field: `'already_org' | 'exact_match' | 'similar_name' | 'high_count'`
- Add `similar_to_kpi_name` field (optional): the org KPI name it's similar to
- Add `priority` field: numeric priority for sorting (1 = highest)

**Rework the query function:**

1. Fetch ALL non-org KPIs for the period (remove the 3-employee filter initially)
2. Fetch existing org-level KPIs (same as now)
3. Build three suggestion buckets:
   - **Exact match bucket**: Group non-org KPIs, and for any group whose `kra_name + kpi_name` exactly matches an existing org KPI, include it regardless of employee count, tagged as `exact_match`
   - **Similar name bucket**: For remaining non-org KPIs, check if the KPI name has significant word overlap with any existing org KPI name (using word-level intersection, requiring 2+ shared significant words). Tag as `similar_name`
   - **High count bucket**: For remaining items with 3+ employees, tag as `high_count`
4. Deduplicate (a KPI can only appear in the highest-priority bucket)
5. Sort: priority ascending, then employee count descending

**Similarity function** (simple, no external library):
```typescript
function getNameSimilarity(a: string, b: string): number {
  const stopWords = new Set(['of', 'the', 'to', 'in', 'for', 'and', 'a', 'an', 'on', 'at', 'by', 'is']);
  const wordsA = a.toLowerCase().split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w));
  const wordsB = b.toLowerCase().split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w));
  const setB = new Set(wordsB);
  const shared = wordsA.filter(w => setB.has(w));
  return shared.length;
}
```
KPIs with 2+ shared significant words are considered "similar."

### File: `src/components/admin/OrgKpiSuggestionsPanel.tsx`

- Add a **"Reason"** column to the table showing a color-coded badge:
  - Green: "Already Org" (existing behavior)
  - Blue: "Matches Org KPI"
  - Amber: "Similar to: [KPI name]"
  - Gray: "3+ Employees"
- Keep the existing checkbox, bulk mark, and action button behavior unchanged
- Update the empty state message to reflect the broader detection logic

### File: `DOCUMENTATION.md`

Document the enhanced suggestion categories and sorting logic.

---

## Technical Detail

The core sorting logic in the hook:

```typescript
// Assign priority
const getPriority = (reason: string) => {
  switch (reason) {
    case 'already_org': return 1;
    case 'exact_match': return 2;
    case 'similar_name': return 3;
    case 'high_count': return 4;
    default: return 5;
  }
};

suggestions.sort((a, b) => {
  const pDiff = a.priority - b.priority;
  if (pDiff !== 0) return pDiff;
  return b.employee_count - a.employee_count;
});
```

No database changes required. All logic is client-side within the existing hook.

### Files to Change

| File | Change |
|---|---|
| `src/hooks/useOrgKpiSuggestions.ts` | Add similarity matching, expand interface, multi-bucket prioritization |
| `src/components/admin/OrgKpiSuggestionsPanel.tsx` | Add "Reason" column with color-coded badges |
| `DOCUMENTATION.md` | Document enhanced suggestions |

