

# Add Missing Audit & Management Summary Cards (v1.45.90)

## Problem

The hook already computes `stats.audit` and `stats.management`, but the summary cards row only renders 7 cards -- Audit and Management are missing from the UI.

## Changes

### `src/pages/reports/BottleneckReport.tsx`

1. **Add two summary cards** after HR PMS and before Avg Days:
   - "Audit" card using `stats.audit`, orange color, `Gavel` icon (already imported), clickable to filter `audit` stage
   - "Management" card using `stats.management`, red color, a suitable icon, clickable to filter `management_review` stage

2. **Update grid** from `lg:grid-cols-7` to `lg:grid-cols-9` (9 cards total):
   - Total Pending | KRA Set | Self Review | Manager | Skip-Level | HR PMS | **Audit** | **Management** | Avg Days

3. **Update skeleton loader** from 7 to 9 skeleton items to match.

### No hook changes needed -- `stats.audit` and `stats.management` are already computed and exported.

### `DOCUMENTATION.md` -- bump version to v1.45.90.

## Risk

None -- purely additive UI change, no data or logic impact.

