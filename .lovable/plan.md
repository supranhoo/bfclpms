

# Plan: Standardize KPI Details Table Across All Views

## Overview

Create a unified, reusable KPI Details Table component that dynamically displays score columns based on the KPI's current status. This ensures all views (My KPIs, Team Review, Audit, Management) show consistent data with progressive column visibility.

---

## Current State Analysis

| View | Current Columns | Issues |
|------|-----------------|--------|
| **My KPIs** | Category, KRA, KPI, Target, Achieved, Rating, Status, Actions | Uses "Rating" with description labels |
| **Team Review** | Category, KRA/KPI, Target, Achieved, Self Score, Manager Score, Status, Actions | Shows only Self + Manager |
| **Audit Review** | Category, KRA/KPI, Target, Achieved, Manager Score, Auditor Score, Status, Actions | Shows Manager + Auditor, includes rating badges |
| **Management Review** | Category, KRA/KPI, Target, Achieved, Auditor Score, Mgmt Score, Status, Actions | Shows Auditor + Mgmt, includes rating badges |

**Issues Identified:**
1. Inconsistent column naming (Achieved vs Self)
2. Each view only shows 2 score columns, not the full progression
3. Rating badges with descriptions take up space unnecessarily
4. Self column shows achieved value (e.g., 95) instead of score (e.g., 4)
5. Scores shown as "X/5" format instead of just the number

---

## Target State

**Unified Column Structure:**

| Column | Description |
|--------|-------------|
| Category | Category name with color indicator |
| KRA / KPI | KRA and KPI names with clickable info |
| Target | Target value with UOM |
| Self | Employee's achieved **score** (1-5), NOT the raw achieved value |
| Manager | Manager's score (1-5) - shown if status >= self_review |
| Auditor | Auditor's score (1-5) - shown if status >= manager_check |
| Mgmt | Management's score (1-5) - shown if status >= audit |
| Status | Current KPI status badge |
| Actions | Action buttons |

**Dynamic Visibility Rules:**

| KPI Status | Visible Score Columns |
|------------|----------------------|
| kra_set | Self only |
| self_review | Self, Manager |
| manager_check | Self, Manager, Auditor |
| audit | Self, Manager, Auditor |
| management_review | Self, Manager, Auditor, Mgmt |
| approved | Self, Manager, Auditor, Mgmt |

---

## Technical Implementation

### Phase 1: Create Reusable KPI Table Component

Create new file `src/components/review/KpiDetailsTable.tsx`:

```typescript
interface KpiDetailsTableProps {
  kpis: KPI[];
  submissions: Map<string, ReviewSubmission>;
  queries?: Map<string, KpiQuery[]>;
  viewType: 'my-kpis' | 'team-review' | 'audit' | 'management';
  onReview?: (kpi: KPI) => void;
  onViewDetails?: (kpi: KPI) => void;
  onSendBack?: (kpi: KPI) => void;
  onExpand?: (kpiId: string) => void;
  expandedKpis?: Set<string>;
  selectedPeriod: string;
  selectedYear: number;
  sortConfig?: { field: string; direction: 'asc' | 'desc' };
  onSortChange?: (field: string, direction: 'asc' | 'desc') => void;
}
```

**Dynamic Score Columns:**

```typescript
// Determine visible columns based on KPI status
const getVisibleScoreColumns = (status: string) => {
  const columns = [
    { key: 'self_score', label: 'Self', visible: true },      // Uses SCORE not achieved_value
    { key: 'manager_score', label: 'Manager', visible: false },
    { key: 'auditor_score', label: 'Auditor', visible: false },
    { key: 'management_score', label: 'Mgmt', visible: false },
  ];
  
  const statusIndex = STATUS_ORDER.indexOf(status);
  
  // Manager column visible when status >= self_review
  if (statusIndex >= STATUS_ORDER.indexOf('self_review')) {
    columns[1].visible = true;
  }
  // Auditor column visible when status >= manager_check
  if (statusIndex >= STATUS_ORDER.indexOf('manager_check')) {
    columns[2].visible = true;
  }
  // Mgmt column visible when status >= audit
  if (statusIndex >= STATUS_ORDER.indexOf('audit')) {
    columns[3].visible = true;
  }
  
  return columns.filter(c => c.visible);
};
```

**Score Cell Rendering (single digit, no denominator):**

```typescript
// Render score as single digit (1, 2, 3, 4, 5) without /5 denominator
const renderScoreCell = (score: number | null) => {
  if (score === null || score === undefined) {
    return <span className="text-muted-foreground">—</span>;
  }
  return <span className="font-medium">{score}</span>;
};
```

**Self Score Mapping:**

```typescript
// For the "Self" column, we use the employee's calculated SCORE (1-5)
// NOT the raw achieved_value (e.g., 95)
// This comes from review_submissions.score field
const getSelfScore = (submission: ReviewSubmission | undefined) => {
  return submission?.score ?? null;  // Uses the calculated score (1-5)
};
```

### Phase 2: Update Scorecards to Use New Component

**Files to Update:**
- `src/pages/MyKpis.tsx` - Replace inline table with `<KpiDetailsTable viewType="my-kpis" />`
- `src/components/review/EmployeeScorecard.tsx` - Replace table with `<KpiDetailsTable viewType="team-review" />`
- `src/components/review/AuditScorecard.tsx` - Replace table with `<KpiDetailsTable viewType="audit" />`
- `src/components/review/ManagementScorecard.tsx` - Replace table with `<KpiDetailsTable viewType="management" />`

### Phase 3: Column Mapping Per View

Since different views need different action buttons, the component will support view-specific rendering:

```typescript
// Action buttons based on viewType
const getActionButtons = (kpi: KPI, viewType: string) => {
  switch (viewType) {
    case 'my-kpis':
      return kpi.status === 'kra_set' ? 'Review' : 'View';
    case 'team-review':
      return kpi.status === 'self_review' ? ['Review', 'Query', 'SendBack'] : 'View';
    case 'audit':
      return kpi.status === 'manager_check' || kpi.status === 'audit' ? ['Audit', 'SendBack'] : null;
    case 'management':
      return kpi.status === 'management_review' ? ['Approve', 'SendBack'] : null;
  }
};
```

---

## Visual Changes Summary

### Before (Management Review Table)

```text
| Category | KRA/KPI | Target | Achieved | Auditor Score      | Mgmt Score         | Status | Actions |
|----------|---------|--------|----------|--------------------|--------------------|--------|---------|
| HR       | KRA 1   | 100    | 95       | 4/5 [Exceeds Exp.] | 4/5 [Exceeds Exp.] | Done   | ...     |
```

### After (All Tables Unified)

```text
| Category | KRA/KPI | Target | Self | Manager | Auditor | Mgmt | Status | Actions |
|----------|---------|--------|------|---------|---------|------|--------|---------|
| HR       | KRA 1   | 100    | 4    | 4       | 4       | 4    | Done   | ...     |
```

**Key Changes:**
1. "Achieved" renamed to "Self" and shows **score (1-5)** not raw achieved value
2. All score columns show only single digit (1, 2, 3, 4, 5) - **no /5 denominator**
3. No rating description badges (like "Below Expectations", "Exceeds Expectations")
4. Columns appear progressively based on KPI status
5. Consistent across all views

---

## Score Data Source Mapping

| Column | Data Source Field | Description |
|--------|-------------------|-------------|
| Self | `review_submissions.score` | Employee's calculated score (1-5) |
| Manager | `review_submissions.manager_score` | Manager's assigned score (1-5) |
| Auditor | `review_submissions.auditor_score` | Auditor's assigned score (1-5) |
| Mgmt | `review_submissions.management_score` | Management's assigned score (1-5) |

**Note:** The "Self" column explicitly uses the `score` field (1-5 rating) from `review_submissions`, NOT the `achieved_value` field which stores raw values like 95, 100, etc.

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/components/review/KpiDetailsTable.tsx` | Create | Reusable unified table component |
| `src/pages/MyKpis.tsx` | Modify | Use KpiDetailsTable component |
| `src/components/review/EmployeeScorecard.tsx` | Modify | Use KpiDetailsTable component |
| `src/components/review/AuditScorecard.tsx` | Modify | Use KpiDetailsTable component |
| `src/components/review/ManagementScorecard.tsx` | Modify | Use KpiDetailsTable component |
| `DOCUMENTATION.md` | Modify | Document standardized table structure |

---

## Benefits

1. **Single Source of Truth**: One component handles all table rendering
2. **Dynamic Columns**: Score columns appear based on actual KPI status
3. **Consistent UI**: Same experience across all review stages
4. **Simplified Display**: Scores shown as single digit (1-5) without denominator or descriptions
5. **Correct Data**: Self column shows score, not raw achieved value
6. **Easy Maintenance**: Changes to table structure only need to be made in one place
7. **Better Visibility**: Any change at any level is immediately visible across all views

---

## Testing Checklist

1. **My KPIs View**
   - [ ] Table shows Self column with score (1-5), not achieved value
   - [ ] Score displayed as single digit (e.g., "4" not "4/5")
   - [ ] No rating description badges shown

2. **Team Review View**
   - [ ] Manager Score visible when status >= self_review
   - [ ] All scores shown as single digit

3. **Audit Review View**
   - [ ] All preceding level scores visible
   - [ ] Auditor column shows score as single digit

4. **Management Review View**
   - [ ] All levels visible (Self, Manager, Auditor, Mgmt)
   - [ ] All scores as single digit

5. **Cross-View Consistency**
   - [ ] Same KPI shows same data across all views
   - [ ] Column widths consistent

