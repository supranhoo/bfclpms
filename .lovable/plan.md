

## Change: Replace "Rated by System" Badge Text with Icon-Only

Remove the "Rated by System" text from the badge, keeping only the Zap icon at a slightly larger size. The icon retains the orange styling and tooltip can convey meaning on hover.

### Files Modified

#### 1. `src/components/review/KpiDetailsTable.tsx` (lines 392-397)
Replace Badge with a standalone Zap icon with orange color and a tooltip:
```tsx
{submission?.auto_advance_reason && (
  <Zap className="h-4 w-4 text-orange-500 dark:text-orange-400 shrink-0" />
)}
```

#### 2. `src/components/dashboard/MobileKpiCard.tsx` (lines 98-103)
Same change — icon only:
```tsx
{submission?.auto_advance_reason && (
  <Zap className="h-4 w-4 text-orange-500 dark:text-orange-400 shrink-0 mb-1" />
)}
```

Both files: remove `Badge` import if no longer used elsewhere (likely still used, so keep).

### No database changes.

