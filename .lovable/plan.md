

## Fix: KRA Library Search — KPIs Not Scrollable / Not Visible

### Root Cause
The `ScrollArea` in `KraLibrarySearchPanel.tsx` has `max-h-[240px]` (line 209), which is far too small to display 17 KPIs under a KRA. With each row ~28px tall, only ~8 items fit before clipping — and the remaining KPIs are hidden with no visible scrollbar.

### Fix — `src/components/admin/KraLibrarySearchPanel.tsx`

1. **Increase scroll area height**: Change `max-h-[240px]` → `max-h-[400px]` to accommodate larger result sets while still being bounded
2. **Add KPI count summary below KRA row**: Show a small hint like "Click ▸ to expand 17 KPIs" when collapsed, so it's clear there are items to reveal

### Risk Assessment
- **Data Impact**: None
- **Workflow Impact**: None  
- **Regression Risk**: Zero — CSS height change only

### Files Changed
1. **`src/components/admin/KraLibrarySearchPanel.tsx`** — Increase `ScrollArea` max-height from 240px to 400px

