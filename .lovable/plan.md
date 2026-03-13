
# Plan: Scoring Health Check — Admin Diagnostic & Fix Tool — IMPLEMENTED ✅

## What Was Done

### 1. New Component: `src/components/admin/ScoringHealthCheck.tsx`
- Client-side diagnostic that scans loaded KPIs for scoring logic issues
- Detects 5 issue categories:
  - **Inverted Criteria** (Critical) — "Higher is Better" with descending thresholds or vice versa
  - **Missing Thresholds** (High) — numeric KPIs with all R5-R1 NULL
  - **Missing Qualitative Options** (High) — binary/tiered KPIs with no options
  - **Missing Target** (Medium) — numeric KPIs with NULL target_value
  - **Missing Criteria** (Medium) — KPIs with NULL criteria field
- Auto-fix for Inverted Criteria (flips direction) and Missing Criteria (auto-detects from thresholds)
- Fixes propagate to all fiscal-year siblings (July→June cycle) matching employee_id, kra_name, kpi_name
- "Fix All" bulk action per category with sequential processing and progress toasts
- Full audit logging with action `SCORING_HEALTH_FIX`
- Grouped by employee with expand/collapse, tabbed by severity

### 2. Integration: `src/pages/admin/AllKpis.tsx`
- Added "Health Check" button (ShieldCheck icon) in header button row
- Shows issue count badge on button when issues exist
- Passes `filteredKpis`, `selectedPeriod`, `selectedYear` to component

### 3. No Database Changes Required
- Uses existing `kpis` and `kpi_audit_logs` tables
- All detection runs client-side on already-fetched KPI data
