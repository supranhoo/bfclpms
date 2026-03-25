

## Default Effective Month to Current Calendar Month

### Problem
The "Assign New KRA" dialog defaults the Effective Month to whatever is stored in `system_settings` (`current_review_period`), which may not match the current calendar month. The user wants it to default to the **current month** while still allowing manual changes.

### Changes

**File: `src/components/admin/AdminKpiCreateDialog.tsx`**

1. Change the fallback in the `settings` memo from `'January'` to the current calendar month name:
   ```typescript
   const MONTH_NAMES = ['January','February',...,'December'];
   const currentMonthName = MONTH_NAMES[new Date().getMonth()];
   ```

2. Update the default for `reviewPeriod` state (line 105) and the `settings` fallback (line 65) to use `currentMonthName` instead of `'January'`.

3. Update the reset logic (line 242) to also use the current month as fallback when no system setting exists.

This is a one-line-class change — swap `'January'` → `currentMonthName` in the settings memo fallback. The `useEffect` on line 114-121 already syncs from settings, and settings already falls back to `'January'` which we change to current month. Everything else (the selector UI, year default) already works correctly.

