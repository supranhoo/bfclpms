

# Enhance KPI Tracker Modal

## What's Changing

The KPI Tracker Sheet modal will be enhanced in three ways:

1. **Wider modal with more columns** — Expand from `max-w-4xl` to `max-w-7xl` to fit additional data columns
2. **All review-level ratings** — Add columns for Self, Manager, Skip-Level, HR PMS, Auditor, Management, and Final scores (currently only shows a single "Rating" which is the final fallback)
3. **Last 2 levels' comments** — Show remarks from the last two review stages (based on the workflow) as a collapsible row or tooltip beneath each month entry

## Technical Changes

### File: `src/components/dashboard/KpiTrackerModal.tsx`

**Data layer (monthlyData useMemo):**
- Extract all level scores from submission: `self_score`, `manager_score`, `skip_level_score`, `hr_pms_score`, `auditor_score`, `management_score`, `final_score`
- Extract last 2 levels' remarks: determine the two most recent non-null remarks from the chain (`management_remarks` → `auditor_remarks` → `hr_pms_remarks` → `skip_level_remarks` → `manager_remarks` → `self_remarks`) and store them per month entry

**UI changes:**
- Change `max-w-4xl` → `max-w-7xl` on DialogContent
- Replace single "Rating" column with 7 columns: Self, Manager, Skip, HR, Auditor, Mgmt, Final — each showing a color-coded badge (or `-` if null)
- Add a sub-row or expandable section per month showing the last 2 non-null remarks with the stage label (e.g., "Manager: Good progress on targets")
- Use horizontal scroll (`overflow-x-auto`) on the table wrapper for mobile safety
- Keep N/A badge rendering for `is_na` entries across all score columns

No database changes needed — all data is already available in the `ReviewSubmission` type.

