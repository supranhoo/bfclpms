

# Bulk Data Correction Plan: Corrupted Binary/Tiered KPI Scores

**Status: IMPLEMENTED** ✅

## Implementation Summary

### Files Created/Modified

1. **`supabase/functions/fix-corrupted-binary-scores/index.ts`** — Edge function with:
   - 3-phase correction (binary achieved=5, binary achieved=0 "0=good", tiered remapping)
   - `dry_run` parameter (defaults to true for safety)
   - Full audit logging to `kpi_audit_logs` (action: `BULK_SCORE_CORRECTION`)
   - Admin role validation

2. **`src/components/admin/FixCorruptedScoresDialog.tsx`** — Admin UI with:
   - Dry-run preview showing phase breakdown, affected KPIs, employees, and levels
   - Apply button with destructive variant for safety
   - Summary cards and level-by-level breakdown

3. **`src/pages/admin/AdminDashboard.tsx`** — Added "Fix Corrupted Scores" button to Quick Actions

4. **`supabase/config.toml`** — Added `fix-corrupted-binary-scores` function config
