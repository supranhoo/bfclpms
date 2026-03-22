

## Change System-Forwarded Icon Color to Golden/Yellow

### Changes

#### 1. `src/components/review/KpiDetailsTable.tsx` (line 405)
Change `text-blue-500 dark:text-blue-400` to `text-amber-500 dark:text-amber-400` on the FastForward icon.

#### 2. `src/components/dashboard/MobileKpiCard.tsx` (line 99)
Same color change: `text-blue-500 dark:text-blue-400` → `text-amber-500 dark:text-amber-400`.

This makes the system-forwarded indicator a prominent golden/amber color, clearly distinguishable from the orange auto-advance Zap icon.

