

# High-to-Low and Low-to-High Sort for "Performance by Category"

## Before
The chart has two simple toggle buttons: **[Weightage]** and **[Score]**. Clicking either always sorts in descending (high-to-low) order. There is no way to reverse the sort direction.

```text
                                    [Weightage] [Score]
Sales (40%)        ████████████████████  80%
Operations (30%)   ██████████████       65%
HR (20%)           ████████             40%
Finance (10%)      ██████               30%
```

## Changes

### 1. Update `CategorySortBy` type
**File**: `src/components/dashboard/CategoryScoreChart.tsx`

Change the type from `'weightage' | 'score'` to `'weightage-desc' | 'weightage-asc' | 'score-desc' | 'score-asc'`, with `'score-desc'` as the default.

### 2. Update sort toggle buttons
Replace the two buttons with four compact buttons grouped visually:

```text
[Weightage ↓] [Weightage ↑] [Score ↓] [Score ↑]
```

The labels will be concise:
- "Wt. High-Low" / "Wt. Low-High"
- "Score High-Low" / "Score Low-High"

### 3. Update internal sorting logic
The `sortedData` memo will handle all four directions:
- `weightage-desc`: high to low by weightage
- `weightage-asc`: low to high by weightage
- `score-desc`: high to low by score
- `score-asc`: low to high by score

### 4. Update all consumers
**Files**: `Dashboard.tsx`, `UnifiedScorecard.tsx`, `EmployeeScorecard.tsx`, `ManagementScorecard.tsx`, `AuditScorecard.tsx`

Update the `categorySortBy` state type from `'weightage' | 'score'` to the new `CategorySortBy` type with default `'score-desc'`.

### 5. Update `PerformanceReport.tsx`
Update the inline sort buttons and sorting logic to match the same four-option pattern.

### 6. Update `DOCUMENTATION.md`

## After

```text
                    [Wt. High-Low] [Wt. Low-High] [Score High-Low] [Score Low-High]
Sales (40%)        ████████████████████  80%
Operations (30%)   ██████████████       65%
HR (20%)           ████████             40%
Finance (10%)      ██████               30%
```

Clicking "Wt. Low-High" reverses to:

```text
Finance (10%)      ██████               30%
HR (20%)           ████████             40%
Operations (30%)   ██████████████       65%
Sales (40%)        ████████████████████  80%
```

## Technical Details

| File | Change |
|---|---|
| `src/components/dashboard/CategoryScoreChart.tsx` | Update type to 4 options, update buttons, update sorting logic |
| `src/pages/Dashboard.tsx` | Update state type and default |
| `src/components/review/UnifiedScorecard.tsx` | Update state type and default |
| `src/components/review/EmployeeScorecard.tsx` | Update state type and default |
| `src/components/review/ManagementScorecard.tsx` | Update state type and default |
| `src/components/review/AuditScorecard.tsx` | Update state type and default |
| `src/pages/reports/PerformanceReport.tsx` | Update inline sort buttons and logic |
| `DOCUMENTATION.md` | Document the directional sort options |

