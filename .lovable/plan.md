

# Fix Reporting Manager Placement in KPI Header

## Issue
The Reporting Manager label is currently nested inside the badges `justify-between` div, which disrupts the existing badge layout and looks misaligned. Users familiar with the old layout will find it confusing.

## Fix
Move the Reporting Manager display **out** of the badges row and into its own dedicated row directly below, right-aligned. This restores the original badge layout while giving the manager name a clean, distinct position.

### File: `src/components/review/KpiHeaderSection.tsx`

**Current structure** (simplified):
```
<div badges-row justify-between>
  <Badge category />
  <div badges-right>
    ...badges + Timeline...
  </div>
  {/* Manager is INSIDE this div — breaks layout */}
  <div>👤 Reporting Manager: ...</div>
</div>
```

**New structure:**
```
<div badges-row justify-between>
  <Badge category />
  <div badges-right>
    ...badges + Timeline...
  </div>
</div>
{/* Manager on its OWN row, right-aligned */}
{managerName && (
  <div className="text-xs text-muted-foreground text-right -mt-1 mb-2">
    👤 Reporting Manager: {managerName}
  </div>
)}
```

Move lines 92-97 out of the badges `div` (which closes at current line 98) and place them as a sibling element between the badges row and the Org KPI row. Use `-mt-1` to keep it visually tight beneath the badges row. This is a 6-line move with no logic changes.

