
# Plan: Mobile-Optimized Review Sheet for All Levels

## Problem Summary

When you tap a KPI to open the Review Sheet (on Team Review, Audit Panel, or Management Review), the sheet content is not optimized for mobile screens:

- The 4-column "Review Journey" grid gets cramped and unreadable
- Form inputs and buttons are too small for touch
- Content requires horizontal scrolling
- Footer buttons are crowded together

## Solution Overview

Make the Review Sheet and its child components fully responsive by:

1. Converting the 4-column journey grid to 2x2 on mobile
2. Stacking the KPI panel sections vertically on mobile
3. Making footer buttons full-width and stacked on mobile
4. Adding proper touch-friendly spacing throughout

---

## Components to Update

| Component | Issue | Fix |
|-----------|-------|-----|
| `KpiJourneySection` | Fixed 4-column grid | 2 columns on mobile (`grid-cols-2 lg:grid-cols-4`) |
| `KpiReviewPanel` | Collapses at `lg` only | Collapse at `md` (`md:grid-cols-5`) |
| `ReviewStageCard` | Content is okay but needs padding | Reduce padding on mobile |
| `EmployeeScorecard` | Footer buttons cramped | Stack buttons vertically on mobile |
| `AuditScorecard` | Same footer issue | Same fix |
| `ManagementScorecard` | Same footer issue | Same fix |
| `KpiHeaderSection` | Badges can overflow | Better wrapping |
| `KpiMetricsSection` | Metrics grid tight | Single column on very small screens |

---

## Detailed Changes

### 1. KpiJourneySection.tsx

**Current (line 132-133):**
```tsx
const gridCols = 'grid-cols-4';
<div className={`grid ${gridCols} gap-3`}>
```

**Fixed:**
```tsx
// Remove const, use responsive classes directly
<div className="grid grid-cols-2 lg:grid-cols-4 gap-2 lg:gap-3">
```

This creates a 2x2 grid on mobile that expands to 1x4 on larger screens.

---

### 2. KpiReviewPanel.tsx

**Current (line 59):**
```tsx
<div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
```

**Fixed:**
```tsx
<div className="grid grid-cols-1 md:grid-cols-5 gap-3 md:gap-4">
```

This collapses to single column below `md` (768px) instead of `lg` (1024px).

---

### 3. ReviewStageCard.tsx

**Current (line 60-69):**
```tsx
<div className={cn('p-3 rounded-lg border transition-all', ...)}>
```

**Fixed:**
```tsx
<div className={cn('p-2 sm:p-3 rounded-lg border transition-all', ...)}>
```

Also update inner elements:
- Icon size: `h-5 w-5 sm:h-6 sm:w-6`
- Title text: Already `text-xs` which is fine
- Score badge: Reduce size on mobile

---

### 4. EmployeeScorecard.tsx - Footer (lines 725-796)

**Current:**
```tsx
<SheetFooter className="flex-wrap gap-2 sm:justify-between">
  {/* Two div groups with multiple buttons */}
</SheetFooter>
```

**Fixed:**
```tsx
<SheetFooter className="flex-col sm:flex-row gap-2 sm:justify-between mt-4 pb-4">
  {selectedKpi?.status === 'self_review' ? (
    <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
      {/* Buttons stack vertically on mobile */}
    </div>
    <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
      {/* Action buttons stack vertically on mobile */}
    </div>
  ) : (
    <Button variant="outline" className="w-full sm:w-auto" onClick={...}>
      Close
    </Button>
  )}
</SheetFooter>
```

Also add `className="w-full sm:w-auto"` to all buttons inside.

---

### 5. AuditScorecard.tsx - Footer

Apply the same footer pattern as EmployeeScorecard.

---

### 6. ManagementScorecard.tsx - Footer

Apply the same footer pattern.

---

### 7. KpiHeaderSection.tsx

**Current (lines 33-56):**
```tsx
<div className="flex flex-wrap items-center gap-2">
  <Badge>...</Badge>
  {/* Multiple badges */}
</div>
```

**Fixed:**
```tsx
<div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
```

Reduce gap on mobile for better fit.

---

### 8. KpiMetricsSection.tsx

**Current (line 86):**
```tsx
<div className="grid grid-cols-2 gap-3 text-sm">
```

**Fixed:**
```tsx
<div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 text-sm">
```

Stack vertically on very small screens.

---

## File Changes Summary

| File | Change Type | Lines Affected |
|------|-------------|----------------|
| `src/components/review/KpiJourneySection.tsx` | Modify | ~132-144 |
| `src/components/review/KpiReviewPanel.tsx` | Modify | ~59 |
| `src/components/review/ReviewStageCard.tsx` | Modify | ~60-75 |
| `src/components/review/EmployeeScorecard.tsx` | Modify | ~725-796 (footer) |
| `src/components/review/AuditScorecard.tsx` | Modify | Footer section |
| `src/components/review/ManagementScorecard.tsx` | Modify | Footer section |
| `src/components/review/KpiHeaderSection.tsx` | Modify | ~24, 34 |
| `src/components/review/KpiMetricsSection.tsx` | Modify | ~86 |
| `DOCUMENTATION.md` | Update | Mobile UI section |

---

## Visual Comparison

### Before (Mobile)
```
+---------------------------+
| [Cat] [Status] [Period].. | <- Badges overflow
|---------------------------|
| KRA Name                  |
| KPI Name                  |
|---------------------------|
| [S][M][A][Mg] <- 4 tiny   | <- Unreadable columns
|   columns squeezed        |
|---------------------------|
| [Cancel][Back][Query]     | <- Buttons cramped
| [Draft][Approve]          |
+---------------------------+
```

### After (Mobile)
```
+---------------------------+
| [Category Badge]          |
| [Status] [Period] [Wt%]   | <- Wrapped nicely
|---------------------------|
| KRA Name                  |
| KPI Name                  |
|---------------------------|
| [Self]    [Manager]       | <- 2x2 grid
| [Auditor] [Mgmt]          |    readable
|---------------------------|
| [Cancel]                  | <- Full width
| [Send Back]               |    stacked
| [Raise Query]             |    buttons
| [Save Draft]              |
| [Approve]                 |
+---------------------------+
```

---

## Testing Checklist

- [ ] Team Review sheet opens correctly on mobile
- [ ] Review Journey shows as 2x2 grid on mobile, 4 columns on desktop
- [ ] Footer buttons are full-width and stacked on mobile
- [ ] All form inputs (score, remarks, evidence) are usable on mobile
- [ ] Audit Panel sheet has same mobile-friendly layout
- [ ] Management Review sheet has same mobile-friendly layout
- [ ] N/A confirmation card displays properly on mobile
- [ ] Daily submission summary is scrollable on mobile
- [ ] No horizontal scroll required on any view
