

# Scoring Health Check — Admin Diagnostic & Fix Tool

## What It Does

A new "Scoring Health Check" dialog accessible from the All KPIs page header. It scans all KPIs for the selected period/year, detects scoring logic issues, groups them by severity, and lets the admin fix them in bulk — directly from the UI.

## Issue Categories Detected

| Category | Detection Logic | Severity |
|----------|----------------|----------|
| **Inverted Criteria** | "Higher is Better" but R5 < R1 (or vice versa) — thresholds go in the wrong direction | Critical |
| **Missing Thresholds** | Numeric KPIs (uom_type = numeric or NULL) with all R5-R1 = NULL | High |
| **Missing Qualitative Options** | Binary/tiered KPIs with NULL or empty `qualitative_options` | High |
| **Missing Target** | Numeric KPIs with target_value = NULL | Medium |
| **Missing Criteria** | KPIs with criteria = NULL (engine defaults to "Higher is Better") | Medium |

## UI Design

1. **Trigger**: New "Health Check" button (with `ShieldCheck` icon) in the header button row on the All KPIs page, next to Export/Copy/Bulk Assign buttons.

2. **Dialog**: Opens a full-width dialog with:
   - Summary banner: "X issues found across Y KPIs" with severity breakdown
   - Tabbed sections by severity (Critical / High / Medium)
   - Each issue row shows: Employee name, KRA, KPI name, current config, suggested fix
   - "Fix" button per row + "Fix All" button per category

3. **Fix Actions**:
   - **Inverted Criteria**: Flips `criteria` from "Higher is Better" ↔ "Lower is Better" on the KPI (+ all fiscal siblings via bulk-apply logic)
   - **Missing Criteria**: Sets criteria based on threshold direction analysis (auto-detect)
   - Uses existing `useAdminUpdateKpi` mutation for individual fixes
   - "Fix All" iterates through affected KPIs sequentially with toast progress

## Files

### New Files
1. **`src/components/admin/ScoringHealthCheck.tsx`** — Main dialog component
   - Accepts `kpis: KPI[]` and `selectedPeriod/selectedYear` props
   - Client-side analysis logic (no new DB queries needed — works on already-fetched KPI data)
   - Detection functions for each issue category
   - Fix handlers using existing `useAdminUpdateKpi` + bulk-apply to fiscal siblings
   - Grouped display with expand/collapse per employee

### Modified Files
2. **`src/pages/admin/AllKpis.tsx`**
   - Import `ScoringHealthCheck` component
   - Add state for dialog open/close
   - Add "Health Check" button in header row
   - Pass `kpis`, `selectedPeriod`, `selectedYear` props

## Key Detection Logic (runs client-side on loaded KPIs)

```text
For each KPI where uom_type is 'numeric' or NULL:
  1. Parse R5 and R1 as numbers
  2. If both exist:
     - If criteria = "Higher is Better" and R5 < R1 → INVERTED
     - If criteria = "Lower is Better" and R5 > R1 → INVERTED
  3. If all R5-R1 are NULL → MISSING_THRESHOLDS
  4. If criteria is NULL → MISSING_CRITERIA
  5. If target_value is NULL → MISSING_TARGET

For each KPI where uom_type = 'binary' or 'tiered':
  6. If qualitative_options is NULL or empty → MISSING_OPTIONS
```

## Fix Propagation

When fixing a KPI (e.g., flipping criteria), the component queries for all fiscal-year siblings (same employee, KRA, KPI name, July→June cycle) and updates them all — consistent with the existing bulk-apply pattern used in `AdminKpiEditDialog`.

