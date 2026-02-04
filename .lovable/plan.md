
# Plan: Make Dashboard Mobile-Friendly

## Overview

Implement responsive design patterns to ensure the Dashboard displays correctly on mobile devices (< 768px) while keeping the desktop experience unchanged.

---

## Changes Summary

### 1. Dashboard.tsx - Main Changes

**Add mobile detection:**
```typescript
import { useIsMobile } from '@/hooks/use-mobile';
// ...
const isMobile = useIsMobile();
```

**Filter Bar - Stack vertically on mobile:**
- Filters stack in column layout on mobile
- Dropdowns become full-width
- KPI count text gets separate row for clarity

**Charts Grid:**
- Both charts stack vertically on mobile (full width each)
- Overall chart height reduced to 120px on mobile

**Stats Cards:**
- Change to 2-column grid on mobile: `grid-cols-2 lg:grid-cols-4`
- More compact spacing

**Review Status:**
- Convert to vertical list with inline progress bars on mobile
- Badge and count on left, progress bar fills remaining width

**KPI Table → Mobile Cards:**
- Create new `MobileKpiCard` component
- Conditionally render cards vs table based on `isMobile`
- Each card shows: Category pill, Status badge, KRA/KPI names, Metrics row, Action buttons
- Hide sort control on mobile

---

### 2. ReviewPeriodSelector.tsx - Stack Layout

**Current:** Horizontal inline layout  
**Mobile:** Stack vertically with full-width dropdowns

```typescript
<div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
  <div className="flex items-center gap-2">
    <Calendar /> Review Period:
  </div>
  <div className="flex gap-2 w-full sm:w-auto">
    <Select (month) className="flex-1 sm:w-[140px]" />
    <Select (year) className="w-[90px] sm:w-[100px]" />
  </div>
</div>
```

---

### 3. KeyStatCard.tsx - Responsive Text

- Title: `text-xs sm:text-sm`
- Value: `text-lg sm:text-2xl lg:text-3xl`
- Icon: `h-3 w-3 sm:h-4 sm:w-4`
- Subtitle: `text-[10px] sm:text-xs`
- Reduced padding on header

---

### 4. ProfileCard.tsx - Compact Mobile Layout

- Avatar: `h-12 w-12 sm:h-16 sm:w-16`
- Name: `text-base sm:text-xl`
- Info text: `text-xs sm:text-sm`
- Reduced padding: `p-4 sm:p-6`
- Smaller gaps on mobile

---

## Mobile Visual Preview

```text
MOBILE (< 768px)
┌─────────────────────────┐
│  [Avatar] Name (Code)   │
│  Designation            │
├─────────────────────────┤
│  ⚙ Filters              │
│  📅 Review Period:      │
│  [January ▼] [2026 ▼]   │
│  [All Categories     ▼] │
│  Showing 9 KPIs for...  │
├─────────────────────────┤
│  Overall Performance    │
│       [78%]             │
├─────────────────────────┤
│  Performance by Cat     │
│  ████████ HR 85%        │
│  ██████ Ops 72%         │
├─────────────────────────┤
│ [Rating][Score]         │
│ [Done]  [Pending]       │
├─────────────────────────┤
│ KRA Set ██████████ 2    │
│ Self Review ████ 1      │
│ Manager ████████████ 4  │
├─────────────────────────┤
│ ┌─ KPI Card ──────────┐ │
│ │ ● HR · Self Review  │ │
│ │ Accuracy of Docs    │ │
│ │ Measures complete...│ │
│ │ T:100 W:15% S:4.2   │ │
│ │            [ℹ] [📊] │ │
│ └─────────────────────┘ │
│ ┌─ KPI Card ──────────┐ │
│ │ ...                 │ │
│ └─────────────────────┘ │
└─────────────────────────┘
```

---

## Desktop Experience - UNCHANGED

All changes use responsive breakpoints (`sm:`, `md:`, `lg:`) so desktop layout remains exactly as it is today:
- Horizontal filter bar
- 1:5 chart ratio
- 4-column stats grid
- 5-column status grid
- Full 8-column KPI table

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/pages/Dashboard.tsx` | Add useIsMobile, responsive grids, mobile KPI cards |
| `src/components/ui/ReviewPeriodSelector.tsx` | Stack layout on mobile |
| `src/components/dashboard/KeyStatCard.tsx` | Responsive text sizing |
| `src/components/dashboard/ProfileCard.tsx` | Smaller avatar/text on mobile |
| `DOCUMENTATION.md` | Document mobile responsive patterns |

---

## Benefits

| Benefit | Impact |
|---------|--------|
| **Touch-Friendly** | Larger tap targets, stacked cards easy to scroll |
| **Readable** | No horizontal scrolling for KPI table |
| **Preserved Desktop** | No changes to current desktop experience |
| **Consistent** | Uses existing `useIsMobile` hook pattern |
