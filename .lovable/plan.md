

# Cumulative Performance View for All Review Levels

## Overview

Extending the YTD/QTD/Custom period selection from the Self Dashboard to all reviewer views (Manager, Audit, Management). This enables reviewers to analyze employee performance across multiple periods.

---

## Current State

| Component | Current Implementation |
|-----------|------------------------|
| EmployeeSelectorGrid | Uses `ReviewPeriodSelector` (single month only) |
| UnifiedScorecard | Uses inline `Select` dropdowns (single month only) |
| Dashboard.tsx (reviewer) | Passes `selectedPeriod` + `selectedYear` only |

---

## Changes Required

### 1. Update EmployeeSelectorGrid

**Replace** the old `ReviewPeriodSelector` with `ReviewPeriodSelectorEnhanced`:

```text
Before:
┌─────────────────────────────────────────────────────────┐
│ 🛡️ Audit Panel                    [January ▼] [2026 ▼] │
└─────────────────────────────────────────────────────────┘

After:
┌───────────────────────────────────────────────────────────────────────────┐
│ 🛡️ Audit Panel        [Month][YTD][QTD][Custom] │ [Jan▼] [2026▼] │ 3 mo │
└───────────────────────────────────────────────────────────────────────────┘
```

**Props Update:**
- Accept `periodSelection: PeriodSelection` instead of individual `selectedPeriod`/`selectedYear`
- Accept `onPeriodSelectionChange` callback

---

### 2. Update UnifiedScorecard

**Replace** the inline period selectors in the header with `ReviewPeriodSelectorEnhanced`:

```text
Before:
┌─────────────────────────────────────────────────────────────────────────┐
│ ← 👤 John Doe (EMP001)  │  📅 Review Period: [January▼] [2026▼] 9 KPIs │
└─────────────────────────────────────────────────────────────────────────┘

After:
┌───────────────────────────────────────────────────────────────────────────────────────┐
│ ← 👤 John Doe (EMP001)  │  [Month][YTD][QTD][Custom] │ [Jan▼] [2026▼] │ 3 mo │ 9 KPIs │
└───────────────────────────────────────────────────────────────────────────────────────┘
```

**Props Update:**
- Accept `periodSelection: PeriodSelection` instead of individual props
- Accept `onPeriodSelectionChange` callback

---

### 3. Update Dashboard.tsx (Reviewer Views)

**Changes:**
- Pass the full `periodSelection` state to both `EmployeeSelectorGrid` and `UnifiedScorecard`
- Handle cumulative data fetching in reviewer views (future enhancement - basic pass-through first)

---

## Implementation Phases

### Phase 1: Update Props Interface

Both components will accept:
```typescript
interface PeriodSelectionProps {
  periodSelection: PeriodSelection;
  onPeriodSelectionChange: (selection: PeriodSelection) => void;
}
```

### Phase 2: Update EmployeeSelectorGrid

- Import `ReviewPeriodSelectorEnhanced`
- Replace `ReviewPeriodSelector` with the new component
- Adjust layout to match the compact horizontal style

### Phase 3: Update UnifiedScorecard

- Import `ReviewPeriodSelectorEnhanced`
- Replace the `Card` with inline `Select` components
- Adjust header layout for the new compact filter bar

### Phase 4: Update Dashboard.tsx

- Pass `periodSelection` and `setPeriodSelection` to reviewer components
- Remove the inline period/year change handlers

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/review/EmployeeSelectorGrid.tsx` | Replace period selector, update props |
| `src/components/review/UnifiedScorecard.tsx` | Replace period selectors in header, update props |
| `src/pages/Dashboard.tsx` | Pass periodSelection to reviewer views |

---

## Visual Result

After implementation, all review levels will have the same compact period filter bar:

```text
[Month] [YTD] [QTD] [Custom]  │  [Feb ▼] [2026 ▼]  │  3 months
```

This provides a consistent user experience across all views and enables multi-period performance analysis for reviewers.

