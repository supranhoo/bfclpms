

# Comprehensive UI Overhaul: Organization KPI Data Entry

This plan consolidates all three approved changes into a single execution:
1. **Vertical stacked card layout** (replace cramped 2-column grid)
2. **Remove redundant Save button** (auto-save + Propagate only)
3. **Employee Observations panel** on Org KPI cards (for Employee-scoped KPIs)

---

## Change 1: Vertical Stacked Card Layout

**Problem:** The current 2-column grid (40%/60%) feels cluttered. Save/Propagate buttons at the top-right of each card sit adjacent to the next card's buttons, causing accidental clicks.

**Solution:** Replace the `grid grid-cols-1 md:grid-cols-5` layout with a vertical `space-y` stack in three zones:

```text
+------------------------------------------------------------------+
| HEADER (full width)                                               |
|  KPI Name (bold)                                                  |
|  KRA: ...  |  [Scope]  [Target: 5]  [UOM: Number]                |
|  [Status badge]  [52 employees]  [Prev: 4.2]                     |
+------------------------------------------------------------------+
| CONTENT (adapts by scope)                                         |
|  [N/A Toggle]                                                     |
|  Org: value input + remark + file upload                          |
|  Dept/Emp: scoped entry table (full width)                        |
|  -- OR if N/A: explanation alert + reason textarea --             |
|  Emp scope: [Observations panel - collapsible]                    |
+------------------------------------------------------------------+
| FOOTER (border-t, actions at bottom)                              |
|  [History] [Impact] [Unlock] [Rollback] [Remove]                  |
|                                    [auto-save status]  [Propagate]|
+------------------------------------------------------------------+
```

### File: `src/components/admin/OrgKpiEntryCard.tsx`

- **Lines 244-616:** Remove the `grid grid-cols-1 md:grid-cols-5 gap-4` wrapper and both column divs
- Replace with a vertical `space-y-2` structure:
  - **Header block:** KPI name, KRA subtitle, metadata badges (scope icon + label, target, UOM), previous value, status + employee count -- all inline/wrapping, full width
  - **Content block:** N/A toggle, then scope-specific inputs (unchanged logic, just full-width now), lock banner
  - **Footer block (NEW):** A `div` with `border-t pt-3 mt-1 flex flex-wrap items-center justify-between gap-2` containing all action buttons -- moved from inside the right column to the card bottom

### File: `src/components/admin/OrgKpiScopedEntryTable.tsx`

- Minor: reduce row padding from `py-2` to `py-1.5` for denser display (lines 200, 219, 228, 260, 275, 298, 306, 313, 329, 342)

---

## Change 2: Remove Redundant Save Button

**Problem:** Three save mechanisms exist: auto-save (2s debounce), manual "Save" button, and "Save and Propagate". The manual Save duplicates auto-save.

**Solution:**
- Remove the `handleManualSave` function (lines 194-205) and `isSaving` state (line 116)
- Remove the "Save" button element (lines 585-588)
- Rename "Save and Propagate" to **"Propagate"** (line 593)
- Rename confirmation dialog button from "Confirm and Propagate" to **"Propagate to Scorecards"** (line 606)
- Keep auto-save timer, `saveStatus` indicator ("Saving..." / "Saved"), and `triggerAutoSave` logic unchanged
- Remove the `Save` icon import if no longer used

**Result:** Footer simplifies to:
```text
[History] [Impact] [...]          [Saving...] [Propagate]
```

---

## Change 3: Employee Observations Panel on Org KPI Cards

**Problem:** For Employee-scoped Org KPIs, observations raised by employees on the Dashboard are not visible on the data entry page. Reviewers must navigate away to check feedback before updating scores.

**Solution:** Add a collapsible "Employee Observations" section to the `OrgKpiEntryCard` for Employee-scoped KPIs. This fetches and displays observations for all KPIs matching the Org KPI's category/KRA/KPI name and the mapped employee IDs.

### How it works:

1. The `OrgKpiEntryCard` already receives `scopedRows` with employee IDs (for employee-scoped KPIs)
2. We need the actual `kpi.id` values for those employees to query observations
3. The parent page (`OrgKpiDataEntry.tsx`) will pass a new prop `employeeKpiIds` -- an array of KPI IDs belonging to the mapped employees for this Org KPI
4. Inside the card, use the existing `useObservationsByKpis(employeeKpiIds)` hook to fetch all observations
5. Display them in a collapsible section below the scoped entry table, grouped by employee, showing observation type, title, status, and the conversational thread

### Technical changes:

**File: `src/components/admin/OrgKpiEntryCard.tsx`**

- Add new optional prop: `employeeKpiIds?: string[]`
- Import `useObservationsByKpis` from `@/hooks/useKpiObservations`
- Import `Collapsible`, `CollapsibleContent`, `CollapsibleTrigger` from `@/components/ui/collapsible`
- Import `Eye`, `MessageSquare` icons
- After the scoped entry table section (line 628), add a new collapsible section:
  - Only renders when `data.scope === 'employee'` and `employeeKpiIds` has entries
  - Trigger button shows "Employee Observations" with count badge
  - Content displays observation cards grouped by employee name
  - Each observation shows: type badge (positive/concern/neutral), title, status badge, who raised it, date
  - Read-only view (no edit/delete from this page -- admins use the Dashboard for that)

**File: `src/pages/admin/OrgKpiDataEntry.tsx`**

- Build a mapping of employee KPI IDs per Org KPI identifier
- In the `buildCardData` or alongside it, query `kpis` table to find KPI records matching `(category_id, kra_name, kpi_name, employee_id IN mappedEmployeeIds, review_period, review_year)`
- Pass `employeeKpiIds` prop to `OrgKpiEntryCard`
- This uses existing data from `orgLevelData.kpis` which already has `employeeIds`

**New component: `src/components/admin/OrgKpiObservationsSummary.tsx`**

A lightweight read-only component that:
- Accepts `kpiIds: string[]`
- Calls `useObservationsByKpis(kpiIds)`
- Renders a collapsible panel with observation summaries
- Shows employee name, observation type badge, title, status, date
- Links each observation to allow navigation to the full detail on the Dashboard (optional)

---

## File: `DOCUMENTATION.md`

- Version bump to **1.45.53**
- Document: vertical card layout, Save button removal, Employee Observations panel

---

## Summary of All Files Modified

| File | Changes |
|------|---------|
| `src/components/admin/OrgKpiEntryCard.tsx` | Vertical layout, remove Save button, rename Propagate, add observations panel |
| `src/components/admin/OrgKpiScopedEntryTable.tsx` | Reduce row padding |
| `src/components/admin/OrgKpiObservationsSummary.tsx` | **NEW** -- read-only observations panel |
| `src/pages/admin/OrgKpiDataEntry.tsx` | Pass `employeeKpiIds` prop to cards |
| `DOCUMENTATION.md` | Version bump + changelog |

## Zero Functionality Lost

- Auto-save (2s debounce) -- unchanged
- Propagation logic (org/dept/employee) -- unchanged
- N/A toggle (global + per-row) -- unchanged
- All rollback, bulk rollback, unlock, remove dialogs -- unchanged
- Scoped entry table with bulk fill, progress counters, department grouping -- unchanged
- History, Impact, audit log access -- unchanged
- Lock banner for non-admin users -- unchanged
- Out-of-range validation warnings -- unchanged
- File upload on all scope types -- unchanged
- Copy from Last Period, Export, Import -- unchanged
- Data Owners and Suggestions tabs -- unchanged

