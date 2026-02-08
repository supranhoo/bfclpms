
# Plan: Add Month Selection to Employee Scorecards

## Summary

Enable reviewers at all levels (Manager, Auditor, Management) to change the review month/year directly within the employee scorecard view without navigating back to the employee list.

---

## Current State

The scorecard header shows a static badge:
```text
[← Back]  [Avatar] Ankit Choudhary     [February 2026]  ← Static badge
                   Senior Manager • 101785
```

The month/year is passed as read-only props from the parent page.

---

## Solution

Replace the static Badge with a compact ReviewPeriodSelector that updates the parent's state:

```text
[← Back]  [Avatar] Ankit Choudhary     [February ▼] [2026 ▼]  ← Interactive dropdowns
                   Senior Manager • 101785
```

---

## Implementation

### 1. Update Scorecard Props

Add callback props to each scorecard interface:

```tsx
interface EmployeeScorecardProps {
  employee: { ... };
  selectedPeriod: string;
  selectedYear: number;
  onPeriodChange: (period: string) => void;    // NEW
  onYearChange: (year: number) => void;        // NEW
  onBack: () => void;
  autoOpenKpiId?: string | null;
}
```

### 2. Replace Badge with Selector in Scorecard Headers

In each scorecard, replace the static Badge:

```tsx
// BEFORE
<Badge variant="outline" className="...">
  {selectedPeriod} {selectedYear}
</Badge>

// AFTER
<div className="flex items-center gap-1 shrink-0">
  <Select value={selectedPeriod} onValueChange={onPeriodChange}>
    <SelectTrigger className="h-8 w-[110px] sm:w-[130px] text-xs sm:text-sm">
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      {months.map(month => (
        <SelectItem key={month} value={month}>{month}</SelectItem>
      ))}
    </SelectContent>
  </Select>
  <Select value={selectedYear.toString()} onValueChange={(v) => onYearChange(parseInt(v))}>
    <SelectTrigger className="h-8 w-[70px] sm:w-[80px] text-xs sm:text-sm">
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      {years.map(year => (
        <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
      ))}
    </SelectContent>
  </Select>
</div>
```

### 3. Update Parent Pages to Pass Callbacks

In TeamReview.tsx, AuditPanel.tsx, and ManagementReview.tsx:

```tsx
// BEFORE
<EmployeeScorecard
  employee={selectedMember}
  selectedPeriod={selectedPeriod}
  selectedYear={selectedYear}
  onBack={() => setSelectedMember(null)}
  autoOpenKpiId={autoOpenKpiId}
/>

// AFTER
<EmployeeScorecard
  employee={selectedMember}
  selectedPeriod={selectedPeriod}
  selectedYear={selectedYear}
  onPeriodChange={setSelectedPeriod}
  onYearChange={setSelectedYear}
  onBack={() => setSelectedMember(null)}
  autoOpenKpiId={autoOpenKpiId}
/>
```

---

## Files to Modify

| File | Change |
|------|--------|
| `src/components/review/EmployeeScorecard.tsx` | Add callbacks to props, replace Badge with Select components |
| `src/components/review/AuditScorecard.tsx` | Add callbacks to props, replace Badge with Select components |
| `src/components/review/ManagementScorecard.tsx` | Add callbacks to props, replace Badge with Select components |
| `src/pages/TeamReview.tsx` | Pass `onPeriodChange` and `onYearChange` callbacks |
| `src/pages/AuditPanel.tsx` | Pass `onPeriodChange` and `onYearChange` callbacks |
| `src/pages/ManagementReview.tsx` | Pass `onPeriodChange` and `onYearChange` callbacks |
| `DOCUMENTATION.md` | Document the new feature |

---

## Visual Result

After implementation:

```text
+-------------------------------------------------------------------------------+
| [←]  [AC] Ankit Choudhary              [February ▼] [2026 ▼]                  |
|            Senior Manager • 101785                                             |
+-------------------------------------------------------------------------------+
```

- Compact dropdowns maintain the clean header design
- Reviewers can quickly switch months to compare performance
- No need to navigate back to the employee list
- State syncs back to parent page (so if user goes back and returns, the selection persists)

---

## Technical Notes

1. **Reactivity**: When period changes, all hooks that depend on `selectedPeriod` and `selectedYear` automatically refetch data
2. **State Sync**: Parent page maintains the source of truth - scorecard just calls callbacks
3. **Mobile-Friendly**: Compact Select triggers work well on small screens
4. **Dark Mode**: Select components already have dark mode support

---

## Testing Checklist

- [ ] Month dropdown works in Team Review (Manager level)
- [ ] Year dropdown works in Team Review (Manager level)
- [ ] Month dropdown works in Audit Panel (Auditor level)
- [ ] Year dropdown works in Audit Panel (Auditor level)
- [ ] Month dropdown works in Management Review (Management level)
- [ ] Year dropdown works in Management Review (Management level)
- [ ] KPI data updates when month/year is changed
- [ ] Stats cards update when month/year is changed
- [ ] Category scores update when month/year is changed
- [ ] Going back and returning preserves the selected period
- [ ] Works correctly on mobile screens
