

# Fix: Progress Bar Fraction Shows KPIs Past KRA SET (v1.46.18)

## Problem

The fraction text on employee cards (e.g., "6/28") currently shows `done + inProgress` which varies by view level. The user wants a consistent, universally meaningful number: **how many KPIs have cleared the KRA SET stage**. This helps all reviewer levels instantly understand how many KPIs are actively in the review pipeline.

## Solution

Update the `EmployeeProgressBar` component to accept a new `clearedKraSet` count and display that as the fraction numerator instead of `done + inProgress`. The `getEmployeeKpiStats` function will compute this count for every view level.

## Visual Result

```text
Before: [=========-------] 6/28   (done + inProgress)
After:  [=========-------] 27/28  (KPIs past kra_set)
```

## File to Change

**`src/components/review/EmployeeSelectorGrid.tsx`**

### 1. Add `clearedKraSet` to stats (~line 246-308)

In `getEmployeeKpiStats`, add a `clearedKraSet` field that counts KPIs where `status !== 'kra_set'`:

```typescript
const clearedKraSet = empKpis.filter(k => k.status !== 'kra_set').length;
```

This will be computed once at the top of the function and included in every return object.

### 2. Pass `clearedKraSet` through to progress bar (~line 637, 745)

Update `getProgressSegments` return and `EmployeeProgressBar` call to carry the `clearedKraSet` value.

### 3. Update `EmployeeProgressBar` fraction display (~line 968-969)

Change the fraction from `{done + inProgress}/{total}` to `{clearedKraSet}/{total}`:

```tsx
<span className="text-xs text-muted-foreground whitespace-nowrap font-medium">
  {clearedKraSet}/{total}
</span>
```

## Risk Assessment

| Aspect | Risk | Mitigation |
|--------|------|-----------|
| Data impact | None | UI-only, no DB changes |
| Regression | None | Progress bar segments unchanged; only the text label changes |
| Clarity | Positive | Consistent meaning across all view levels |

