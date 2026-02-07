
# Plan: Additional Mobile Optimizations for Review System

## Summary

Based on my analysis of the current implementation, I've identified several components within the Review Sheet and scorecard view that still need mobile optimization. While the previous changes addressed the main grid layouts and footers, there are smaller but impactful areas that can be improved for a better mobile experience.

---

## Areas Identified for Optimization

### 1. DailySubmissionSummary Stats Grid
**Location:** `src/components/review/DailySubmissionSummary.tsx` (lines 164-208)

**Issue:** The stats row uses a fixed `grid-cols-4` layout which becomes cramped on mobile devices. Each stat card is too small to read comfortably.

**Fix:** Change to responsive grid `grid-cols-2 sm:grid-cols-4` so stats display in a 2x2 grid on mobile.

---

### 2. DailySubmissionSummary Table Headers
**Location:** `src/components/review/DailySubmissionSummary.tsx` (lines 211-226)

**Issue:** The table header columns ("Self (Employee)", "Manager Approved", etc.) are too wide for mobile screens, causing horizontal overflow.

**Fix:** Always use `shortLabel` on mobile-sized columns. Reduce minimum width and make "Submitted At" column hidden on mobile (it's secondary information).

---

### 3. ScoreSelector Buttons
**Location:** `src/components/review/ScoreSelector.tsx` (lines 23-42)

**Issue:** The 4-column grid for score selection buttons becomes too tight on mobile. Button text gets truncated and touch targets are small.

**Fix:** Change to `grid-cols-2 sm:grid-cols-4` layout. The 2x2 grid provides larger touch targets on mobile while maintaining the 4-column layout on desktop.

---

### 4. ManagerDailyOverrideEditor
**Location:** `src/components/review/ManagerDailyOverrideEditor.tsx`

**Issue:** The override table and score preview section need mobile optimization:
- Table columns too wide
- Score preview badges cramped
- Bulk action buttons wrap awkwardly

**Fix:** 
- Make the table scrollable with smaller column widths
- Stack score preview vertically on mobile
- Full-width bulk action buttons on mobile

---

### 5. KpiHistoryCard Compact View
**Location:** `src/components/review/KpiHistoryCard.tsx` (lines 115-134)

**Issue:** The history rows show 4 columns inline which gets cramped on very small screens.

**Fix:** Reduce font sizes further on mobile, truncate status text more aggressively.

---

### 6. Review Sheet Inputs (Textarea/Evidence)
**Location:** `src/components/review/EmployeeScorecard.tsx` (lines 676-694)

**Issue:** The input sections (remarks, evidence upload) need better mobile spacing.

**Fix:** Reduce padding and adjust label sizing for mobile.

---

## Detailed Changes

### File 1: DailySubmissionSummary.tsx

**Stats Grid (line 164):**
```tsx
// BEFORE
<div className={`grid grid-cols-4 ${compact ? 'gap-2' : 'gap-3'}`}>

// AFTER
<div className={`grid grid-cols-2 sm:grid-cols-4 ${compact ? 'gap-2' : 'gap-3'}`}>
```

**Table Container (line 211):**
```tsx
// BEFORE
<ScrollArea className={`${compact ? 'h-[200px]' : 'h-[250px]'} rounded-md border mt-3`}>

// AFTER  
<ScrollArea className={`${compact ? 'h-[200px]' : 'h-[250px]'} rounded-md border mt-3 overflow-x-auto`}>
```

**Always use short labels on mobile-sized screens (line 217-222):**
- Hide "Submitted At" column on very small screens using `hidden sm:table-cell`

---

### File 2: ScoreSelector.tsx

**Grid Layout (line 23):**
```tsx
// BEFORE
<div className="grid grid-cols-4 gap-2">

// AFTER
<div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
```

**Button padding (line 29):**
```tsx
// BEFORE
className="h-auto py-3 flex flex-col gap-1"

// AFTER
className="h-auto py-2 sm:py-3 flex flex-col gap-0.5 sm:gap-1"
```

---

### File 3: ManagerDailyOverrideEditor.tsx

**Bulk Actions (line 175-194):**
```tsx
// BEFORE
<div className="flex gap-2 flex-wrap">

// AFTER
<div className="flex flex-col sm:flex-row gap-2">
  <Button className="w-full sm:w-auto" ...>
```

**Score Preview Layout (lines 268-295):**
- Stack original and new score vertically on mobile with centered arrow

**Table Header Widths:**
- Make "Date" column narrower: `w-[60px] sm:w-[80px]`
- Hide "Status" column on mobile: `hidden sm:table-cell`

---

### File 4: KpiHistoryCard.tsx

**History Row (line 118-132):**
```tsx
// BEFORE
<div className="flex items-center justify-between py-1.5 px-2 rounded bg-muted/30">
  <span className="font-medium w-16">
  ...
  <span className="text-muted-foreground uppercase text-[10px] w-16 text-right truncate">

// AFTER
<div className="flex items-center justify-between py-1 sm:py-1.5 px-1.5 sm:px-2 rounded bg-muted/30">
  <span className="font-medium w-12 sm:w-16 text-[10px] sm:text-xs">
  ...
  <span className="text-muted-foreground uppercase text-[10px] w-10 sm:w-16 text-right truncate hidden sm:inline">
```

---

## Visual Impact

### Stats Grid (Mobile)
```
BEFORE:               AFTER:
+--+--+--+--+        +-----+-----+
|31|28| 3| 5|  →     | 31  | 28  |
+--+--+--+--+        |Days |Subm.|
(cramped)            +-----+-----+
                     |  3  |  5  |
                     |Miss |No   |
                     +-----+-----+
                     (readable)
```

### Score Selector (Mobile)
```
BEFORE:              AFTER:
+--+--+--+--+        +------+------+
|5 |4 |3 |2 |  →     |  5   |  4   |
+--+--+--+--+        | Out  |Exceed|
(tiny buttons)       +------+------+
                     |  3   |  2   |
                     |Meets |Below |
                     +------+------+
                     (touch-friendly)
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/review/DailySubmissionSummary.tsx` | Responsive stats grid, hide timestamp on mobile |
| `src/components/review/ScoreSelector.tsx` | 2x2 grid on mobile, adjusted padding |
| `src/components/review/ManagerDailyOverrideEditor.tsx` | Stack buttons, simplify table |
| `src/components/review/KpiHistoryCard.tsx` | Tighter spacing, hide status on mobile |

---

## Testing Checklist

- [ ] DailySubmissionSummary stats display in 2x2 grid on mobile
- [ ] Score selector buttons are large enough for touch on mobile
- [ ] Manager override editor is usable on mobile screens
- [ ] KPI history card is readable on mobile
- [ ] All changes maintain desktop layout as-is
- [ ] Review sheet content doesn't overflow horizontally on mobile
