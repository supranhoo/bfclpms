

# RCA: Org KPIs Not Visible on Gaurav Budhia's "My Dashboard"

## Root Cause

**This is a data assignment gap, not a code bug.**

Gaurav Budhia (`director@bfclalloys.com`, role: `management`) has **zero KPIs assigned** for January 2026. He only has 1 KPI record in the entire system (from September 2025).

When Gaurav switches to the **Management Review** view on the dashboard, he can see his direct reports' KPIs (including their org-level KPIs). But when he switches to **"My Dashboard"** (self-view), the system queries `kpis WHERE employee_id = Gaurav's ID` and returns nothing -- because no KPIs (org or otherwise) have ever been assigned to his profile for this period.

**None of the 40+ org-level KPIs in the system for January 2026 are mapped to Gaurav.**

## Why Reviewer Dashboards Show Org KPIs

- Reviewer dashboards (Team, Management) query KPIs by the **selected employee's** ID, not the reviewer's own ID
- So when Gaurav reviews Dippendu Das (22 KPIs, 1 org), he sees Dippendu's org KPIs
- This creates the perception that "other dashboards have org KPIs but my dashboard doesn't"

## Resolution Options

### Option A: Assign KPIs to Gaurav (Admin Action)
An admin needs to assign KPIs (including org-level ones) to Gaurav Budhia for January 2026, either through:
- The KRA Library bulk assignment
- The Org KPI Mapping Dashboard (to add him to relevant org KPIs)
- The Import Data page

### Option B: Code Enhancement -- Auto-display Org KPIs on Self Dashboard
Add a secondary display on the self-dashboard that shows "Organization KPIs" relevant to the user's department/division even if they're not explicitly assigned to the employee. This would be a **new feature**, not a bug fix.

## Secondary Finding: UI Parity Gap

The self-dashboard's KPI table (in `Dashboard.tsx`) does **not** show org KPI badges ("Org KPI -- Organization", "Data by: [Name]") that are shown on reviewer dashboards via `KpiDetailsTable.tsx`. If org KPIs were assigned to Gaurav, they would appear in the table but without the visual indicators that identify them as org-level KPIs.

### Fix for UI Parity
Add org KPI badges to the self-dashboard table rows, matching the visual treatment in the reviewer `KpiDetailsTable` component. This involves adding `Building2`/`Users`/`User` icons and the "Org KPI" / "Data by:" badges to Dashboard.tsx table rows.

## Recommended Actions

1. **Immediate**: Admin assigns relevant org KPIs to Gaurav via the Org KPI Mapping Dashboard
2. **Code fix**: Add org KPI badge display to the self-dashboard table for visual consistency
3. **Documentation**: Update version to 1.45.49

## Technical Details

### Files to Modify
- `src/pages/Dashboard.tsx` -- Add org KPI badges in the self-view table rows (both desktop table and mobile card)
- `DOCUMENTATION.md` -- Version bump

### Changes in Dashboard.tsx
- Import `Building2`, `Users`, `User` icons (already imported but used elsewhere)
- In the desktop table's Category cell (~line 720): add org scope icon with tooltip (matching KpiDetailsTable pattern)
- In the desktop table's KRA/KPI cell (~line 729): add "Org KPI -- [scope]" badge and "Data by: [Name]" badge
- Pass `getOrgKpiValue` result into badge display

