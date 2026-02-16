

# Frequency Indicator Badges for Bi-Monthly and Quarterly KPIs

## Problem
Daily KPIs already show a "Daily" badge indicator across all dashboards and review views, but Bi-Monthly and Quarterly KPIs have no visible frequency indicator. Reviewers and employees cannot quickly identify which KPIs follow multi-month cycles without opening the KPI details.

## Solution
Add compact frequency badges (similar to the existing "Daily" badge) for Bi-Monthly and Quarterly KPIs across all views:
- **KPI Details Table** (desktop): Show a frequency badge next to the KRA name (like the existing `DailyBadge`)
- **KPI Header Section** (review panel): Show the frequency and current cycle label in the badges row
- **Mobile KPI Card** (review): Show a compact frequency badge next to the category
- **Dashboard Mobile KPI Card**: Show a compact frequency badge

The badges will display:
- Bi-Monthly: "Bi-Monthly" badge in a distinct color
- Quarterly: "Quarterly" badge in a distinct color
- Optionally show the cycle label (e.g., "Jan-Feb", "Q1") for additional context

## Changes

### 1. `src/components/review/KpiDetailsTable.tsx`
- Add frequency badges for Bi-Monthly and Quarterly KPIs next to the KRA name (alongside the existing `DailyBadge`)
- Include the cycle label using `getCycleLabel()` from frequencyUtils

### 2. `src/components/review/KpiHeaderSection.tsx`
- Add a frequency badge in the badges row for Bi-Monthly and Quarterly KPIs
- Show the cycle period (e.g., "Bi-Monthly: Jan-Feb" or "Quarterly: Q1")

### 3. `src/components/review/MobileKpiCard.tsx`
- Add frequency badge next to the existing "Daily" badge for Bi-Monthly and Quarterly KPIs

### 4. `src/components/dashboard/MobileKpiCard.tsx`
- Add frequency badge in the category/status row for Bi-Monthly and Quarterly KPIs

### 5. `DOCUMENTATION.md`
- Document the frequency indicator badges

## Technical Details

| File | Change |
|---|---|
| `src/components/review/KpiDetailsTable.tsx` | Add Bi-Monthly/Quarterly badges next to DailyBadge in KRA/KPI column |
| `src/components/review/KpiHeaderSection.tsx` | Add frequency + cycle label badge in header badges row |
| `src/components/review/MobileKpiCard.tsx` | Add frequency badge alongside Daily badge |
| `src/components/dashboard/MobileKpiCard.tsx` | Add frequency badge in category row |
| `DOCUMENTATION.md` | Document feature |

## Visual Examples

**Desktop KPI Table Row:**
```text
Revenue Growth [Bi-Monthly]    or    Revenue Growth [Quarterly]
Quarterly revenue target               Quarterly revenue target
```

**Review Panel Header:**
```text
[Sales] [Approved] [January 2026] [10%]  [Bi-Monthly: Jan-Feb]  [Timeline]
```

**Mobile Card:**
```text
[*] Sales  [Bi-Monthly]  [KRA Set]
```
